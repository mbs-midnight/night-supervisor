import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { DemoBanner } from './components/DemoBanner';
import { EntryScreen } from './components/EntryScreen';
import { SessionPanel } from './components/SessionPanel';
import { BalanceSummary } from './components/BalanceSummary';
import { BalanceTimeline } from './components/BalanceTimeline';
import { TransactionStream } from './components/TransactionStream';
import { AlertsPanel } from './components/AlertsPanel';
import { TransactionInspector } from './components/TransactionInspector';
import { ExportPanel } from './components/ExportPanel';
import { useSupervisorState } from './lib/use-supervisor-state';
import { buildLiveWiring, buildMockWiring, type SessionWiring } from './lib/session-wiring';
import { INDEXER_HOST, NETWORK_ID, STACK_LABEL } from './lib/config';

export default function App() {
  const [wiring, setWiring] = useState<SessionWiring | null>(null);

  const endSession = useCallback(() => {
    setWiring((w) => {
      w?.dispose();
      return null;
    });
  }, []);

  // Wipe key material if the tab is closed, reloaded, or backgrounded for good.
  useEffect(() => {
    if (!wiring) return;
    const onHide = () => wiring.dispose();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [wiring]);

  if (!wiring) {
    return (
      <EntryScreen
        onSupervise={(seed) => {
          try {
            setWiring(buildLiveWiring(seed));
            return null;
          } catch (err) {
            return err instanceof Error ? err.message : String(err);
          }
        }}
        onDemo={() => setWiring(buildMockWiring())}
      />
    );
  }

  return <Dashboard key={wiring.walletAddress} wiring={wiring} onDisconnect={endSession} />;
}

interface DashboardProps {
  wiring: SessionWiring;
  onDisconnect: () => void;
}

function Dashboard({ wiring, onDisconnect }: DashboardProps) {
  const live = wiring.mode === 'live';

  const { session, transactions, alerts, lastEventAt, setAlertStatus } =
    useSupervisorState({
      client: wiring.client,
      viewingKey: wiring.viewingKey,
      walletAddress: wiring.walletAddress,
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
      <Header
        network={live ? NETWORK_ID : `${NETWORK_ID} (synthetic)`}
        indexerLabel={live ? 'schema v4 · live' : 'schema v4 · mocked'}
        onDisconnect={onDisconnect}
      />
      <DemoBanner mode={wiring.mode} indexerHost={INDEXER_HOST} />

      <main className="px-6 py-5">
        <div className="grid grid-cols-12 gap-5">
          {/* Left rail — session info */}
          <div className="col-span-12 lg:col-span-3 space-y-5">
            <SessionPanel
              session={session}
              lastEventAt={lastEventAt}
              connectionLabel={wiring.connectionLabel}
              live={live}
            />
            <ExportPanel
              transactions={transactions}
              alerts={alerts}
              walletAddress={wiring.walletAddress}
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
              live={live}
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
            github.com/midnightntwrk/midnight-indexer · schema-v4.graphql · {STACK_LABEL}
          </div>
        </div>
      </footer>
    </div>
  );
}
