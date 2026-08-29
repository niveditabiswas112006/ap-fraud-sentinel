'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CaseStatus, Recommendation, ControllerDecision, VerificationResult } from '@/lib/types';

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  const map: Record<CaseStatus, { label: string; cls: string }> = {
    queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    extracted: { label: 'Extracted', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    grounded: { label: 'Grounded', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    scored: { label: 'Scored', cls: 'bg-sky-50 text-[#0284c7] border-sky-200' },
    reviewed: { label: 'Reviewed', cls: 'bg-sky-50 text-[#0284c7] border-sky-200' },
    verified: { label: 'Verified', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    closed: { label: 'Closed', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    quarantined: { label: 'Quarantined', cls: 'bg-red-50 text-red-600 border-red-200' },
  };
  const v = map[status] ?? map.queued;
  return (
    <Badge variant="outline" className={cn(v.cls, 'rounded-full font-semibold uppercase text-[10px] px-2.5 py-0.5 tracking-wider', className)}>
      {v.label}
    </Badge>
  );
}

export function RecommendationBadge({ rec, className }: { rec: Recommendation | null | undefined; className?: string }) {
  if (!rec) return <Badge variant="outline" className={cn('text-slate-400 rounded-full', className)}>—</Badge>;
  if (rec === 'hold') {
    return (
      <Badge variant="outline" className={cn('bg-red-100 text-red-700 border-red-300 rounded-full font-bold uppercase text-[10px] px-3 py-0.5 tracking-wider flex items-center gap-1', className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
        Hold
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('bg-sky-100 text-[#005577] border-sky-300 rounded-full font-bold uppercase text-[10px] px-3 py-0.5 tracking-wider flex items-center gap-1', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-[#005577]" />
      Pass
    </Badge>
  );
}

export function DecisionBadge({ decision, className }: { decision: ControllerDecision | null | undefined; className?: string }) {
  if (!decision) return <Badge variant="outline" className={cn('text-slate-400 rounded-full', className)}>—</Badge>;
  const map: Record<ControllerDecision, string> = {
    release: 'bg-teal-100 text-teal-800 border-teal-300',
    hold: 'bg-red-100 text-red-700 border-red-300',
    escalate: 'bg-amber-100 text-amber-800 border-amber-300',
  };
  return (
    <Badge variant="outline" className={cn('rounded-full font-bold uppercase text-[10px] px-2.5 py-0.5 tracking-wider', map[decision], className)}>
      {decision}
    </Badge>
  );
}

export function VerificationBadge({ result, className }: { result: VerificationResult | null | undefined; className?: string }) {
  if (!result) return <Badge variant="outline" className={cn('text-slate-400 rounded-full', className)}>No call</Badge>;
  const map: Record<VerificationResult, string> = {
    confirmed: 'bg-teal-100 text-teal-800 border-teal-300',
    denied: 'bg-red-100 text-red-700 border-red-300',
    unclear: 'bg-amber-100 text-amber-800 border-amber-300',
  };
  return (
    <Badge variant="outline" className={cn('rounded-full font-bold uppercase text-[10px] px-2.5 py-0.5 tracking-wider', map[result], className)}>
      {result}
    </Badge>
  );
}

