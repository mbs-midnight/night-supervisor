# Midnight Supervisor — Reference Implementation

A viewing-key-based supervisory dashboard for Midnight shielded assets.

This is a reference implementation, not a production compliance system. It is
intended for:

- **Regulator engagement** — demonstrating to FCA, FinCEN, EBA, AMLA, and
  national supervisors what their supervised entities can see when they hold a
  client's viewing key.
- **Custodian compliance starting point** — institutional custodians (BitGo,
  Fireblocks, Anchorage, Copper, Balance, etc.) can fork this repository to
  bootstrap their own production monitoring system for Midnight shielded
  assets.
- **Internal Midnight Foundation BD** — concrete artifact for institutional
  conversations where "the viewing key gives the custodian full visibility" is
  more persuasive when shown than when said.

It is explicitly **not** a substitute for a production transaction monitoring
platform like Chainalysis Reactor, TRM Labs, or Elliptic. It does not handle
multi-tenancy, high-availability, regulated-data residency, or any of the
hundred operational concerns that real compliance infrastructure addresses. It
does demonstrate that the architectural pattern works.

---

## What it shows

Six capabilities in the viewing-key-based supervisory pattern:

1. **Live decrypted transaction stream.** Every shielded transaction relevant
   to the wallet appears in real time, with token type, amount, direction
   (incoming, outgoing, or self-transfer), timestamp, block height, fee, and
   contract address. Counterparties of shielded transfers are not recoverable
   from a viewing key and are shown as undisclosed; only self-transfers name
   the wallet's own address.
2. **Balance evolution.** Time-series visualization of stablecoin holdings
   derived from the decrypted stream.
3. **Sanctions screening.** Real-time O(1) lookup against a consolidated
   sanctions list (sample data; production swaps in OFAC SDN, OFSI, EU CFSL
   feeds). Critical alerts on hits.
4. **Structuring detection.** A real compliance rule: detects multiple outgoing
   stablecoin transfers, each just below the $10,000 reporting threshold,
   aggregating across counterparties within a 72-hour window. The same logic
   runs on transparent-chain assets at any major custodian today.
5. **Alert workflow.** Open / reviewed / SAR-filed / cleared status management
   for compliance officer triage.
6. **Audit trail export.** RFC 4180 CSV export of decrypted transaction history
   and alerts, suitable for 5-7 year retention obligations under BSA / MLR /
   AMLR.

---

## Two modes: mock and live Stagenet

The dashboard has one swap point, the `IndexerClient` interface in
[`src/lib/indexer-client.ts`](src/lib/indexer-client.ts), and two
implementations:

- **Mock** (default). `MockIndexerClient` streams deterministic synthetic
  transactions shaped like the live client's output. The structuring and
  sanctions alerts fire from seeded data so the compliance overlay can be
  demonstrated without a funded wallet.
- **Live** (enter a wallet seed on the entry screen). `GraphqlIndexerClient`
  connects to a Midnight indexer serving GraphQL **schema v4** (Stagenet by
  default), registers the wallet's viewing key with the `connect` mutation,
  streams every `zswapLedgerEvents` item on the chain, and replays them
  through `@midnightntwrk/ledger-v9`'s `ZswapLocalState.replayEventsWithChanges`
  to recover the wallet's received and spent coins. Each hit is enriched with
  block metadata from `transactions(offset: {hash})`. This is the same sync
  path the wallet SDK 2.0 uses on ledger-9, so the dashboard sees what the
  wallet sees.

Everything downstream — detection rules, sanctions screening, alert workflow,
CSV export, the UI — is shared. [`STATUS.md`](STATUS.md) records what was
verified against Stagenet and what the indexer and ledger APIs do and do not
allow.

### Stack

`@midnightntwrk/ledger-v9` 1.0.0-rc.4 · `@midnight-ntwrk/wallet-sdk-hd`
3.1.0-beta.2 · `@midnight-ntwrk/wallet-sdk-address-format` 4.0.0-beta.3 ·
indexer `indexer.stagenet.shielded.tools/api/v4/graphql`. These are the pins
`@midnight-ntwrk/wallet-sdk` 2.0.0-beta.3 ships with; do not bump one without
the others.

---

## Quick start

```bash
npm install
npm run dev
```

Open the local URL. The entry screen offers two paths:

- **Run synthetic demo** starts the MockIndexerClient and streams synthetic
  transactions within seconds, including the seeded structuring pattern and
  sanctions hit. The seed value `1729` in `session-wiring.ts` makes it
  reproducible.
- **Supervise a wallet** takes the wallet's BIP-39 recovery phrase or hex seed.
  The page derives the address and viewing key in the browser, connects to the
  indexer, replays the chain (a few thousand events on Stagenet, 10–20 s), and
  switches the session to **Live**.

The seed is held in memory only for the session. It is never written to
storage, never sent anywhere (the indexer receives only the derived viewing
key), and the derived key material is wiped on **Disconnect** and on tab close
or reload. Nothing wallet-specific is configured at build time, so a static
deploy (Vercel or similar) carries no secrets.

Node helpers, for pre-demo checks:

```bash
SUPERVISOR_SEED="<mnemonic or hex>" npm run derive-keys   # prints address + viewing key
SUPERVISOR_SEED="<mnemonic or hex>" npm run live-smoke    # runs the live client under Node 22
```

Why a seed and not just the viewing key: ledger-v9 still exposes decryption
only through `ZswapLocalState`, which needs the full zswap key set to match
spent coins by nullifier. The indexer itself is given only the viewing key.
See STATUS.md for the SDK ask that would close this gap.

Endpoint overrides: `VITE_NETWORK_ID`, `VITE_INDEXER_HTTP`, `VITE_INDEXER_WS`
(see `.env.example`). Register additional shielded token types in
[`src/data/token-registry.ts`](src/data/token-registry.ts).

---

## Project structure

```
src/
├── App.tsx                            # entry screen -> dashboard; wipes keys on exit
├── main.tsx                           # entry point (loads polyfills first)
├── polyfills.ts                       # Buffer global for wallet-sdk-address-format
├── derive-keys.ts                     # CLI: seed -> address + viewing key
├── live-smoke.ts                      # CLI: run the live client under Node
├── index.css                          # base styles + Tailwind
├── types/
│   └── index.ts                       # types mirroring indexer GraphQL schema v4
├── lib/
│   ├── config.ts                      # network / indexer endpoints from Vite env
│   ├── session-wiring.ts              # builds mock or live client; dispose() wipes keys
│   ├── keys.ts                        # HD derivation, viewing key, address
│   ├── indexer-client.ts              # IndexerClient interface (the swap point)
│   ├── use-supervisor-state.ts        # central state hook
│   ├── sanctions-screening.ts         # sanctions detection rule
│   ├── structuring-detection.ts       # structuring detection rule
│   ├── metrics.ts                     # balance / counterparty derivations
│   ├── export.ts                      # CSV export
│   └── format.ts                      # display formatting helpers
├── shims/
│   └── assert.ts                      # browser stand-in for Node assert
├── data/
│   ├── GraphqlIndexerClient.ts        # live schema-v4 client (Stagenet)
│   ├── ledger-decrypt.ts              # ledger-v9 event replay -> coin movements
│   ├── token-registry.ts              # RawTokenType -> symbol / decimals
│   ├── mock-indexer-client.ts         # MockIndexerClient (default)
│   ├── transaction-generator.ts       # synthetic transaction generation
│   └── sanctions-list.ts              # sample sanctions list
└── components/
    ├── EntryScreen.tsx                # seed entry (memory only) or synthetic demo
    ├── Header.tsx
    ├── DemoBanner.tsx
    ├── SessionPanel.tsx
    ├── BalanceSummary.tsx
    ├── BalanceTimeline.tsx
    ├── TransactionStream.tsx
    ├── AlertsPanel.tsx
    ├── TransactionInspector.tsx
    └── ExportPanel.tsx
```

---

## What's intentionally out of scope

These are real concerns, deferred deliberately to keep the reference
implementation readable:

- **Multi-tenant viewing key isolation.** A real CASP serves many institutional
  clients; production deployment needs tenant-level segregation in storage,
  in-memory state, and access control. Out of scope for v0.1.
- **High-availability architecture.** The live client reconnects with backoff
  and resumes from the last applied event, but indexer failover and persisted
  local state across reloads are out of scope.
- **Regulated-data residency.** GDPR, data localization, encryption key
  management. Key material here is typed in and held in browser memory for one
  session; production systems should source it from HSM/TEE infrastructure.
  Out of scope.
- **Identity attribution.** A viewing key reveals what the wallet received and
  spent, not who the other party was. Attribution needs memo conventions,
  contract context, or off-chain Travel Rule pairing at the custodian layer;
  the dashboard marks such counterparties undisclosed rather than guessing.
- **Reporting form generation.** SAR forms, MAR templates, etc. are
  jurisdiction-specific. The CSV export provides the underlying data; form
  population is downstream.
- **Cost basis and tax-reporting calculations.** The data is sufficient to
  produce 1099-DA / CARF / DAC8 outputs, but the reporting logic itself is out
  of scope.

These omissions are documented as a feature, not a bug. The point of a
reference implementation is to show the architectural pattern, not to compete
with established TM vendors.

---

## License

License terms TBD. Internal Midnight Foundation pre-release.

For external sharing, this is intended to be open source under a permissive
license (MIT or Apache 2.0) so custodians can fork freely.
