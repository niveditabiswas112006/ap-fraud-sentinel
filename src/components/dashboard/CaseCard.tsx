'use client';

// CaseCard — compact case summary used in lists/tables. Single row.

import { ChevronRight } from 'lucide-react';
import { RiskGauge } from '@/components/dashboard/RiskGauge';
import {
  StatusBadge,
  RecommendationBadge,
  DecisionBadge,
} from '@/components/dashboard/StatusBadge';
import { cn } from '@/lib/utils';
import type { CaseRecord } from '@/lib/types';

export function CaseCard({ c, onClick }: { c: CaseRecord; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border border-border/50 bg-card/60 px-3 py-2 text-left',
        'transition-colors hover:border-[#1f6c92]/60 hover:bg-card',
      )}
    >
      <div className="flex w-24 shrink-0 flex-col gap-0.5">
        <code className="font-mono text-xs text-foreground">{c.caseId}</code>
        <span className="truncate text-[11px] text-muted-foreground" title={c.vendorName}>
          {c.vendorName}
        </span>
      </div>
      <div className="hidden w-32 shrink-0 truncate sm:block" title={c.invoiceNumber}>
        <code className="font-mono text-[11px] text-muted-foreground">{c.invoiceNumber}</code>
      </div>
      <div className="w-28 shrink-0 text-right font-mono text-sm">
        ${Number(c.amountUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="hidden w-32 shrink-0 sm:block">
        <RiskGauge score={c.riskScore} showLabel={false} />
      </div>
      <div className="flex w-32 shrink-0 items-center gap-1.5">
        <StatusBadge status={c.status} />
        <RecommendationBadge rec={c.recommendation} />
      </div>
      <div className="hidden w-20 shrink-0 md:block">
        <DecisionBadge decision={c.decision} />
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
