import { Info, Radio } from 'lucide-react';

interface DemoBannerProps {
  mode: 'live' | 'mock';
  indexerHost: string;
}

export function DemoBanner({ mode, indexerHost }: DemoBannerProps) {
  if (mode === 'live') {
    return (
      <div className="bg-signal-ok/5 border-b border-signal-ok/20">
        <div className="px-6 py-2.5 flex items-center gap-3">
          <Radio size={13} className="text-signal-ok shrink-0" />
          <div className="font-mono text-2xs text-ink-secondary leading-relaxed">
            <span className="text-signal-ok font-medium">LIVE.</span>{' '}
            Connected to {indexerHost}. The viewing key is registered with the indexer
            via <code className="text-ink-primary">connect</code>; every zswap ledger event
            on the chain is replayed locally through ledger-v9 with the wallet's keys, so
            amounts shown are real decrypted coin movements. Key material lives in this tab's
            memory only and is wiped on Disconnect or reload. Counterparties of shielded
            transfers are not recoverable from a viewing key and are shown as undisclosed.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-signal-info/5 border-b border-signal-info/20">
      <div className="px-6 py-2.5 flex items-center gap-3">
        <Info size={13} className="text-signal-info shrink-0" />
        <div className="font-mono text-2xs text-ink-secondary leading-relaxed">
          <span className="text-signal-info font-medium">SYNTHETIC DEMO.</span>{' '}
          Indexer connection is mocked with deterministic synthetic transactions.
          Detection rules, sanctions screening, and CSV export are real and run against
          the same data shape the live client produces. Disconnect and enter a wallet
          seed to supervise a real wallet on {indexerHost}.
        </div>
      </div>
    </div>
  );
}
