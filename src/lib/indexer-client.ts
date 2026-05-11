/**
 * IndexerClient interface — the swap boundary between mock and production.
 *
 * In this reference implementation, MockIndexerClient implements this interface
 * and produces synthetic transaction streams. To run against a live Midnight
 * Indexer:
 *
 *   1. Implement a GraphqlIndexerClient that satisfies this interface.
 *   2. The implementation calls the `connect(viewingKey)` mutation to obtain a
 *      sessionId, then opens a WebSocket subscription to
 *      `wallet(sessionId, index)` per the GraphQL schema-v1.graphql contract.
 *   3. Forward every `ViewingUpdate` and `ProgressUpdate` event to the
 *      registered callback.
 *   4. Replace the `new MockIndexerClient(...)` instantiation in App.tsx with
 *      `new GraphqlIndexerClient(...)`.
 *
 * No other code in this codebase changes. The detection rules, screening,
 * export, and UI all consume the IndexerClient interface only.
 *
 * See README.md for a worked example of the production swap.
 */

import type { WalletEvent, WalletSession } from '../types';

export type WalletEventHandler = (event: WalletEvent) => void;
export type SessionStateHandler = (session: WalletSession) => void;

export interface IndexerClient {
  /**
   * Establish a session by registering a viewing key with the indexer.
   * In production this calls the `connect(viewingKey: ViewingKey!)` GraphQL
   * mutation. Returns the session metadata.
   */
  connect(viewingKey: string, walletAddress: string): Promise<WalletSession>;

  /**
   * Subscribe to wallet events. Calls the handler for every ViewingUpdate
   * (containing relevant transactions) and ProgressUpdate (sync progress).
   * In production this opens a `wallet(sessionId, index)` GraphQL subscription
   * over WebSocket.
   */
  subscribe(handler: WalletEventHandler): () => void;

  /**
   * Subscribe to session state changes (connecting -> syncing -> live).
   */
  onSessionUpdate(handler: SessionStateHandler): () => void;

  /**
   * End the session. In production this calls the
   * `disconnect(sessionId: HexEncoded!)` GraphQL mutation.
   */
  disconnect(): Promise<void>;
}
