'use client';

// RiskGauge — horizontal bar showing risk_score 0.0-1.0 with the 0.40 hold threshold marked.
// Color: < 0.40 = steel-blue, >= 0.40 = red (above the hold line).

import { RISK_HOLD_THRESHOLD } from '@/lib/types';
import { cn } from '@/lib/utils';

export function RiskGauge({
  score,
  className,
  showLabel = true,
}: {
  score: number;
  className?: string;
  showLabel?: boolean;
}) {
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  const pct = s * 100;
  const holdPct = RISK_HOLD_THRESHOLD * 100;
  const above = s >= RISK_HOLD_THRESHOLD;
  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="mb-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span>risk</span>
          <span className={cn('font-mono font-semibold', above ? 'text-red-300' : 'text-[#7fb8d6]')}>
            {s.toFixed(2)}
          </span>
        </div>
      )}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-border/60 bg-slate-900/60">
        <div
          className={cn(
            'absolute inset-y-0 left-0 transition-all duration-500 ease-out',
            above ? 'bg-red-500/80' : 'bg-[#1f6c92]',
          )}
          style={{ width: `${pct}%` }}
        />
        {/* 0.40 threshold marker */}
        <div
          className="absolute inset-y-0 z-10 w-px bg-amber-400/90"
          style={{ left: `${holdPct}%` }}
          aria-hidden
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0.00</span>
          <span className="text-amber-400/80">threshold {RISK_HOLD_THRESHOLD.toFixed(2)}</span>
          <span>1.00</span>
        </div>
      )}
    </div>
  );
}
