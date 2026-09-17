/**
 * derive-keys.ts — print the supervised wallet's shielded address and viewing
 * key for a seed, without printing the seed.
 *
 *   SUPERVISOR_SEED="<mnemonic or hex>" npm run derive-keys
 *   npm run derive-keys -- "<mnemonic words>"     # or pass the seed as the argument
 *
 * The viewing key is what a custodian hands to its indexer. It cannot spend.
 */

import { deriveSupervisedWalletKeys } from './lib/keys';

function readSeed(): string {
  const arg = process.argv.slice(2).join(' ').trim();
  if (arg) return arg;
  if (process.env.SUPERVISOR_SEED?.trim()) return process.env.SUPERVISOR_SEED.trim();
  throw new Error('No seed: pass it as an argument or set SUPERVISOR_SEED in the environment');
}

const networkId = process.env.VITE_NETWORK_ID ?? 'stagenet';
const keys = deriveSupervisedWalletKeys(readSeed(), networkId);
console.log(`network          ${networkId}`);
console.log(`shielded address ${keys.shieldedAddress}`);
console.log(`viewing key      ${keys.viewingKey}`);
keys.zswapSecretKeys.clear();
