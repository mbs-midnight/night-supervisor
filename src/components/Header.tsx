import { Eye } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-rule bg-bg-base">
      <div className="px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-to-br from-signal-ok to-signal-info flex items-center justify-center rounded-sm">
            <Eye size={14} className="text-bg-base" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-sans text-sm text-ink-primary font-medium tracking-tight">
              Midnight Supervisor
            </div>
            <div className="font-mono text-2xs text-ink-tertiary tracking-wider uppercase">
              Reference implementation · v0.1
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="label-micro mb-0.5">Network</div>
            <div className="font-mono text-2xs text-ink-secondary">testnet-02</div>
          </div>
          <div className="text-right">
            <div className="label-micro mb-0.5">Indexer Version</div>
            <div className="font-mono text-2xs text-ink-secondary">2.1.4 (mocked)</div>
          </div>
        </div>
      </div>
    </header>
  );
}
