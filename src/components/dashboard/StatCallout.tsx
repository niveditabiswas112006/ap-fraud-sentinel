'use client';

// StatCallout — the big-number stat block for the dashboard home.
// Big mono numbers, small labels, optional accent color, optional delta.

import { cn } from '@/lib/utils';

export function StatCallout({
  label,
  value,
  accent = 'default',
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  accent?: 'default' | 'red' | 'emerald' | 'steel' | 'amber';
  hint?: string;
  icon?: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    default: 'text-foreground',
    red: 'text-red-400',
    emerald: 'text-emerald-400',
    steel: 'text-[#7fb8d6]',
    amber: 'text-amber-400',
  };
  const barMap: Record<string, string> = {
    default: 'bg-border',
    red: 'bg-red-500/70',
    emerald: 'bg-emerald-500/70',
    steel: 'bg-[#1f6c92]',
    amber: 'bg-amber-500/70',
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/80 p-5">
      <div className={cn('absolute left-0 top-0 h-full w-1', barMap[accent])} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>{label}</span>
          {icon && <span className="opacity-70">{icon}</span>}
        </div>
        <div className={cn('font-mono text-3xl font-semibold tracking-tight sm:text-4xl', accentMap[accent])}>
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
