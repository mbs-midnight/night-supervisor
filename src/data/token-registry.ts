/**
 * Maps ledger RawTokenType values (32-byte hex) to the dashboard's display
 * tokens. A shielded coin's `type` is either the all-zero native token or the
 * hash of (domain separator, minting contract address), so an operator
 * registers each supervised asset here once. Anything unregistered renders as
 * UNKNOWN with the raw type preserved on the transaction record.
 */

import { shieldedToken } from '@midnightntwrk/ledger-v9';
import type { TokenType } from '../types';

export interface TokenInfo {
  symbol: TokenType;
  decimals: number;
  description: string;
}

export const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  [shieldedToken().raw]: {
    symbol: 'NIGHT',
    decimals: 6,
    description: 'Shielded NIGHT (native token)',
  },
  // Minted on Stagenet by load-test/stagenet's shielded.compact contract
  // (domain separator 0x01 * 32). Integer units; no fiat reference rate.
  '55dd57fbbaeb2c33cdbaca4c5428d297837df02171fe4aa4e98e5d605a61f6aa': {
    symbol: 'sTEST',
    decimals: 0,
    description: 'Stagenet shielded test token (load-test mint contract)',
  },
};

const UNKNOWN: TokenInfo = { symbol: 'UNKNOWN', decimals: 0, description: 'Unregistered token type' };

export function resolveToken(rawTokenType: string): TokenInfo {
  return TOKEN_REGISTRY[rawTokenType.toLowerCase()] ?? UNKNOWN;
}
