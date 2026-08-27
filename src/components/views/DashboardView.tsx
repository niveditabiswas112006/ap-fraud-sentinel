'use client';

// DashboardView — home view. Stat callouts + pipeline trace + recent cases + thesis callout.

import { motion } from 'framer-motion';
import { ShieldAlert, ShieldCheck, DollarSign, FileSearch, Sparkles } from 'lucide-react';
import { StatCallout } from '@/components/dashboard/StatCallout';
import { PipelineTrace } from '@/components/dashboard/PipelineTrace';
import { CaseCard } from '@/components/dashboard/CaseCard';
import { useStats, useCases } from '@/hooks/useDashboardData';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardView() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: cases } = useCases({ limit: 10 });
  const selectCase = useAppStore((s) => s.selectCase);
  const setView = useAppStore((s) => s.setView);
  const stages = useAppStore((s) => s.stages);
  const runId = useAppStore((s) => s.runId);

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statsLoading ? (
          <>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <StatCallout
                label="Cases screened"
                value={stats?.casesScreened ?? 0}
                icon={<FileSearch className="h-4 w-4" />}
                hint="across the latest batch run"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <StatCallout
                label="Held for review"
                value={stats?.casesHeld ?? 0}
                accent="red"
                icon={<ShieldAlert className="h-4 w-4" />}
                hint="risk score crossed 0.40 threshold"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <StatCallout
                label="Fraud caught"
                value={stats?.fraudCaught ?? 0}
                accent="emerald"
                icon={<ShieldCheck className="h-4 w-4" />}
                hint="grounded against the truth table"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <StatCallout
                label="$ saved"
                value={fmtMoney(stats?.amountSavedUsd ?? 0)}
                accent="emerald"
                icon={<DollarSign className="h-4 w-4" />}
                hint="held before disbursement"
              />
            </motion.div>
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#7fb8d6]" />
              Pipeline trace
            </span>
            <span className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
              7-stage RocketRide
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineTrace stages={stages} runId={runId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Recent cases</span>
            <button
              type="button"
              onClick={() => setView('cases')}
              className="text-[11px] font-normal uppercase tracking-wider text-[#7fb8d6] hover:underline"
            >
              view all →
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            {(cases?.items ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No cases yet. Click “Run batch” to start.</div>
            )}
            {(cases?.items ?? []).map((c) => (
              <CaseCard key={c.caseId} c={c} onClick={() => selectCase(c.caseId)} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-[#1f6c92]/30 bg-[#1f6c92]/[0.07] p-4">
        <div className="text-[11px] uppercase tracking-wider text-[#7fb8d6]">Thesis</div>
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">
          The only AP control that catches Business Email Compromise is out-of-band verification —
          humans skip it because it&apos;s boring, so we ship it as software.
        </p>
      </div>
    </div>
  );
}
