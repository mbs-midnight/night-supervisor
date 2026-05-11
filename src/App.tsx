import { useMemo, useState } from 'react';
import { Header } from './components/Header';
import { DemoBanner } from './components/DemoBanner';
import { SessionPanel } from './components/SessionPanel';
import { BalanceSummary } from './components/BalanceSummary';
import { BalanceTimeline } from './components/BalanceTimeline';
import { TransactionStream } from './components/TransactionStream';
import { AlertsPanel } from './components/AlertsPanel';
import { TransactionInspector } from './components/TransactionInspector';
import { ExportPanel } from './components/ExportPanel';
import { MockIndexerClient } from './data/mock-indexer-client';
import { useSupervisorState } from './lib/use-supervisor-state';

// Demo wallet — in production, the supervisory dashboard is configured with
// the actual wallet address and viewing key the custodian holds for this
// client.
const DEMO_WALLET_ADDRESS =
  'mn_shield-addr_preprod1d0ukznkc5mw4zvdkds42egr9wscfcj3ad56eaumwqkrmtnt3qe3y9kyh44j2cez2lamlwfh5q90hlttc3gmv2vmfgalwdf9p3mxz4eget0a3j'; //1am wallet
const DEMO_VIEWING_KEY =
  'mn_shield-esk_preprod1064grn7vhvv79alzea67mgjv5hya67af68pmvut5968as7g0cvrqkf6kfw'; //1am wallet viewing key

export default function App() {
  // Single MockIndexerClient instance for the lifetime of the app
  const client = useMemo(
    () =>
      new MockIndexerClient({
        seed: 1729,
        baselineTxPerHour: 1.4,
      }),
    [],
  );

  const { session, transactions, alerts, lastEventAt, setAlertStatus } =
    useSupervisorState({
      client,
      viewingKey: DEMO_VIEWING_KEY,
      walletAddress: DEMO_WALLET_ADDRESS,
    });

  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);

  const selectedTx = useMemo(
    () => transactions.find((t) => t.hash === selectedTxHash) ?? null,
    [transactions, selectedTxHash],
  );

  const alertCount = useMemo(() => {
    const open = alerts.filter((a) => a.status === 'open');
    return {
      critical: open.filter((a) => a.severity === 'critical').length,
      warning: open.filter((a) => a.severity === 'warning').length,
    };
  }, [alerts]);

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary font-sans">
      <Header />
      <DemoBanner />

      <main className="px-6 py-5">
        <div className="grid grid-cols-12 gap-5">
          {/* Left rail — session info */}
          <div className="col-span-12 lg:col-span-3 space-y-5">
            <SessionPanel session={session} lastEventAt={lastEventAt} />
            <ExportPanel
              transactions={transactions}
              alerts={alerts}
              walletAddress={DEMO_WALLET_ADDRESS}
            />
          </div>

          {/* Main column */}
          <div className="col-span-12 lg:col-span-6 space-y-5">
            <BalanceSummary transactions={transactions} alertCount={alertCount} />
            <BalanceTimeline transactions={transactions} />
            <TransactionStream
              transactions={transactions}
              alerts={alerts}
              selectedTxHash={selectedTxHash}
              onSelectTx={setSelectedTxHash}
            />
          </div>

          {/* Right rail — alerts + inspector */}
          <div className="col-span-12 lg:col-span-3 space-y-5">
            <AlertsPanel
              alerts={alerts}
              onSetStatus={setAlertStatus}
              onSelectTx={setSelectedTxHash}
            />
            <TransactionInspector
              transaction={selectedTx}
              onClose={() => setSelectedTxHash(null)}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-rule-subtle mt-8">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="font-mono text-2xs text-ink-tertiary">
            Midnight Supervisor · Reference Implementation
          </div>
          <div className="font-mono text-2xs text-ink-muted">
            github.com/midnightntwrk/midnight-indexer · GraphQL schema-v1.graphql
          </div>
        </div>
      </footer>
    </div>
  );
}
