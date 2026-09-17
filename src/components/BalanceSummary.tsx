import type { Transaction } from '../types';
import { getCurrentBalances, primaryToken } from '../lib/metrics';
import { formatAtomic } from '../lib/format';

interface BalanceSummaryProps {
  transactions: Transaction[];
  alertCount: { critical: number; warning: number };
}

export function BalanceSummary({ transactions, alertCount }: BalanceSummaryProps) {
  const balances = getCurrentBalances(transactions);
  const usdFormatted = balances.totalUsdEquivalent.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const incomingCount = transactions.filter(
    (t) => t.direction === 'incoming' && t.applyStage === 'Success',
  ).length;
  const outgoingCount = transactions.filter(
    (t) => t.direction === 'outgoing' && t.applyStage === 'Success',
  ).length;
  const selfCount = transactions.filter(
    (t) => t.direction === 'self' && t.applyStage === 'Success',
  ).length;
  const primary = primaryToken(balances.byToken);

  return (
    <div className="grid grid-cols-4 gap-px bg-rule-subtle">
      <div className="bg-bg-panel p-5">
        <div className="label-micro mb-2">Total Equivalent</div>
        <div className="font-mono text-2xl text-ink-primary tabular-nums">
          ${usdFormatted}
        </div>
        <div className="text-2xs text-ink-tertiary mt-1 font-mono">
          USD-equivalent · ref. rates
        </div>
      </div>

      <div className="bg-bg-panel p-5">
        <div className="label-micro mb-2">{primary} Balance</div>
        <div className="font-mono text-2xl text-ink-primary tabular-nums">
          {formatAtomic(balances.byToken[primary], primary)}
        </div>
        <div className="text-2xs text-ink-tertiary mt-1 font-mono">
          {primary === 'tUSDM' || primary === 'tUSDC' || primary === 'tEUR'
            ? 'Stablecoin holdings'
            : 'Largest decrypted holding'}
        </div>
      </div>

      <div className="bg-bg-panel p-5">
        <div className="label-micro mb-2">Transaction Volume</div>
        <div className="font-mono text-2xl text-ink-primary tabular-nums">
          {(incomingCount + outgoingCount + selfCount).toLocaleString()}
        </div>
        <div className="text-2xs text-ink-tertiary mt-1 font-mono">
          {incomingCount.toLocaleString()} in / {outgoingCount.toLocaleString()} out
          {selfCount > 0 && ` / ${selfCount.toLocaleString()} self`}
        </div>
      </div>

      <div className="bg-bg-panel p-5">
        <div className="label-micro mb-2">Open Alerts</div>
        <div className="flex items-baseline gap-3">
          <div className="font-mono text-2xl text-signal-critical tabular-nums">
            {alertCount.critical}
          </div>
          <div className="font-mono text-lg text-signal-warning tabular-nums">
            {alertCount.warning}
          </div>
        </div>
        <div className="text-2xs text-ink-tertiary mt-1 font-mono">
          critical · warning
        </div>
      </div>
    </div>
  );
}
