import { Eye, LogOut } from 'lucide-react';

interface HeaderProps {
  network: string;
  indexerLabel: string;
  onDisconnect?: () => void;
}

export function Header({ network, indexerLabel, onDisconnect }: HeaderProps) {
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
              Reference implementation · v0.2
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="label-micro mb-0.5">Network</div>
            <div className="font-mono text-2xs text-ink-secondary">{network}</div>
          </div>
          <div className="text-right">
            <div className="label-micro mb-0.5">Indexer</div>
            <div className="font-mono text-2xs text-ink-secondary">{indexerLabel}</div>
          </div>
          {onDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              title="End session and wipe key material from memory"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-rule text-ink-secondary hover:text-ink-primary hover:border-rule-strong font-mono text-2xs uppercase tracking-wider transition-colors"
            >
              <LogOut size={12} />
              Disconnect
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
