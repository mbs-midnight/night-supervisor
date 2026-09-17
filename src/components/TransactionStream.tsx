import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, AlertTriangle, ShieldAlert, Check } from 'lucide-react';
import type { Transaction, ComplianceAlert } from '../types';
import { formatAtomic, shortAddress, shortHash, formatRelativeTime } from '../lib/format';
import { SANCTIONS_LOOKUP } from '../data/sanctions-list';

interface TransactionStreamProps {
  transactions: Transaction[];
  alerts: ComplianceAlert[];
  selectedTxHash: string | null;
  onSelectTx: (hash: string | null) => void;
}

export function TransactionStream({
  transactions,
  alerts,
  selectedTxHash,
  onSelectTx,
}: TransactionStreamProps) {
  const [filter, setFilter] = useState<'all' | 'flagged' | 'incoming' | 'outgoing' | 'self'>('all');

  const flaggedTxs = new Set<string>();
  const txAlertSeverity = new Map<string, 'critical' | 'warning'>();
  for (const alert of alerts) {
    for (const hash of alert.triggeringTransactions) {
      flaggedTxs.add(hash);
      const existing = txAlertSeverity.get(hash);
      if (alert.severity === 'critical') {
        txAlertSeverity.set(hash, 'critical');
      } else if (alert.severity === 'warning' && existing !== 'critical') {
        txAlertSeverity.set(hash, 'warning');
      }
    }
  }

  const filtered = transactions.filter((tx) => {
    if (filter === 'flagged') return flaggedTxs.has(tx.hash);
    if (filter === 'incoming') return tx.direction === 'incoming';
    if (filter === 'outgoing') return tx.direction === 'outgoing';
    if (filter === 'self') return tx.direction === 'self';
    return true;
  });

  return (
    <div className="panel flex flex-col" style={{ minHeight: '500px' }}>
      <div className="px-5 py-4 border-b border-rule-subtle flex items-center justify-between">
        <div>
          <div className="label-micro">Decrypted Transaction Stream</div>
          <div className="font-mono text-sm text-ink-secondary mt-1">
            {filtered.length.toLocaleString()} of {transactions.length.toLocaleString()} transactions
          </div>
        </div>

        <div className="flex bg-bg-base p-0.5 rounded-sm">
          {(['all', 'flagged', 'incoming', 'outgoing', 'self'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-2xs font-mono uppercase tracking-wider transition-colors ${
                filter === f
                  ? 'bg-bg-elevated text-ink-primary'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              {f}
              {f === 'flagged' && flaggedTxs.size > 0 && (
                <span className="ml-1.5 text-signal-warning">{flaggedTxs.size}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ maxHeight: '700px' }}>
        <table className="w-full">
          <thead className="sticky top-0 bg-bg-panel z-10 border-b border-rule-subtle">
            <tr>
              <th className="text-left px-5 py-2.5 label-micro">Time</th>
              <th className="text-left px-2 py-2.5 label-micro">Direction</th>
              <th className="text-right px-2 py-2.5 label-micro">Amount</th>
              <th className="text-left px-2 py-2.5 label-micro">Token</th>
              <th className="text-left px-2 py-2.5 label-micro">Counterparty</th>
              <th className="text-left px-2 py-2.5 label-micro">Hash</th>
              <th className="text-center px-5 py-2.5 label-micro">Flag</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx) => {
              const sanctionsHit = SANCTIONS_LOOKUP.has(tx.counterpartyAddress);
              const severity = txAlertSeverity.get(tx.hash);
              const isSelected = tx.hash === selectedTxHash;
              const isFailed = tx.applyStage !== 'Success';

              return (
                <tr
                  key={`${tx.hash}:${tx.tokenType}`}
                  onClick={() => onSelectTx(isSelected ? null : tx.hash)}
                  className={`border-b border-rule-subtle cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-bg-elevated'
                      : 'hover:bg-bg-hover'
                  }`}
                >
                  <td className="px-5 py-2.5 font-mono text-2xs text-ink-secondary tabular-nums whitespace-nowrap">
                    {formatRelativeTime(tx.timestamp)}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className={`flex items-center gap-1.5 ${
                      tx.direction === 'incoming'
                        ? 'text-signal-ok'
                        : tx.direction === 'self'
                          ? 'text-ink-tertiary'
                          : 'text-ink-secondary'
                    }`}>
                      {tx.direction === 'incoming' ? (
                        <ArrowDownLeft size={12} />
                      ) : tx.direction === 'self' ? (
                        <ArrowLeftRight size={12} />
                      ) : (
                        <ArrowUpRight size={12} />
                      )}
                      <span className="font-mono text-2xs uppercase tracking-wider">
                        {tx.direction === 'incoming' ? 'IN' : tx.direction === 'self' ? 'SELF' : 'OUT'}
                      </span>
                    </div>
                  </td>
                  <td className={`px-2 py-2.5 font-mono text-xs tabular-nums text-right whitespace-nowrap ${
                    isFailed ? 'text-ink-tertiary line-through' : 'text-ink-primary'
                  }`}>
                    {formatAtomic(tx.amount, tx.tokenType)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-2xs text-ink-secondary uppercase tracking-wider">
                    {tx.tokenType}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-2xs text-ink-secondary whitespace-nowrap">
                    {sanctionsHit && (
                      <ShieldAlert
                        size={12}
                        className="inline mr-1.5 text-signal-critical"
                      />
                    )}
                    {tx.counterpartyAddress.startsWith('undisclosed') ? (
                      <span className="text-ink-tertiary italic">{tx.counterpartyAddress}</span>
                    ) : (
                      shortAddress(tx.counterpartyAddress, 14, 4)
                    )}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-2xs text-ink-tertiary whitespace-nowrap">
                    {shortHash(tx.hash)}
                  </td>
                  <td className="px-5 py-2.5 text-center">
                    {severity === 'critical' && (
                      <ShieldAlert size={14} className="inline text-signal-critical" />
                    )}
                    {severity === 'warning' && (
                      <AlertTriangle size={14} className="inline text-signal-warning" />
                    )}
                    {!severity && tx.applyStage === 'Success' && (
                      <Check size={12} className="inline text-ink-muted" />
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center font-mono text-sm text-ink-tertiary">
                  No transactions match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
