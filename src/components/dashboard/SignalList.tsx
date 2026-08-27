'use client';

// SignalList — list of signal chips with severity dots (red if fired, slate if not),
// evidence string (mono), score, weight. Tooltips on hover show the full evidence text.

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Signal } from '@/lib/types';
import { cn } from '@/lib/utils';

const PRETTY: Record<string, string> = {
  domain_lookalike: 'Domain lookalike',
  timing_suspicious: 'Timing suspicious',
  amount_anomaly: 'Amount anomaly',
  duplicate: 'Duplicate invoice',
  first_time_vendor: 'First-time vendor',
  threshold_skirting: 'Threshold skirting',
  schema_validation_fail: 'Schema validation fail',
  malformed_id: 'Malformed invoice id',
};

export function SignalList({ signals, className }: { signals: Signal[]; className?: string }) {
  if (!signals.length) {
    return <div className="text-xs text-muted-foreground">No signals recorded for this case.</div>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <ul className={cn('flex flex-col gap-2', className)}>
        {signals.map((s) => (
          <Tooltip key={s.name}>
            <TooltipTrigger asChild>
              <li className="flex items-center gap-3 rounded-md border border-border/60 bg-card/60 px-3 py-2">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    s.fired ? 'bg-red-500 shadow-[0_0_8px] shadow-red-500/60' : 'bg-slate-600',
                  )}
                  aria-label={s.fired ? 'fired' : 'silent'}
                />
                <div className="flex flex-1 min-w-0 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {PRETTY[s.name] ?? s.name.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      w={s.weight.toFixed(2)}
                    </span>
                  </div>
                  <code className="block truncate font-mono text-[11px] text-muted-foreground">
                    {s.evidence}
                  </code>
                </div>
                <div className="ml-2 text-right">
                  <div className="font-mono text-sm font-semibold">{s.score.toFixed(2)}</div>
                  <div className="text-[10px] text-muted-foreground">score</div>
                </div>
              </li>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <div className="flex flex-col gap-1 text-xs">
                <div className="font-mono">{s.name}</div>
                <div className="font-mono text-muted-foreground">{s.evidence}</div>
                <div className="text-muted-foreground">
                  fired={String(s.fired)} · weight={s.weight.toFixed(2)} · score={s.score.toFixed(2)}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </ul>
    </TooltipProvider>
  );
}
