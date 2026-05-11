import { Activity, CircleCheck, Loader, Plug, Wifi, WifiOff } from 'lucide-react';
import type { WalletSession } from '../types';
import { formatRelativeTime } from '../lib/format';

interface SessionPanelProps {
  session: WalletSession | null;
  lastEventAt: string | null;
}

const STATUS_DISPLAY: Record<
  WalletSession['status'],
  { label: string; tone: string; Icon: typeof CircleCheck }
> = {
  connecting: { label: 'Connecting', tone: 'text-signal-info', Icon: Plug },
  syncing: { label: 'Syncing history', tone: 'text-signal-warning', Icon: Loader },
  live: { label: 'Live', tone: 'text-signal-ok', Icon: Wifi },
  disconnected: { label: 'Disconnected', tone: 'text-ink-tertiary', Icon: WifiOff },
  error: { label: 'Error', tone: 'text-signal-critical', Icon: WifiOff },
};

export function SessionPanel({ session, lastEventAt }: SessionPanelProps) {
  if (!session) {
    return (
      <div className="panel p-5">
        <div className="label-micro mb-3">Session</div>
        <div className="font-mono text-ink-secondary text-sm flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Initializing client
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_DISPLAY[session.status];
  const StatusIcon = statusInfo.Icon;
  const showSpinner = session.status === 'connecting' || session.status === 'syncing';

  return (
    <div className="panel p-5 space-y-5">
      <div>
        <div className="label-micro mb-2">Session Status</div>
        <div className={`flex items-center gap-2 font-mono text-sm ${statusInfo.tone}`}>
          <StatusIcon
            size={14}
            className={showSpinner ? 'animate-spin' : ''}
          />
          {statusInfo.label}
          {session.status === 'live' && (
            <span className="relative flex h-1.5 w-1.5 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-ok opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal-ok"></span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="label-micro mb-1">Wallet Address</div>
          <div className="font-mono text-2xs text-ink-primary break-all leading-relaxed">
            {session.walletAddress}
          </div>
        </div>

        <div>
          <div className="label-micro mb-1">Viewing Key</div>
          <div className="font-mono text-2xs text-ink-secondary">
            {session.viewingKeyFingerprint}
          </div>
        </div>

        <div>
          <div className="label-micro mb-1">Session ID</div>
          <div className="font-mono text-2xs text-ink-secondary">
            {session.sessionId}
          </div>
        </div>
      </div>

      <div className="border-t border-rule-subtle pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label-micro mb-1">Chain Tip</div>
            <div className="font-mono text-xs text-ink-primary tabular-nums">
              {session.highestIndex.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="label-micro mb-1">Wallet Tip</div>
            <div className="font-mono text-xs text-ink-primary tabular-nums">
              {session.highestRelevantWalletIndex.toLocaleString()}
            </div>
          </div>
        </div>

        {lastEventAt && (
          <div>
            <div className="label-micro mb-1">Last Event</div>
            <div className="font-mono text-xs text-ink-secondary flex items-center gap-1.5">
              <Activity size={11} />
              {formatRelativeTime(lastEventAt)}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-rule-subtle pt-4 space-y-2">
        <div className="label-micro">Connection</div>
        <div className="font-mono text-2xs text-ink-tertiary leading-relaxed">
          MockIndexerClient
          <br />
          (production: indexer-rs.testnet-02.midnight.network)
        </div>
      </div>
    </div>
  );
}
