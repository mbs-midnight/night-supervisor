import { Download } from 'lucide-react';
import type { Transaction, ComplianceAlert } from '../types';
import { exportTransactionsAsCsv, exportAlertsAsCsv, downloadCsv } from '../lib/export';

interface ExportPanelProps {
  transactions: Transaction[];
  alerts: ComplianceAlert[];
  walletAddress: string;
}

export function ExportPanel({ transactions, alerts, walletAddress }: ExportPanelProps) {
  const handleExportTransactions = () => {
    if (transactions.length === 0) return;
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const csv = exportTransactionsAsCsv(transactions, walletAddress, {
      from: sorted[0].timestamp,
      to: sorted[sorted.length - 1].timestamp,
    });
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `midnight-tx-export-${today}.csv`);
  };

  const handleExportAlerts = () => {
    const csv = exportAlertsAsCsv(alerts, walletAddress);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `midnight-alerts-${today}.csv`);
  };

  return (
    <div className="panel p-5">
      <div className="label-micro mb-3">Audit Trail Export</div>
      <div className="font-mono text-2xs text-ink-tertiary mb-4 leading-relaxed">
        RFC 4180 CSV with atomic-unit and decimal columns. Suitable for 5-7 year
        retention obligations under BSA / MLR / AMLR.
      </div>

      <div className="space-y-2">
        <button
          onClick={handleExportTransactions}
          disabled={transactions.length === 0}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-elevated hover:bg-bg-hover border border-rule transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Download size={13} className="text-ink-secondary" />
            <span className="font-mono text-2xs text-ink-primary uppercase tracking-wider">
              Export Transactions
            </span>
          </div>
          <span className="font-mono text-2xs text-ink-tertiary tabular-nums">
            {transactions.length.toLocaleString()}
          </span>
        </button>

        <button
          onClick={handleExportAlerts}
          disabled={alerts.length === 0}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-elevated hover:bg-bg-hover border border-rule transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Download size={13} className="text-ink-secondary" />
            <span className="font-mono text-2xs text-ink-primary uppercase tracking-wider">
              Export Alerts
            </span>
          </div>
          <span className="font-mono text-2xs text-ink-tertiary tabular-nums">
            {alerts.length.toLocaleString()}
          </span>
        </button>
      </div>
    </div>
  );
}
