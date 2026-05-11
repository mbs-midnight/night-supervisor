/**
 * MockIndexerClient — emits synthetic events matching the production indexer's
 * GraphQL wallet subscription shape.
 *
 * Behavior:
 *   1. On connect(viewingKey, walletAddress): immediately establish a session.
 *   2. Begin emitting historical ViewingUpdate events at high speed (this is
 *      analogous to the real indexer's backfill phase when a session is first
 *      registered).
 *   3. After backfill, transition to "live" mode and emit ProgressUpdate events
 *      every ~2s plus ViewingUpdate events drawn from the live stream.
 *
 * In production this file is replaced by a GraphQL WebSocket client. Nothing
 * else in the codebase changes.
 */

import type {
  WalletSession,
  WalletEvent,
  ViewingUpdate,
  ProgressUpdate,
} from '../types';
import type {
  IndexerClient,
  WalletEventHandler,
  SessionStateHandler,
} from '../lib/indexer-client';
import { generateHistory } from './transaction-generator';

const BACKFILL_BATCH_SIZE = 8;
const BACKFILL_INTERVAL_MS = 90;
const LIVE_PROGRESS_INTERVAL_MS = 2_000;
const LIVE_TX_INTERVAL_MS = 4_500;

export interface MockIndexerConfig {
  /** Seed for reproducible demos. Default 42. */
  seed?: number;
  /** Baseline transactions per hour during backfill. Default 1.2. */
  baselineTxPerHour?: number;
  /** Speed multiplier for backfill. Default 1.0. */
  backfillSpeed?: number;
}

export class MockIndexerClient implements IndexerClient {
  private session: WalletSession | null = null;
  private eventHandlers: Set<WalletEventHandler> = new Set();
  private sessionHandlers: Set<SessionStateHandler> = new Set();
  private backfillTimer: number | null = null;
  private liveTxTimer: number | null = null;
  private progressTimer: number | null = null;
  private historyQueue: WalletEvent[] = [];
  private liveQueue: WalletEvent[] = [];
  private currentIndex = 0;
  private highestRelevantWalletIndex = 0;

  constructor(private config: MockIndexerConfig = {}) {}

  async connect(viewingKey: string, walletAddress: string): Promise<WalletSession> {
    // In production: GraphQL mutation `connect(viewingKey: ViewingKey!)`
    const sessionId = `mock-session-${Date.now().toString(36)}`;

    const startTime = new Date();
    const startBlock = 2_847_293;

    const { history, liveStream } = generateHistory({
      startBlock,
      startTime,
      baselineTxPerHour: this.config.baselineTxPerHour ?? 1.2,
      seed: this.config.seed,
    });

    // Convert history transactions into ViewingUpdate events
    this.historyQueue = history.map((tx) => {
      const update: ViewingUpdate = {
        __typename: 'ViewingUpdate',
        index: tx.blockHeight,
        update: {
          __typename: 'RelevantTransaction',
          transaction: tx,
        },
      };
      return update;
    });

    this.liveQueue = liveStream.map((tx) => {
      const update: ViewingUpdate = {
        __typename: 'ViewingUpdate',
        index: tx.blockHeight,
        update: {
          __typename: 'RelevantTransaction',
          transaction: tx,
        },
      };
      return update;
    });

    this.session = {
      sessionId,
      viewingKeyFingerprint: viewingKey.slice(0, 12) + '…',
      walletAddress,
      connectedAt: new Date().toISOString(),
      status: 'syncing',
      highestIndex: startBlock,
      highestRelevantWalletIndex: 0,
    };
    this.notifySession();
    this.startBackfill();
    return this.session;
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
    // In production: GraphQL mutation `disconnect(sessionId: HexEncoded!)`
    if (this.backfillTimer) clearTimeout(this.backfillTimer);
    if (this.liveTxTimer) clearTimeout(this.liveTxTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (this.session) {
      this.session = { ...this.session, status: 'disconnected' };
      this.notifySession();
    }
    this.eventHandlers.clear();
    this.sessionHandlers.clear();
  }

  private startBackfill(): void {
    const speed = this.config.backfillSpeed ?? 1.0;
    const tick = () => {
      if (!this.session) return;
      const batch = this.historyQueue.splice(0, BACKFILL_BATCH_SIZE);
      for (const event of batch) {
        this.emit(event);
      }
      // Update progress
      if (batch.length > 0) {
        const last = batch[batch.length - 1];
        if (last.__typename === 'ViewingUpdate') {
          this.currentIndex = last.index;
          this.highestRelevantWalletIndex = last.index;
        }
        this.session = {
          ...this.session,
          highestIndex: this.currentIndex,
          highestRelevantWalletIndex: this.highestRelevantWalletIndex,
        };
        this.notifySession();
      }
      if (this.historyQueue.length > 0) {
        this.backfillTimer = window.setTimeout(tick, BACKFILL_INTERVAL_MS / speed);
      } else {
        // Backfill complete — transition to live mode
        this.session = { ...this.session!, status: 'live' };
        this.notifySession();
        this.startLive();
      }
    };
    this.backfillTimer = window.setTimeout(tick, BACKFILL_INTERVAL_MS / speed);
  }

  private startLive(): void {
    // Periodic ProgressUpdate every ~2s — even when no relevant transactions
    this.progressTimer = window.setInterval(() => {
      if (!this.session) return;
      this.currentIndex += 1;
      const progress: ProgressUpdate = {
        __typename: 'ProgressUpdate',
        highestIndex: this.currentIndex,
        highestRelevantIndex: this.currentIndex,
        highestRelevantWalletIndex: this.highestRelevantWalletIndex,
      };
      this.emit(progress);
      this.session = {
        ...this.session,
        highestIndex: this.currentIndex,
      };
      this.notifySession();
    }, LIVE_PROGRESS_INTERVAL_MS);

    // Drip the live stream
    const dripTx = () => {
      if (!this.session || this.liveQueue.length === 0) return;
      const next = this.liveQueue.shift()!;
      if (next.__typename === 'ViewingUpdate') {
        this.currentIndex = Math.max(this.currentIndex, next.index);
        this.highestRelevantWalletIndex = next.index;
      }
      this.emit(next);
      if (this.liveQueue.length > 0) {
        this.liveTxTimer = window.setTimeout(dripTx, LIVE_TX_INTERVAL_MS);
      }
    };
    this.liveTxTimer = window.setTimeout(dripTx, LIVE_TX_INTERVAL_MS);
  }

  private emit(event: WalletEvent): void {
    for (const h of this.eventHandlers) h(event);
  }

  private notifySession(): void {
    if (!this.session) return;
    for (const h of this.sessionHandlers) h(this.session);
  }
}
