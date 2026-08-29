'use client';

import { motion } from 'framer-motion';
import {
  Check,
  Inbox,
  FileText,
  Network,
  Radar,
  Bot,
  PhoneCall,
  Gavel,
  type LucideIcon,
} from 'lucide-react';
import type { TraceStage } from '@/lib/types';
import { cn } from '@/lib/utils';

const STAGES: { name: TraceStage['name']; label: string; icon: LucideIcon }[] = [
  { name: 'intake', label: 'Intake', icon: Inbox },
  { name: 'extraction', label: 'Extraction', icon: FileText },
  { name: 'grounding', label: 'Grounding', icon: Network },
  { name: 'signals', label: 'Signals', icon: Radar },
  { name: 'agents', label: 'Agents', icon: Bot },
  { name: 'verification', label: 'Verification', icon: PhoneCall },
  { name: 'gate', label: 'Gate', icon: Gavel },
];

export function PipelineTrace({ stages, runId }: { stages: TraceStage[]; runId?: string | null }) {
  const map = new Map(stages.map((s) => [s.name, s] as const));
  const completedCount = stages.filter((s) => s.status === 'complete').length;
  const activeStage = stages.find((s) => s.status === 'running');
  const activeInvoiceNo = activeStage?.message?.match(/INV-\d{4}-\d+/)?.[0] || 'INV-2026-4418';

  return (
    <div className="flex flex-col gap-4">
      {/* Light container with thick 3px black doodle outline border & offset shadow */}
      <div className="relative overflow-hidden rounded-2xl border-[3.5px] border-slate-900 bg-white p-6 sm:p-8 text-slate-900 shadow-[5px_5px_0px_0px_rgba(15,23,42,1)]">
        <div className="flex min-w-max items-center justify-between gap-4">
          {STAGES.map((stage, i) => {
            const s = map.get(stage.name);
            const status = s?.status ?? 'idle';
            const isComplete = status === 'complete';
            const isRunning = status === 'running';
            const Icon = stage.icon;

            return (
              <div key={stage.name} className="flex flex-1 items-center gap-3">
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={cn(
                      'relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300',
                      isComplete
                        ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-600 shadow-sm'
                        : isRunning
                          ? 'bg-sky-50 text-[#00668c] border-2 border-[#00668c] ring-4 ring-sky-100 shadow-md scale-105'
                          : 'bg-slate-100 text-slate-500 border-2 border-slate-300',
                    )}
                  >
                    {isComplete ? <Check className="h-5 w-5 font-extrabold stroke-[3] text-emerald-700" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="text-center">
                    <span className={cn('text-xs font-bold block transition-colors duration-200', isRunning ? 'text-[#00668c]' : isComplete ? 'text-emerald-800' : 'text-slate-600')}>
                      {stage.label}
                    </span>
                  </div>
                </div>

                {i < STAGES.length - 1 && (
                  <div className="h-0.5 flex-1 bg-slate-200">
                    <div
                      className={cn('h-full transition-all duration-500', isComplete ? 'bg-emerald-600' : 'bg-transparent')}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Processing badge overlay — fixed height container to eliminate layout shift */}
        <div className="mt-6 flex h-8 items-center justify-center">
          {activeStage ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-bold text-white shadow-sm border border-slate-800 transition-all duration-300">
              <span className="h-2 w-2 rounded-full bg-[#38bdf8] animate-pulse" />
              <span>Processing {activeInvoiceNo}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Batch Complete · 141 Invoices Processed</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar under container */}
      <div className="flex items-center gap-4 px-1 pt-1">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 border border-slate-300">
          <div
            className="h-full bg-[#00668c] transition-all duration-500"
            style={{ width: `${Math.round(((completedCount || 1) / STAGES.length) * 100)}%` }}
          />
        </div>
        <span className="text-xs font-bold text-slate-700 font-mono">
          {completedCount * 14} / 141
        </span>
      </div>
    </div>
  );
}

