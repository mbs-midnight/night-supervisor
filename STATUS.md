# Midnight Supervisor — Status (2026-09-17)

Viewing-key supervisory dashboard for Midnight shielded assets, now running
**live against Stagenet** on the ledger-9 stack.

## Stack

| Piece | Pin | Notes |
|---|---|---|
| `@midnightntwrk/ledger-v9` | 1.0.0-rc.4 | New npm scope (no hyphen). Matches wallet-sdk 2.0.0-beta.3's pin. |
| `@midnight-ntwrk/wallet-sdk-hd` | 3.1.0-beta.2 | HD derivation; account 0 / role Zswap / index 0. |
| `@midnight-ntwrk/wallet-sdk-address-format` | 4.0.0-beta.3 | Bech32m `mn_shield-addr_stagenet…` / `mn_shield-esk_stagenet…`. |
| Indexer | `indexer.stagenet.shielded.tools/api/v4/graphql` | GraphQL schema v4; protocol version 2000000. |
| Vite | 5.4 + `vite-plugin-wasm` | `build.target: esnext`; `buffer` and `assert` shims for address-format. |

Chain facts observed while wiring: block height ~502k, ~3.7k zswap
commitments, ~6k zswap ledger events in total. Replaying the entire chain's
events takes 12–17 s in Node and about the same in the browser.

## How live mode works

1. The seed (mnemonic or hex) is typed into the entry screen;
   `src/lib/keys.ts` derives `ZswapSecretKeys`, the shielded address, and the
   Bech32m viewing key. Only the viewing key leaves the browser. The seed
   string is dropped right after derivation, the key material lives in WASM
   memory for the session, and `ZswapSecretKeys.clear()` runs on Disconnect
   and on `pagehide`/`beforeunload`. Nothing is persisted; a reload returns to
   the entry screen. No seed exists at build time, so static deploys are safe.
2. `GraphqlIndexerClient.connect` registers the viewing key with the indexer
   (`connect` mutation) and opens one WebSocket with two subscriptions:
   - `zswapLedgerEvents(id)` — every serialized zswap ledger `Event` on the
     chain, hex-encoded. Batches are replayed through ledger-v9
     `ZswapLocalState.replayEventsWithChanges`, which yields
     `{ source: txHash, receivedCoins, spentCoins }` for this wallet only.
     This is the same sync path `@midnight-ntwrk/wallet-sdk-shielded` 4.0
     uses on ledger-9.
   - `shieldedTransactions(sessionId)` — the viewing-key session. Its
     `ShieldedTransactionsProgress` is shown in the Session panel as the
     indexer-side relevance scan.
3. Each source transaction is enriched with `transactions(offset: {hash})`
   (block height/hash/timestamp, result status, fee, contract actions) and
   emitted as one `Transaction` row per token type. Direction is the sign of
   received − spent: `incoming`, `outgoing` (net of change), or `self`.
4. The socket reconnects with backoff and resumes from the last applied event
   id (the indexer cursor is inclusive; the boundary event is filtered so the
   Merkle insertion stays linear).

Verified 2026-09-17 against the load-test Stagenet wallet: 6,018 events
replayed, 14 relevant transactions (1 incoming mint receipt, 13
self-transfers), 72 spendable coins totalling 1,000,000 `sTEST`, matching an
independent chain-wide replay. `npm run live-smoke` reproduces this from Node.

## Findings about the Stagenet indexer

- **The per-key relevance scan is slow to start.** After the first `connect`
  for a new viewing key, `highestCheckedZswapEndIndex` advanced roughly ten
  commitments per minute for the first quarter hour and completed (3689/3689)
  about 40 minutes later. Until then the session delivers no
  `RelevantTransaction` items. Once complete, a fresh subscription delivers all
  relevant transactions within a second. This is why decryption is driven by
  the chain-wide event stream and the session is informational.
- **One `shieldedTransactions` subscription per session.** Opening a second
  subscription for the same session closes the older socket with code 1006.
- **Two concurrent `connect` mutations for the same viewing key** (React
  StrictMode's double mount, or two dashboards on one key) can make the
  indexer answer one with `unknown or expired session ID`. The client shares a
  single in-flight connect per key, retries once, and otherwise degrades to
  events-only mode with the error shown in the Session panel.
- **Under a fast catch-up the server occasionally drops the socket** (code
  1006). The reconnect/resume path handles it; it has never lost or duplicated
  a coin movement in testing.

## Ledger-v9 API facts that shaped the code

- `replayEventsWithChanges` **consumes** the `Event` objects. Reading
  `event.source` afterwards throws `null pointer passed to rust`. Read the
  source hash before replay (the decryptor does this to keep a transaction's
  events in one batch).
- There is still **no viewing-key-only decryption**. `EncryptionSecretKey`
  exposes only `test(offer)`; `ZswapLocalState` needs full `ZswapSecretKeys`
  because spent coins are matched by nullifier, which derives from the coin
  secret key. So the browser holds the seed to show amounts while the indexer
  needs only the viewing key to filter. A strict "custodian never holds spend
  authority" deployment needs an esk-plus-cpk replay entry point in the ledger;
  this remains the main SDK ask. A viewing-key-only deployment could today list
  relevant transaction hashes and block metadata (from the session) without
  amounts.
- `Event.source.transactionHash` equals `ZswapStateChanges.source`, so the
  per-hash `transactions(offset: {hash})` lookup is exact.
- Fees are reported in Specks (1 DUST = 10^15 Specks).

## Honest limits

- **Counterparties are not recoverable from a viewing key.** Inbound rows show
  `undisclosed-sender`, outbound rows `undisclosed-recipient`; only
  self-transfers name the wallet's own address. Sanctions screening therefore
  cannot fire on live shielded transfers without memo, contract context, or
  Travel Rule pairing; it still runs, and the mock demonstrates it.
- Only tokens registered in `src/data/token-registry.ts` get a symbol and
  decimals (`NIGHT` native shielded token, `sTEST` Stagenet mint). Others render
  as `UNKNOWN` with the raw type preserved.
- Structuring detection is stablecoin-only by design and will not trigger on
  Stagenet test tokens.
- Single tenant, no persistence, no HSM: unchanged from v0.1. "Encrypted in memory" was considered and not done: in a browser the decryption key would sit beside the ciphertext, so zeroing and non-persistence are the meaningful controls.

## Next

1. Ask ledger/wallet SDK for an esk-only replay entry point (see above).
2. Fund a second Stagenet wallet and script Alice → Bob transfers so an
   `incoming` row from a third party appears live; plant its address in the
   sanctions sample for the alert moment.
3. Persist `ZswapLocalState` (it serializes) so a reload resumes from the tip
   instead of replaying the chain.
4. Register the shielded token types the demo needs and drop the `sTEST`
   placeholder once a stablecoin exists on Stagenet.
