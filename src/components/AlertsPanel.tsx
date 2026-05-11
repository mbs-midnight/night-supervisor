import { useState } from 'react';
import { ShieldAlert, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ComplianceAlert } from '../types';
import { formatRelativeTime } from '../lib/format';

interface AlertsPanelProps {
  alerts: ComplianceAlert[];
  onSetStatus: (alertId: string, status: ComplianceAlert['status']) => void;
  onSelectTx: (hash: string) => void;
}

const SEVERITY_STYLES = {
  critical: {
    Icon: ShieldAlert,
    iconColor: 'text-signal-critical',
    border: 'border-l-signal-critical',
    badge: 'bg-signal-critical/10 text-signal-critical border-signal-critical/30',
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: 'text-signal-warning',
    border: 'border-l-signal-warning',
    badge: 'bg-signal-warning/10 text-signal-warning border-signal-warning/30',
  },
  info: {
    Icon: AlertTriangle,
    iconColor: 'text-signal-info',
    border: 'border-l-signal-info',
    badge: 'bg-signal-info/10 text-signal-info border-signal-info/30',
  },
};

export function AlertsPanel({ alerts, onSetStatus, onSelectTx }: AlertsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const open = alerts.filter((a) => a.status === 'open');
  const reviewed = alerts.filter((a) => a.status !== 'open');

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-rule-subtle flex items-center justify-between">
        <div>
          <div className="label-micro">Compliance Alerts</div>
          <div className="font-mono text-sm text-ink-secondary mt-1">
            {open.length} open · {reviewed.length} reviewed
          </div>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '500px' }}>
        {open.length === 0 && reviewed.length === 0 && (
          <div className="px-5 py-12 text-center font-mono text-sm text-ink-tertiary">
            No alerts triggered. Detection rules running on every incoming
            transaction.
          </div>
        )}

        {open.map((alert) => {
          const styles = SEVERITY_STYLES[alert.severity];
          const isExpanded = expanded.has(alert.id);
          return (
            <div
              key={alert.id}
              className={`border-l-2 ${styles.border} border-b border-rule-subtle`}
            >
              <button
                onClick={() => toggle(alert.id)}
                className="w-full text-left px-5 py-3 hover:bg-bg-hover transition-colors flex items-start gap-3"
              >
                <styles.Icon size={16} className={`${styles.iconColor} mt-0.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-sans text-sm text-ink-primary truncate">
                      {alert.title}
                    </div>
                    <div className="font-mono text-2xs text-ink-tertiary tabular-nums whitespace-nowrap">
                      {formatRelativeTime(alert.triggeredAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`px-1.5 py-0.5 text-2xs font-mono uppercase tracking-wider border rounded-sm ${styles.badge}`}
                    >
                      {alert.category}
                    </span>
                    <span className="font-mono text-2xs text-ink-tertiary">
                      Rule: {alert.ruleId}
                    </span>
                    <span className="font-mono text-2xs text-ink-tertiary">
                      · {alert.triggeringTransactions.length} transactions
                    </span>
                  </div>
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-ink-tertiary mt-1 shrink-0" /> : <ChevronRight size={14} className="text-ink-tertiary mt-1 shrink-0" />}
              </button>
              {isExpanded && (
                <div className="px-5 pb-4 space-y-3 border-t border-rule-subtle pt-3 bg-bg-base">
                  <div className="font-sans text-sm text-ink-secondary leading-relaxed">
                    {alert.description}
                  </div>

                  <div>
                    <div className="label-micro mb-2">Triggering Transactions</div>
                    <div className="space-y-1">
                      {alert.triggeringTransactions.map((hash) => (
                        <button
                          key={hash}
                          onClick={() => onSelectTx(hash)}
                          className="block w-full text-left font-mono text-2xs text-ink-secondary hover:text-signal-info transition-colors py-1"
                        >
                          {hash}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => onSetStatus(alert.id, 'reviewed')}
                      className="px-3 py-1.5 font-mono text-2xs uppercase tracking-wider bg-bg-elevated text-ink-secondary hover:text-ink-primary border border-rule transition-colors"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      onClick={() => onSetStatus(alert.id, 'filed')}
                      className="px-3 py-1.5 font-mono text-2xs uppercase tracking-wider bg-signal-warning/10 text-signal-warning hover:bg-signal-warning/20 border border-signal-warning/30 transition-colors"
                    >
                      Mark SAR Filed
                    </button>
                    <button
                      onClick={() => onSetStatus(alert.id, 'cleared')}
                      className="px-3 py-1.5 font-mono text-2xs uppercase tracking-wider bg-bg-elevated text-ink-secondary hover:text-ink-primary border border-rule transition-colors"
                    >
                      Mark Cleared
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {reviewed.length > 0 && (
          <>
            <div className="px-5 py-2 border-b border-rule-subtle bg-bg-base">
              <div className="label-micro">Reviewed</div>
            </div>
            {reviewed.map((alert) => {
              const styles = SEVERITY_STYLES[alert.severity];
              return (
                <div
                  key={alert.id}
                  className={`border-l-2 border-rule px-5 py-3 border-b border-rule-subtle opacity-60`}
                >
                  <div className="flex items-start gap-3">
                    <styles.Icon size={14} className="text-ink-tertiary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-sans text-sm text-ink-secondary truncate">
                        {alert.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-2xs text-ink-tertiary uppercase tracking-wider">
                          {alert.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
