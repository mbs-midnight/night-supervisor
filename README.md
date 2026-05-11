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
   to the wallet appears in real time, with token type, amount, counterparty
   address, timestamp, block height, and (where present) memo content.
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

## The mock / production boundary

The single most important thing to understand about this codebase: the indexer
connection is **mocked with deterministic synthetic data**. Everything
downstream of the connection — detection rules, sanctions screening, alert
workflow, CSV export, the entire UI — is real and operates on the exact data
shape the production indexer produces.

To wire this to a live Midnight Indexer:

1. Implement a `GraphqlIndexerClient` class satisfying the `IndexerClient`
   interface in [`src/lib/indexer-client.ts`](src/lib/indexer-client.ts).
2. The implementation calls the `connect(viewingKey: ViewingKey!)` GraphQL
   mutation against the indexer's HTTP endpoint (e.g.
   `https://indexer-rs.testnet-02.midnight.network/api/v1/graphql`) and gets
   back a `sessionId`.
3. Open a WebSocket subscription against
   `wss://indexer-rs.testnet-02.midnight.network/api/v1/graphql/ws` with
   `graphql-transport-ws` protocol, subscribing to
   `wallet(sessionId, index)`. Forward every `ViewingUpdate` and
   `ProgressUpdate` event to the registered callback.
4. In [`src/App.tsx`](src/App.tsx), replace
   `new MockIndexerClient(...)` with `new GraphqlIndexerClient(...)`.

No other code changes. The detection rules, screening, export, and UI consume
the `IndexerClient` interface only.

The interface is documented inline. The type definitions in
[`src/types/index.ts`](src/types/index.ts) deliberately mirror the production
GraphQL schema v1 — every field, naming, and shape corresponds to a real
primitive in the production indexer.

---

## Quick start

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal. The dashboard initializes a session
against the MockIndexerClient and begins streaming synthetic transactions
within seconds. The structuring pattern fires roughly partway through the
historical backfill; the sanctioned-counterparty alert fires both during
backfill and again when the live stream emits the seeded sanctioned
transaction.

For the demo, the seed value `1729` in `App.tsx` produces reproducible output.
Change it for varied data; remove it for non-deterministic timing.

---

## Project structure

```
src/
├── App.tsx                            # main composition
├── main.tsx                           # entry point
├── index.css                          # base styles + Tailwind
├── types/
│   └── index.ts                       # types matching indexer GraphQL schema
├── lib/
│   ├── indexer-client.ts              # IndexerClient interface (the swap point)
│   ├── use-supervisor-state.ts        # central state hook
│   ├── sanctions-screening.ts         # sanctions detection rule
│   ├── structuring-detection.ts       # structuring detection rule
│   ├── metrics.ts                     # balance / counterparty derivations
│   ├── export.ts                      # CSV export
│   └── format.ts                      # display formatting helpers
├── data/
│   ├── mock-indexer-client.ts         # MockIndexerClient (replaces in production)
│   ├── transaction-generator.ts       # synthetic transaction generation
│   └── sanctions-list.ts              # sample sanctions list
└── components/
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
- **High-availability architecture.** Reconnection logic, indexer failover,
  message replay on session interruption. Out of scope.
- **Regulated-data residency.** GDPR, data localization, encryption key
  management. The viewing key in this implementation is hardcoded; production
  systems should source it from HSM/TEE infrastructure. Out of scope.
- **Identity attribution.** Counterparty wallet addresses appear as wallet
  addresses. Linking to KYC-attested identities at the custodian layer is the
  custodian's responsibility, not this dashboard's.
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
