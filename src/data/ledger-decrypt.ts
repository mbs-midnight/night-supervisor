/**
 * ledger-decrypt.ts
 *
 * Turns the indexer's hex-encoded zswap ledger events into the per-transaction
 * coin movements the dashboard renders, using @midnightntwrk/ledger-v9.
 *
 * How it works. The indexer streams every `zswapLedgerEvents { raw }` on the
 * chain (each a serialized ledger `Event`: zswapOutput with a ciphertext, or
 * zswapInput with a nullifier). `ZswapLocalState.replayEventsWithChanges`
 * trial-decrypts each output with the wallet's encryption secret key, checks
 * the commitment against the coin public key, tracks the Merkle tree index,
 * and matches inputs against the wallet's own nullifiers. It returns one
 * `ZswapStateChanges { source, receivedCoins, spentCoins }` per event that
 * touched this wallet, where `source` is the transaction hash. Events that
 * belong to other wallets fall through silently. This is exactly the sync
 * path @midnight-ntwrk/wallet-sdk-shielded 4.0 uses on ledger-9, so the
 * dashboard sees what the wallet sees.
 *
 * Two facts about the ledger API shape this module:
 *
 *   1. replayEventsWithChanges consumes the Event objects. Reading any field
 *      of an Event after passing it in throws "null pointer passed to rust",
 *      so everything needed from an event is read before replay.
 *   2. There is still no viewing-key-only decryption entry point.
 *      ZswapLocalState needs the full ZswapSecretKeys (nullifiers are derived
 *      from the coin secret key). EncryptionSecretKey alone exposes only
 *      `test(offer)`, a relevance check. So the browser must hold the seed to
 *      decrypt amounts, while the indexer needs only the viewing key to filter.
 *      This gap is the roadmap item for a strict "custodian never holds spend
 *      authority" deployment; see STATUS.md.
 */

import * as ledger from '@midnightntwrk/ledger-v9';
import {
  COUNTERPARTY_UNDISCLOSED_RECIPIENT,
  COUNTERPARTY_UNDISCLOSED_SENDER,
  type ApplyStage,
  type Transaction,
} from '../types';
import { resolveToken } from './token-registry';

/** Gross movement of one token type inside one transaction, for this wallet. */
export interface TokenMovement {
  rawTokenType: string;
  received: bigint;
  spent: bigint;
}

/** All of this wallet's coin movements caused by one transaction. */
export interface TransactionDelta {
  txHash: string;
  /** Highest ledger event id that contributed to this delta. */
  lastEventId: number;
  movements: TokenMovement[];
}

export interface ReplayResult {
  deltas: TransactionDelta[];
  /** Events that failed to deserialize (e.g. from another protocol version). */
  skipped: number;
  /** Id of the last event actually applied, or -1 if nothing was applied. */
  lastAppliedId: number;
}

export interface RawLedgerEvent {
  id: number;
  raw: string; // hex
  protocolVersion?: number;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export class ShieldedDecryptor {
  private state = new ledger.ZswapLocalState();
  private eventsReplayed = 0;
  /**
   * Trailing events of a transaction that may continue in the next batch.
   * A transaction's events are contiguous in the stream, so holding back the
   * tail keeps each transaction's coin movements in a single delta.
   */
  private carry: RawLedgerEvent[] = [];

  constructor(private readonly keys: ledger.ZswapSecretKeys) {}

  get replayedCount(): number {
    return this.eventsReplayed;
  }

  /** First free index in the local commitment tree (how far we have replayed). */
  get firstFree(): bigint {
    return this.state.firstFree;
  }

  /** Coins the wallet can currently spend, per the replayed history. */
  get spendableCoins(): ledger.QualifiedShieldedCoinInfo[] {
    return Array.from(this.state.coins);
  }

  /**
   * Replay a batch of events, in chain order. Returns the wallet's coin
   * movements grouped by source transaction, in first-seen order.
   *
   * @param final - true when no further events are expected right now (the
   *   stream is at the chain tip). When false, the trailing events that share
   *   the last transaction hash are held back and prepended to the next call,
   *   so a transaction never straddles two batches.
   */
  replay(events: RawLedgerEvent[], final = true): ReplayResult {
    const input = this.carry.length > 0 ? [...this.carry, ...events] : events;
    this.carry = [];

    // Deserialize first and read each event's source before replay:
    // replayEventsWithChanges consumes the Event objects.
    const decoded: Array<{ id: number; event: ledger.Event; source: string; raw: RawLedgerEvent }> = [];
    let skipped = 0;
    for (const e of input) {
      try {
        const event = ledger.Event.deserialize(hexToBytes(e.raw));
        decoded.push({ id: e.id, event, source: event.source.transactionHash, raw: e });
      } catch (err) {
        skipped++;
        console.warn(`[decrypt] could not deserialize ledger event ${e.id}`, err);
      }
    }

    if (!final && decoded.length > 0) {
      const tailSource = decoded[decoded.length - 1].source;
      let cut = decoded.length;
      while (cut > 0 && decoded[cut - 1].source === tailSource) cut--;
      if (cut > 0) {
        this.carry = decoded.slice(cut).map((d) => d.raw);
        decoded.length = cut;
      } else {
        // The whole batch is one transaction; apply it rather than stall.
      }
    }
    if (decoded.length === 0) return { deltas: [], skipped, lastAppliedId: -1 };

    const result = this.state.replayEventsWithChanges(
      this.keys,
      decoded.map((d) => d.event),
    );
    this.state = result.state;
    this.eventsReplayed += decoded.length;
    const lastId = decoded[decoded.length - 1].id;

    const byTx = new Map<string, TransactionDelta>();
    for (const change of result.changes) {
      let delta = byTx.get(change.source);
      if (!delta) {
        delta = { txHash: change.source, lastEventId: lastId, movements: [] };
        byTx.set(change.source, delta);
      }
      for (const coin of change.receivedCoins) {
        movementFor(delta, coin.type).received += coin.value;
      }
      for (const coin of change.spentCoins) {
        movementFor(delta, coin.type).spent += coin.value;
      }
    }
    return { deltas: Array.from(byTx.values()), skipped, lastAppliedId: lastId };
  }
}

function movementFor(delta: TransactionDelta, rawTokenType: string): TokenMovement {
  let m = delta.movements.find((x) => x.rawTokenType === rawTokenType);
  if (!m) {
    m = { rawTokenType, received: 0n, spent: 0n };
    delta.movements.push(m);
  }
  return m;
}

/** Chain metadata the indexer returns for a transaction hash. */
export interface TransactionMeta {
  blockHeight: number;
  blockHash: string;
  /** ISO-8601 */
  timestamp: string;
  applyStage: ApplyStage;
  fee?: string;
  contractAddress?: string;
}

export function mapResultStatus(status: string | undefined): ApplyStage {
  switch (status) {
    case 'SUCCESS':
      return 'Success';
    case 'PARTIAL_SUCCESS':
      return 'PartialSuccess';
    case 'FAILURE':
      return 'Failure';
    default:
      return 'Success';
  }
}

/**
 * Project one transaction's movements onto the dashboard's Transaction rows,
 * one row per token type. Direction is the sign of (received - spent):
 * positive is an inbound transfer, negative an outbound transfer whose amount
 * excludes the wallet's own change, zero a self-transfer.
 */
export function deltaToTransactions(
  delta: TransactionDelta,
  meta: TransactionMeta,
  ownAddress: string,
): Transaction[] {
  return delta.movements.map((m) => {
    const net = m.received - m.spent;
    const token = resolveToken(m.rawTokenType);
    let direction: Transaction['direction'];
    let amount: bigint;
    let counterparty: string;
    if (net > 0n) {
      direction = 'incoming';
      amount = net;
      counterparty = COUNTERPARTY_UNDISCLOSED_SENDER;
    } else if (net < 0n) {
      direction = 'outgoing';
      amount = -net;
      counterparty = COUNTERPARTY_UNDISCLOSED_RECIPIENT;
    } else {
      direction = 'self';
      amount = m.spent;
      counterparty = ownAddress;
    }
    return {
      hash: delta.txHash,
      blockHeight: meta.blockHeight,
      blockHash: meta.blockHash,
      timestamp: meta.timestamp,
      applyStage: meta.applyStage,
      direction,
      tokenType: token.symbol,
      amount: amount.toString(),
      counterpartyAddress: counterparty,
      memo: undefined,
      contractAddress: meta.contractAddress,
      rawTokenType: m.rawTokenType,
      fee: meta.fee,
      receivedAtomic: m.received.toString(),
      spentAtomic: m.spent.toString(),
    };
  });
}
