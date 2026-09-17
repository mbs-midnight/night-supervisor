/**
 * live-smoke.ts — exercise the live GraphqlIndexerClient under Node 22 (which
 * has fetch and WebSocket built in), end to end against the configured
 * indexer, without a browser.
 *
 *   SUPERVISOR_SEED="<mnemonic or hex>" npm run live-smoke
 *
 * Prints derived public material, sync progress, and a summary of decrypted
 * coin movements. Exits non-zero if the client never reaches `live`.
 */

import { GraphqlIndexerClient } from './data/GraphqlIndexerClient';
import { ShieldedDecryptor } from './data/ledger-decrypt';
import { deriveSupervisedWalletKeys } from './lib/keys';
import { INDEXER_HTTP, INDEXER_WS, NETWORK_ID } from './lib/config';
import type { Transaction, WalletSession } from './types';

const seed = process.env.SUPERVISOR_SEED?.trim();
if (!seed) {
  console.error('SUPERVISOR_SEED is not set');
  process.exit(2);
}
const networkId = process.env.VITE_NETWORK_ID ?? NETWORK_ID;
const httpUrl = process.env.VITE_INDEXER_HTTP ?? INDEXER_HTTP;
const wsUrl = process.env.VITE_INDEXER_WS ?? INDEXER_WS;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 180_000);

const keys = deriveSupervisedWalletKeys(seed, networkId);
console.log(`network   ${networkId}`);
console.log(`indexer   ${httpUrl}`);
console.log(`address   ${keys.shieldedAddress}`);
console.log(`viewing   ${keys.viewingKey}`);

const decryptor = new ShieldedDecryptor(keys.zswapSecretKeys);
const client = new GraphqlIndexerClient({ httpUrl, wsUrl, decryptor });

const txs: Transaction[] = [];
let session: WalletSession | null = null;
let lastStatus = '';
const t0 = Date.now();

client.onSessionUpdate((s) => {
  session = s;
  const line = `${s.status} chainTip=${s.highestIndex} lastWalletEvent=${s.highestRelevantWalletIndex} replayed=${s.eventsReplayed ?? 0}` +
    (s.indexerScan ? ` scan=${s.indexerScan.checkedEndIndex}/${s.indexerScan.chainEndIndex}(rel ${s.indexerScan.relevantEndIndex})` : '') +
    (s.lastError ? ` err=${s.lastError}` : '');
  if (line !== lastStatus) {
    lastStatus = line;
    console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);
  }
});
client.subscribe((ev) => {
  if (ev.__typename === 'ViewingUpdate' && ev.update.__typename === 'RelevantTransaction') {
    txs.push(ev.update.transaction);
  }
});

await client.connect(keys.viewingKey, keys.shieldedAddress);

const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
  const s = session as WalletSession | null;
  if (s?.status === 'live' && txs.length > 0) break;
  if (s?.status === 'error') break;
  await new Promise((r) => setTimeout(r, 500));
}
// Let in-flight metadata lookups land.
await new Promise((r) => setTimeout(r, 1_500));

const byDirection: Record<string, number> = {};
const byToken: Record<string, { in: bigint; out: bigint; self: bigint }> = {};
for (const tx of txs) {
  byDirection[tx.direction] = (byDirection[tx.direction] ?? 0) + 1;
  const b = (byToken[tx.tokenType] ??= { in: 0n, out: 0n, self: 0n });
  const amt = BigInt(tx.amount);
  if (tx.direction === 'incoming') b.in += amt;
  else if (tx.direction === 'outgoing') b.out += amt;
  else b.self += amt;
}
const finalSession = session as WalletSession | null;
console.log('');
console.log(`status            ${finalSession?.status}`);
console.log(`events replayed   ${decryptor.replayedCount}`);
console.log(`transaction rows  ${txs.length}  ${JSON.stringify(byDirection)}`);
for (const [t, b] of Object.entries(byToken)) {
  console.log(`  ${t.padEnd(8)} in=${b.in} out=${b.out} self-turnover=${b.self}`);
}
const coins = decryptor.spendableCoins;
const totals = new Map<string, bigint>();
for (const c of coins) totals.set(c.type, (totals.get(c.type) ?? 0n) + c.value);
console.log(`spendable coins   ${coins.length}`);
for (const [type, total] of totals) console.log(`  ${type.slice(0, 16)}… total=${total}`);
const sample = txs.slice(0, 5);
for (const tx of sample) {
  console.log(`  ${tx.hash.slice(0, 12)} blk ${tx.blockHeight} ${tx.timestamp} ${tx.applyStage} ${tx.direction} ${tx.amount} ${tx.tokenType} cp=${tx.counterpartyAddress.slice(0, 24)} fee=${tx.fee}`);
}
const missingMeta = txs.filter((t) => t.blockHeight === 0).length;
if (missingMeta) console.log(`rows without block metadata: ${missingMeta}`);

await client.disconnect();
keys.zswapSecretKeys.clear();
process.exit(finalSession?.status === 'live' && txs.length > 0 ? 0 : 1);
