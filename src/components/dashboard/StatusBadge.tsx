'use client';

// StatusBadge — consistent color mapping for case status / recommendation / decision.
// Steel-blue (#1f6c92) is used for the pipeline trace; here we use emerald/red/amber/steel
// per the §5.5 accent spec.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CaseStatus, Recommendation, ControllerDecision, VerificationResult } from '@/lib/types';

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  const map: Record<CaseStatus, { label: string; cls: string }> = {
    queued: { label: 'Queued', cls: 'bg-slate-700/40 text-slate-300 border-slate-600/40' },
    extracted: { label: 'Extracted', cls: 'bg-slate-700/40 text-slate-300 border-slate-600/40' },
    grounded: { label: 'Grounded', cls: 'bg-slate-700/40 text-slate-300 border-slate-600/40' },
    scored: { label: 'Scored', cls: 'bg-[#1f6c92]/25 text-[#7fb8d6] border-[#1f6c92]/40' },
    reviewed: { label: 'Reviewed', cls: 'bg-[#1f6c92]/25 text-[#7fb8d6] border-[#1f6c92]/40' },
    verified: { label: 'Verified', cls: 'bg-amber-600/20 text-amber-300 border-amber-600/40' },
    closed: { label: 'Closed', cls: 'bg-emerald-700/20 text-emerald-300 border-emerald-600/40' },
    quarantined: { label: 'Quarantined', cls: 'bg-red-900/30 text-red-300 border-red-700/40' },
  };
  const v = map[status] ?? map.queued;
  return (
    <Badge variant="outline" className={cn(v.cls, 'font-mono uppercase text-[10px] tracking-wider', className)}>
      {v.label}
    </Badge>
  );
}

export function RecommendationBadge({ rec, className }: { rec: Recommendation | null | undefined; className?: string }) {
  if (!rec) return <Badge variant="outline" className={cn('text-slate-400', className)}>—</Badge>;
  if (rec === 'hold') {
    return (
      <Badge variant="outline" className={cn('bg-red-700/20 text-red-300 border-red-700/50 font-mono uppercase text-[10px] tracking-wider', className)}>
        Hold
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('bg-emerald-700/20 text-emerald-300 border-emerald-700/50 font-mono uppercase text-[10px] tracking-wider', className)}>
      Pass
    </Badge>
  );
}

export function DecisionBadge({ decision, className }: { decision: ControllerDecision | null | undefined; className?: string }) {
  if (!decision) return <Badge variant="outline" className={cn('text-slate-500', className)}>—</Badge>;
  const map: Record<ControllerDecision, string> = {
    release: 'bg-emerald-700/30 text-emerald-300 border-emerald-600/50',
    hold: 'bg-red-800/30 text-red-300 border-red-700/50',
    escalate: 'bg-amber-700/30 text-amber-300 border-amber-600/50',
  };
  return (
    <Badge variant="outline" className={cn('font-mono uppercase text-[10px] tracking-wider', map[decision], className)}>
      {decision}
    </Badge>
  );
}

export function VerificationBadge({ result, className }: { result: VerificationResult | null | undefined; className?: string }) {
  if (!result) return <Badge variant="outline" className={cn('text-slate-500', className)}>No call</Badge>;
  const map: Record<VerificationResult, string> = {
    confirmed: 'bg-emerald-700/20 text-emerald-300 border-emerald-600/40',
    denied: 'bg-red-800/30 text-red-300 border-red-700/50',
    unclear: 'bg-amber-700/20 text-amber-300 border-amber-600/40',
  };
  return (
    <Badge variant="outline" className={cn('font-mono uppercase text-[10px] tracking-wider', map[result], className)}>
      {result}
    </Badge>
  );
}
