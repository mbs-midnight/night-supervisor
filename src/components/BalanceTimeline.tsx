import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Transaction } from '../types';
import { deriveBalanceTimeline } from '../lib/metrics';

interface BalanceTimelineProps {
  transactions: Transaction[];
}

const TOKENS_TO_PLOT = ['tUSDM', 'tUSDC', 'tEUR'] as const;

const TOKEN_COLORS: Record<(typeof TOKENS_TO_PLOT)[number], string> = {
  tUSDM: '#319795',
  tUSDC: '#3182CE',
  tEUR: '#9F7AEA',
};

interface ChartDatum {
  ts: number;
  label: string;
  tUSDM: number;
  tUSDC: number;
  tEUR: number;
}

export function BalanceTimeline({ transactions }: BalanceTimelineProps) {
  const data = useMemo<ChartDatum[]>(() => {
    const snapshots = deriveBalanceTimeline(transactions);
    return snapshots.map((s) => {
      const ts = new Date(s.timestamp).getTime();
      return {
        ts,
        label: new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tUSDM: Number(BigInt(s.balanceByToken.tUSDM)) / 1_000_000,
        tUSDC: Number(BigInt(s.balanceByToken.tUSDC)) / 1_000_000,
        tEUR: Number(BigInt(s.balanceByToken.tEUR)) / 1_000_000,
      };
    });
  }, [transactions]);

  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="label-micro">Balance Evolution</div>
          <div className="font-mono text-sm text-ink-secondary mt-1">
            Stablecoin holdings over time, post viewing-key decryption
          </div>
        </div>
        <div className="flex gap-4">
          {TOKENS_TO_PLOT.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <div
                className="w-3 h-0.5"
                style={{ background: TOKEN_COLORS[t] }}
              />
              <span className="font-mono text-2xs text-ink-secondary">{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="0" stroke="#1F2227" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#718096', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#2A2E34' }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: '#718096', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#2A2E34' }}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()
              }
            />
            <Tooltip
              contentStyle={{
                background: '#15171A',
                border: '1px solid #2A2E34',
                borderRadius: '2px',
                fontFamily: 'JetBrains Mono',
                fontSize: '11px',
                color: '#F7FAFC',
              }}
              labelStyle={{ color: '#A0AEC0', marginBottom: '4px' }}
              formatter={(value: number, name: string) => [
                value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
                name,
              ]}
            />
            {TOKENS_TO_PLOT.map((t) => (
              <Line
                key={t}
                type="stepAfter"
                dataKey={t}
                stroke={TOKEN_COLORS[t]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: TOKEN_COLORS[t] }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
