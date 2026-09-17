import type { TokenType } from '../types';

const ATOMIC_DECIMALS: Record<TokenType, number> = {
  NIGHT: 6,
  DUST: 6,
  tUSDM: 6,
  tUSDC: 6,
  tEUR: 6,
  sTEST: 0,
  UNKNOWN: 0,
};

const TOKEN_SYMBOLS: Record<TokenType, string> = {
  NIGHT: 'NIGHT',
  DUST: 'DUST',
  tUSDM: 'tUSDM',
  tUSDC: 'tUSDC',
  tEUR: 'tEUR',
  sTEST: 'sTEST',
  UNKNOWN: '?',
};

export function tokenDecimals(tokenType: TokenType): number {
  return ATOMIC_DECIMALS[tokenType] ?? 0;
}

/** Atomic units to a JS number in whole tokens (for charts, not money math). */
export function atomicToNumber(amount: string | bigint, tokenType: TokenType): number {
  const amt = typeof amount === 'string' ? BigInt(amount) : amount;
  return Number(amt) / 10 ** tokenDecimals(tokenType);
}

export function formatAtomic(
  amount: string | bigint,
  tokenType: TokenType,
  opts: { withSymbol?: boolean; precision?: number } = {},
): string {
  const decimals = tokenDecimals(tokenType);
  const amt = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = amt / divisor;
  const frac = amt % divisor;
  const precision = Math.min(opts.precision ?? 2, decimals);
  const fracStr = frac
    .toString()
    .padStart(decimals, '0')
    .slice(0, precision);

  const wholeStr = whole.toLocaleString('en-US');
  const result = precision > 0 ? `${wholeStr}.${fracStr}` : wholeStr;
  return opts.withSymbol ? `${result} ${TOKEN_SYMBOLS[tokenType]}` : result;
}

export function shortAddress(address: string, leading = 16, trailing = 6): string {
  if (address.length <= leading + trailing + 1) return address;
  return `${address.slice(0, leading)}…${address.slice(-trailing)}`;
}

export function shortHash(hash: string, leading = 8, trailing = 4): string {
  if (hash.length <= leading + trailing + 1) return hash;
  return `${hash.slice(0, leading)}…${hash.slice(-trailing)}`;
}

export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - t) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
