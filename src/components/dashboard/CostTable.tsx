'use client';

// CostTable — 4-row cost table (signals, llm, call, total) + a horizontal bar chart
// of the cost distribution. Used in the Runs view end-card.

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Cell, Tooltip } from 'recharts';
import { COST } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  signalsCost: number;
  llmCost: number;
  callCost: number;
  totalCost: number;
  casesProcessed: number;
  className?: string;
}

const COLORS = ['#1f6c92', '#7fb8d6', '#f59e0b'];

export function CostTable({ signalsCost, llmCost, callCost, totalCost, casesProcessed, className }: Props) {
  const rows = [
    { label: 'Signals', value: signalsCost, unit: '$/inv', expected: COST.signals_per_invoice, color: COLORS[0] },
    { label: 'LLM agents', value: llmCost, unit: '$/review', expected: COST.llm_per_reviewed_case, color: COLORS[1] },
    { label: 'Verification call', value: callCost, unit: '$/held', expected: COST.call_per_held_case, color: COLORS[2] },
  ];
  const perInvoice = casesProcessed > 0 ? totalCost / casesProcessed : 0;
  const chartData = rows.map((r) => ({ name: r.label, value: Number(r.value.toFixed(4)), color: r.color }));

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="overflow-hidden rounded-md border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Cost driver</th>
              <th className="px-3 py-2 text-right">Spent</th>
              <th className="px-3 py-2 text-right">Unit</th>
              <th className="px-3 py-2 text-right">List price</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/40">
                <td className="px-3 py-2 text-foreground">{r.label}</td>
                <td className="px-3 py-2 text-right">${r.value.toFixed(4)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.unit}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">${r.expected.toFixed(4)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="px-3 py-2 font-semibold text-foreground">Total</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-300">${totalCost.toFixed(4)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">—</td>
              <td className="px-3 py-2 text-right text-muted-foreground">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1f2937' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `$${v.toFixed(2)}`}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid #1f2937',
                borderRadius: 6,
                fontSize: 12,
                color: '#e2e8f0',
              }}
              formatter={(v: number) => [`$${Number(v).toFixed(4)}`, 'spent']}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1 rounded-md border border-emerald-700/40 bg-emerald-950/20 p-3 text-center">
        <div className="text-[11px] uppercase tracking-wider text-emerald-400/80">Per invoice</div>
        <div className="font-mono text-2xl font-semibold text-emerald-300">${perInvoice.toFixed(4)}</div>
        <div className="text-[11px] text-muted-foreground">
          Target: ${COST.signals_per_invoice.toFixed(4)} floor · ${0.04.toFixed(2)} end-card
        </div>
      </div>
    </div>
  );
}
