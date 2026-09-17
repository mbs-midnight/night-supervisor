/**
 * Builds the client + key material for one dashboard session.
 *
 * Live sessions hold the wallet's zswap keys in memory only. `dispose()`
 * wipes them (ledger-v9 `ZswapSecretKeys.clear()` zeroes the WASM-side
 * material) and is called on Disconnect and on page hide/unload. Nothing is
 * ever written to storage, so a refresh starts from the entry screen.
 */

import { GraphqlIndexerClient } from '../data/GraphqlIndexerClient';
import { ShieldedDecryptor } from '../data/ledger-decrypt';
import { MockIndexerClient } from '../data/mock-indexer-client';
import type { IndexerClient } from './indexer-client';
import { deriveSupervisedWalletKeys, type SupervisedWalletKeys } from './keys';
import { INDEXER_HOST, INDEXER_HTTP, INDEXER_WS, NETWORK_ID } from './config';

export type SessionMode = 'live' | 'mock';

export interface SessionWiring {
  mode: SessionMode;
  client: IndexerClient;
  viewingKey: string;
  walletAddress: string;
  connectionLabel: string;
  /** Wipe in-memory key material. Idempotent. */
  dispose: () => void;
}

// Synthetic-demo wallet identifiers (display only; no keys behind them).
const MOCK_WALLET_ADDRESS =
  'mn_shield-addr_preprod1d0ukznkc5mw4zvdkds42egr9wscfcj3ad56eaumwqkrmtnt3qe3y9kyh44j2cez2lamlwfh5q90hlttc3gmv2vmfgalwdf9p3mxz4eget0a3j';
const MOCK_VIEWING_KEY =
  'mn_shield-esk_preprod1064grn7vhvv79alzea67mgjv5hya67af68pmvut5968as7g0cvrqkf6kfw';

export function buildMockWiring(): SessionWiring {
  return {
    mode: 'mock',
    client: new MockIndexerClient({ seed: 1729, baselineTxPerHour: 1.4 }),
    viewingKey: MOCK_VIEWING_KEY,
    walletAddress: MOCK_WALLET_ADDRESS,
    connectionLabel: `MockIndexerClient (synthetic data; live target ${INDEXER_HOST})`,
    dispose: () => undefined,
  };
}

/**
 * Derives keys from the typed seed and wires the live client. The seed string
 * is consumed here and not retained; the caller should drop its own reference
 * (React state, input value) immediately after.
 * @throws on an invalid mnemonic / hex seed.
 */
export function buildLiveWiring(seed: string): SessionWiring {
  const keys: SupervisedWalletKeys = deriveSupervisedWalletKeys(seed, NETWORK_ID);
  const decryptor = new ShieldedDecryptor(keys.zswapSecretKeys);
  let disposed = false;
  return {
    mode: 'live',
    client: new GraphqlIndexerClient({ httpUrl: INDEXER_HTTP, wsUrl: INDEXER_WS, decryptor }),
    viewingKey: keys.viewingKey,
    walletAddress: keys.shieldedAddress,
    connectionLabel: `GraphqlIndexerClient · ${INDEXER_HOST}`,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        keys.zswapSecretKeys.clear();
      } catch {
        /* already cleared */
      }
    },
  };
}
