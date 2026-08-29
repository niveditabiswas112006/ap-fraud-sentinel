'use client';

import { ChevronRight } from 'lucide-react';
import { RecommendationBadge } from '@/components/dashboard/StatusBadge';
import { cn } from '@/lib/utils';
import type { CaseRecord } from '@/lib/types';

import { useAppStore, formatCurrency } from '@/lib/store';

export function CaseCard({ c, onClick }: { c: CaseRecord; onClick?: () => void }) {
  const currency = useAppStore((s) => s.currency);
  const getRiskTrackLabel = (score: number) => {
    if (score >= 0.7) return { label: 'BEHAVIORAL ANOMALY', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (score >= 0.4) return { label: 'DOMAIN LOOKALIKE', bg: 'bg-red-100 text-red-700 border-red-200' };
    return { label: 'STANDARD CLEAR', bg: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  const riskTrack = getRiskTrackLabel(c.riskScore);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-left transition-all duration-150 hover:border-slate-300 hover:bg-white hover:shadow-sm',
      )}
    >
      <div className="flex w-32 shrink-0 flex-col">
        <span className="font-mono text-xs font-bold text-slate-800">{c.caseId}</span>
      </div>

      <div className="flex flex-1 min-w-0 px-2">
        <span className="truncate text-xs font-medium text-slate-700" title={c.vendorName}>
          {c.vendorName}
        </span>
      </div>

      <div className="w-28 shrink-0 text-right font-mono text-xs font-bold text-slate-900">
        {formatCurrency(c.amountUsd, currency)}
      </div>

      <div className="hidden w-44 shrink-0 justify-center sm:flex">
        <span className={cn('rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase', riskTrack.bg)}>
          {riskTrack.label}
        </span>
      </div>

      <div className="flex w-24 shrink-0 justify-center px-2">
        <RecommendationBadge rec={c.recommendation} />
      </div>

      <div className="flex w-8 shrink-0 justify-end text-slate-400 group-hover:text-slate-700">
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

