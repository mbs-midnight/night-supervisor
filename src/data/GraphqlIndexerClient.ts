/**
 * GraphqlIndexerClient.ts
 *
 * Live IndexerClient for a Midnight indexer serving GraphQL schema v4
 * (Stagenet: indexer.stagenet.shielded.tools). Uses only the platform fetch
 * and WebSocket APIs with a hand-rolled graphql-transport-ws handshake, so it
 * runs identically in the browser and under Node 22.
 *
 * Data flow
 *
 *   connect(viewingKey)  ──HTTP──▶  sessionId
 *        │
 *        ├─ WS sub "events":   zswapLedgerEvents(id)          (chain-wide)
 *        │      └─▶ ShieldedDecryptor.replay  ─▶ per-tx coin deltas
 *        │             └─▶ HTTP transactions(offset:{hash})  (block, status, fee)
 *        │                    └─▶ ViewingUpdate{RelevantTransaction}
 *        └─ WS sub "scan":     shieldedTransactions(sessionId) (viewing-key session)
 *               └─▶ ShieldedTransactionsProgress ─▶ session.indexerScan
 *
 * Why two subscriptions. The viewing-key session is the supervisory contract:
 * the indexer holds only the encryption secret key and tells us which
 * transactions concern the wallet. On today's Stagenet indexer, however, that
 * per-key relevance scan advances at roughly ten commitments per minute and
 * has not been observed to deliver RelevantTransaction items, while the
 * chain-wide event stream replays the whole chain (a few thousand events) in
 * well under a minute. The wallet SDK 2.0 made the same choice: its shielded
 * sync is built on zswapLedgerEvents. So decryption is driven by the event
 * stream and the session is surfaced as progress information.
 *
 * Resilience. The socket reconnects with exponential backoff and resumes the
 * event stream from the last applied id. The indexer's cursor is inclusive, so
 * the boundary event is redelivered and filtered out; replaying it would fail
 * with a non-linear Merkle insertion.
 */

import type {
  IndexerClient,
  SessionStateHandler,
  WalletEventHandler,
} from '../lib/indexer-client';
import type {
  ProgressUpdate,
  ViewingUpdate,
  WalletEvent,
  WalletSession,
} from '../types';
import {
  deltaToTransactions,
  mapResultStatus,
  type RawLedgerEvent,
  type ShieldedDecryptor,
  type TransactionDelta,
  type TransactionMeta,
} from './ledger-decrypt';

export interface GraphqlIndexerConfig {
  /** e.g. https://indexer.stagenet.shielded.tools/api/v4/graphql */
  httpUrl: string;
  /** e.g. wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws */
  wsUrl: string;
  /** Holds the wallet's zswap keys and local state. */
  decryptor: ShieldedDecryptor;
  /** Max events replayed per WASM call. Default 256. */
  batchSize?: number;
  /** Set false to skip the viewing-key session (events only). Default true. */
  useViewingKeySession?: boolean;
}

const EVENTS_SUB_ID = 'events';
const SCAN_SUB_ID = 'scan';

const EVENTS_QUERY = `subscription ZswapEvents($id: Int) {
  zswapLedgerEvents(id: $id) { id raw maxId protocolVersion }
}`;

const SCAN_QUERY = `subscription ShieldedScan($sid: HexEncoded!, $idx: Int) {
  shieldedTransactions(sessionId: $sid, index: $idx) {
    __typename
    ... on ShieldedTransactionsProgress {
      highestZswapEndIndex
      highestCheckedZswapEndIndex
      highestRelevantZswapEndIndex
    }
    ... on RelevantTransaction {
      transaction { hash zswapEndIndex }
    }
  }
}`;

const TX_META_QUERY = `query TxMeta($hash: HexEncoded!) {
  transactions(offset: { hash: $hash }) {
    __typename
    hash
    block { height hash timestamp }
    ... on RegularTransaction {
      fee
      transactionResult { status }
      contractActions { address }
    }
  }
}`;

interface EventsPayload {
  zswapLedgerEvents: { id: number; raw: string; maxId: number; protocolVersion: number };
}

interface ScanPayload {
  shieldedTransactions:
    | {
        __typename: 'ShieldedTransactionsProgress';
        highestZswapEndIndex: number;
        highestCheckedZswapEndIndex: number;
        highestRelevantZswapEndIndex: number;
      }
    | { __typename: 'RelevantTransaction'; transaction: { hash: string; zswapEndIndex: number } };
}

interface TxMetaPayload {
  transactions: Array<{
    __typename: string;
    hash: string;
    block: { height: number; hash: string; timestamp: number };
    fee?: string;
    transactionResult?: { status: string };
    contractActions?: Array<{ address: string }>;
  }>;
}

type WsMessage = { type: string; id?: string; payload?: unknown };

export class GraphqlIndexerClient implements IndexerClient {
  private session: WalletSession | null = null;
  private ws: WebSocket | null = null;
  private eventHandlers = new Set<WalletEventHandler>();
  private sessionHandlers = new Set<SessionStateHandler>();

  private walletAddress = '';
  private closedByUser = false;
  /** Incremented on every connect()/disconnect(); stale async continuations bail out. */
  private generation = 0;
  /**
   * One in-flight `connect` mutation per viewing key. React StrictMode mounts
   * effects twice in development, and two concurrent connects for the same
   * key have been observed to make the indexer reject one of them.
   */
  private connectInFlight: { viewingKey: string; promise: Promise<string | null> } | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Last event id applied to the local state (-1 = nothing yet). */
  private lastAppliedId = -1;
  /** Last event id accepted into the queue; drops duplicates from overlapping sockets. */
  private lastQueuedId = -1;
  private chainMaxId = 0;
  private pending: RawLedgerEvent[] = [];
  private flushScheduled = false;
  private processing: Promise<void> = Promise.resolve();
  private lastProgressEmit = 0;

  private metaCache = new Map<string, Promise<TransactionMeta>>();

  constructor(private readonly config: GraphqlIndexerConfig) {}

  // ---------------------------------------------------------------- public

  async connect(viewingKey: string, walletAddress: string): Promise<WalletSession> {
    const gen = ++this.generation;
    this.walletAddress = walletAddress;
    this.closedByUser = false;
    this.closeSocket();

    this.session = {
      sessionId: '',
      viewingKeyFingerprint: `${viewingKey.slice(0, 22)}…${viewingKey.slice(-6)}`,
      walletAddress,
      connectedAt: new Date().toISOString(),
      status: 'connecting',
      highestIndex: 0,
      highestRelevantWalletIndex: 0,
      eventsReplayed: 0,
    };
    this.notifySession();

    if (this.config.useViewingKeySession !== false) {
      if (this.connectInFlight?.viewingKey !== viewingKey) {
        this.connectInFlight = { viewingKey, promise: this.openViewingKeySession(viewingKey) };
      }
      const sessionId = await this.connectInFlight.promise;
      if (gen !== this.generation) {
        // disconnect() or a newer connect() superseded this call; the newer
        // call shares the same session promise, so nothing to release here.
        return this.session!;
      }
      if (sessionId) {
        this.patchSession({ sessionId });
      } else {
        // The viewing-key session is informational; decryption runs on the
        // event stream regardless, so degrade rather than fail.
        this.patchSession({ sessionId: 'events-only' });
      }
    } else {
      this.patchSession({ sessionId: 'events-only' });
    }

    await this.openSocket(gen);
    return this.session!;
  }

  /** `connect` mutation with one retry; null when the indexer refuses. */
  private async openViewingKeySession(viewingKey: string): Promise<string | null> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await this.gql<{ connect: string }>(
          'mutation Connect($vk: ViewingKey!) { connect(viewingKey: $vk) }',
          { vk: viewingKey },
        );
        return data.connect;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 750));
      }
    }
    console.warn('[indexer] viewing-key connect failed; continuing with events only', lastErr);
    this.patchSession({ lastError: `viewing-key session unavailable: ${String(lastErr)}` });
    return null;
  }

  subscribe(handler: WalletEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onSessionUpdate(handler: SessionStateHandler): () => void {
    this.sessionHandlers.add(handler);
    if (this.session) handler(this.session);
    return () => this.sessionHandlers.delete(handler);
  }

  async disconnect(): Promise<void> {
    this.generation++;
    this.closedByUser = true;
    this.connectInFlight = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket();
    if (this.session && this.session.sessionId && this.session.sessionId !== 'events-only') {
      try {
        await this.gql(
          'mutation Disconnect($id: HexEncoded!) { disconnect(sessionId: $id) }',
          { id: this.session.sessionId },
        );
      } catch (err) {
        console.warn('[indexer] disconnect mutation failed', err);
      }
    }
    if (this.session) this.patchSession({ status: 'disconnected' });
    this.eventHandlers.clear();
    this.sessionHandlers.clear();
  }

  // ------------------------------------------------------------- transport

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.config.httpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`indexer HTTP ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
    if (!body.data) throw new Error('indexer returned no data');
    return body.data;
  }

  private closeSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: EVENTS_SUB_ID, type: 'complete' }));
        ws.send(JSON.stringify({ id: SCAN_SUB_ID, type: 'complete' }));
      }
    } catch {
      /* socket may already be closed */
    }
    ws.close();
  }

  private openSocket(gen: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      if (gen !== this.generation) {
        resolve();
        return;
      }
      this.closeSocket();
      const ws = new WebSocket(this.config.wsUrl, 'graphql-transport-ws');
      this.ws = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }));

      ws.onmessage = (e) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (this.ws !== ws) return; // superseded socket
        if (msg.type === 'connection_ack') {
          this.reconnectAttempt = 0;
          this.subscribeAll(ws);
          this.patchSession({
            status: this.lastAppliedId >= this.chainMaxId && this.chainMaxId > 0 ? 'live' : 'syncing',
            lastError: undefined,
          });
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (msg.type === 'next') {
          const data = (msg.payload as { data?: unknown } | undefined)?.data;
          if (msg.id === EVENTS_SUB_ID && data) this.onEvent(data as EventsPayload);
          else if (msg.id === SCAN_SUB_ID && data) this.onScan(data as ScanPayload);
        } else if (msg.type === 'error') {
          const text = JSON.stringify(msg.payload);
          console.error('[indexer] subscription error', msg.id, text);
          if (msg.id === SCAN_SUB_ID) {
            // The viewing-key session is informational; keep the event stream alive.
            this.patchSession({ lastError: `viewing-key session: ${text}` });
          } else {
            this.patchSession({ status: 'error', lastError: text });
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'complete' && msg.id === EVENTS_SUB_ID) {
          // The server ended the event stream; treat like a drop and resume.
          console.warn('[indexer] event subscription completed by server; resubscribing');
          ws.close();
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket connection to ${this.config.wsUrl} failed`));
        }
      };

      ws.onclose = (e) => {
        if (this.ws !== ws) return; // we replaced or closed it deliberately
        this.ws = null;
        if (this.closedByUser || gen !== this.generation) return;
        console.warn(`[indexer] socket closed code=${e.code} reason=${e.reason || '-'} lastApplied=${this.lastAppliedId}`);
        this.scheduleReconnect(`code ${e.code}${e.reason ? ` ${e.reason}` : ''}`);
      };
    });
  }

  private subscribeAll(ws: WebSocket): void {
    // Inclusive cursor: resume at the last applied id; onEvent drops ids <= lastAppliedId.
    ws.send(
      JSON.stringify({
        id: EVENTS_SUB_ID,
        type: 'subscribe',
        payload: {
          query: EVENTS_QUERY,
          variables: { id: this.lastAppliedId < 0 ? null : this.lastAppliedId },
        },
      }),
    );
    const sid = this.session?.sessionId;
    if (this.config.useViewingKeySession !== false && sid && sid !== 'events-only') {
      ws.send(
        JSON.stringify({
          id: SCAN_SUB_ID,
          type: 'subscribe',
          payload: { query: SCAN_QUERY, variables: { sid, idx: 0 } },
        }),
      );
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    const gen = this.generation;
    this.patchSession({
      status: 'connecting',
      lastError: `socket closed (${reason}); reconnecting in ${delay / 1000}s`,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUser || gen !== this.generation) return;
      this.openSocket(gen).catch((err) => {
        console.warn('[indexer] reconnect failed', err);
        this.scheduleReconnect(String(err));
      });
    }, delay);
  }

  // --------------------------------------------------------------- events

  private onEvent(data: EventsPayload): void {
    const ev = data.zswapLedgerEvents;
    this.chainMaxId = Math.max(this.chainMaxId, ev.maxId);
    if (ev.id <= this.lastAppliedId) return; // redelivered boundary event
    if (ev.id <= this.lastQueuedId) return; // duplicate from an overlapping socket
    this.lastQueuedId = ev.id;
    this.pending.push({ id: ev.id, raw: ev.raw, protocolVersion: ev.protocolVersion });
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      // Let the socket drain a burst before spending a WASM call on it.
      setTimeout(() => {
        this.flushScheduled = false;
        this.processing = this.processing.then(() => this.flush()).catch((err) => {
          console.error('[indexer] replay failed', err);
          this.patchSession({ status: 'error', lastError: String(err) });
        });
      }, 0);
    }
  }

  private async flush(): Promise<void> {
    const batchSize = this.config.batchSize ?? 256;
    while (this.pending.length > 0) {
      const batch = this.pending.splice(0, batchSize);
      // At the tip nothing more is coming, so flush the held-back tail too.
      const final = this.pending.length === 0 && this.lastQueuedId >= this.chainMaxId;
      const { deltas, lastAppliedId } = this.config.decryptor.replay(batch, final);
      if (lastAppliedId >= 0) this.lastAppliedId = lastAppliedId;
      for (const delta of deltas) {
        await this.emitDelta(delta);
      }
      this.emitProgress(false);
      // Yield so React can paint between batches during the initial catch-up.
      await new Promise((r) => setTimeout(r, 0));
    }
    this.emitProgress(true);
  }

  private async emitDelta(delta: TransactionDelta): Promise<void> {
    const meta = await this.transactionMeta(delta.txHash);
    for (const tx of deltaToTransactions(delta, meta, this.walletAddress)) {
      const update: ViewingUpdate = {
        __typename: 'ViewingUpdate',
        index: delta.lastEventId,
        update: { __typename: 'RelevantTransaction', transaction: tx },
      };
      this.emit(update);
    }
    this.patchSession({ highestRelevantWalletIndex: delta.lastEventId }, false);
  }

  private transactionMeta(hash: string): Promise<TransactionMeta> {
    let p = this.metaCache.get(hash);
    if (!p) {
      p = this.fetchTransactionMeta(hash);
      this.metaCache.set(hash, p);
      p.catch(() => this.metaCache.delete(hash));
    }
    return p;
  }

  private async fetchTransactionMeta(hash: string, attempt = 0): Promise<TransactionMeta> {
    try {
      const data = await this.gql<TxMetaPayload>(TX_META_QUERY, { hash });
      const tx = data.transactions[0];
      if (!tx) throw new Error(`transaction ${hash} not found`);
      return {
        blockHeight: tx.block.height,
        blockHash: tx.block.hash,
        timestamp: new Date(tx.block.timestamp).toISOString(),
        applyStage: mapResultStatus(tx.transactionResult?.status),
        fee: tx.fee,
        contractAddress: tx.contractActions?.[0]?.address,
      };
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return this.fetchTransactionMeta(hash, attempt + 1);
      }
      console.warn(`[indexer] metadata lookup failed for ${hash}`, err);
      return {
        blockHeight: 0,
        blockHash: '',
        timestamp: new Date().toISOString(),
        applyStage: 'Success',
      };
    }
  }

  private emitProgress(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProgressEmit < 400) return;
    this.lastProgressEmit = now;
    const caughtUp = this.chainMaxId > 0 && this.lastAppliedId >= this.chainMaxId;
    const progress: ProgressUpdate = {
      __typename: 'ProgressUpdate',
      highestIndex: this.chainMaxId,
      highestRelevantIndex: this.session?.indexerScan?.relevantEndIndex ?? 0,
      highestRelevantWalletIndex: this.session?.highestRelevantWalletIndex ?? 0,
    };
    this.emit(progress);
    this.patchSession({
      highestIndex: this.chainMaxId,
      eventsReplayed: this.config.decryptor.replayedCount,
      status: caughtUp ? 'live' : 'syncing',
    });
  }

  private onScan(data: ScanPayload): void {
    const s = data.shieldedTransactions;
    console.debug('[indexer] viewing-key session', JSON.stringify(s).slice(0, 200));
    if (s.__typename === 'ShieldedTransactionsProgress') {
      this.patchSession({
        indexerScan: {
          chainEndIndex: s.highestZswapEndIndex,
          checkedEndIndex: s.highestCheckedZswapEndIndex,
          relevantEndIndex: s.highestRelevantZswapEndIndex,
        },
      });
    }
    // RelevantTransaction items from the session are intentionally not used
    // for decryption; the event stream already covers them.
  }

  // ---------------------------------------------------------------- utils

  private emit(event: WalletEvent): void {
    for (const h of this.eventHandlers) h(event);
  }

  private patchSession(patch: Partial<WalletSession>, notify = true): void {
    if (!this.session) return;
    this.session = { ...this.session, ...patch };
    if (notify) this.notifySession();
  }

  private notifySession(): void {
    if (!this.session) return;
    for (const h of this.sessionHandlers) h(this.session);
  }
}
