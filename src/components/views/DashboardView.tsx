'use client';

import { motion } from 'framer-motion';
import { ShieldAlert, ShieldCheck, DollarSign, IndianRupee, ClipboardList, ArrowRight } from 'lucide-react';
import { StatCallout } from '@/components/dashboard/StatCallout';
import { PipelineTrace } from '@/components/dashboard/PipelineTrace';
import { CaseCard } from '@/components/dashboard/CaseCard';
import { useStats, useCases } from '@/hooks/useDashboardData';
import { useAppStore, formatCurrency } from '@/lib/store';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardView() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: cases } = useCases({ limit: 10 });
  const selectCase = useAppStore((s) => s.selectCase);
  const setView = useAppStore((s) => s.setView);
  const currency = useAppStore((s) => s.currency);
  const runId = useAppStore((s) => s.runId);
  const stages = useAppStore((s) => s.stages);

  const symbol = currency === 'INR' ? '₹' : '$';

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* 4 Stat Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <StatCallout
                label="Cases Screened"
                value={stats?.casesScreened ?? 141}
                accent="default"
                icon={<ClipboardList className="h-4 w-4" />}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <StatCallout
                label="Held For Review"
                value={stats?.casesHeld ?? 7}
                accent="red"
                icon={<ShieldAlert className="h-4 w-4" />}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <StatCallout
                label="Fraud Caught"
                value={stats?.fraudCaught ?? 6}
                accent="steel"
                icon={<ShieldCheck className="h-4 w-4" />}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <StatCallout
                label={`${symbol} Saved`}
                value={formatCurrency(stats?.amountSavedUsd ?? 92744, currency)}
                accent="emerald"
                icon={currency === 'INR' ? <IndianRupee className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
              />
            </motion.div>
          </>
        )}
      </div>

      {/* Pipeline Trace Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Pipeline trace</h2>
          <span className="font-mono text-xs font-semibold text-slate-500">
            Active batch: {runId ?? 'RUN-992'}
          </span>
        </div>
        <PipelineTrace stages={stages} runId={runId} />
      </div>

      {/* Recent Cases Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Recent cases</h2>
          <button
            type="button"
            onClick={() => setView('cases')}
            className="flex items-center gap-1 text-xs font-bold text-[#00668c] hover:underline"
          >
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {(cases?.items ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-slate-500">No cases found in this batch run.</div>
          )}
          {(cases?.items ?? []).map((c) => (
            <CaseCard key={c.caseId} c={c} onClick={() => selectCase(c.caseId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

