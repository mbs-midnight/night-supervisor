import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="bg-signal-info/5 border-b border-signal-info/20">
      <div className="px-6 py-2.5 flex items-center gap-3">
        <Info size={13} className="text-signal-info shrink-0" />
        <div className="font-mono text-2xs text-ink-secondary leading-relaxed">
          <span className="text-signal-info font-medium">REFERENCE IMPLEMENTATION.</span>
          {' '}
          Indexer connection is mocked with deterministic synthetic transactions.
          Detection rules, sanctions screening, and CSV export are real and run
          against the same data shape the production indexer produces. To wire to a
          live Midnight Indexer, replace{' '}
          <code className="text-ink-primary">MockIndexerClient</code> with a GraphQL
          WebSocket client implementing the{' '}
          <code className="text-ink-primary">IndexerClient</code> interface.
        </div>
      </div>
    </div>
  );
}
