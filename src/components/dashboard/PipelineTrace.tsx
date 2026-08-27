'use client';

// PipelineTrace — horizontal SVG of the 7 stages (intake → extraction → grounding → signals →
// agents → verification → gate). Each stage is a chip with an icon, label, and status color
// (idle = slate, running = steel-blue pulse, blocked = amber, complete = emerald, failed = red).
// Connector lines between stages. Animated when running (framer-motion).

import { motion } from 'framer-motion';
import {
  Inbox,
  FileSearch,
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
  { name: 'extraction', label: 'Extraction', icon: FileSearch },
  { name: 'grounding', label: 'Grounding', icon: Network },
  { name: 'signals', label: 'Signals', icon: Radar },
  { name: 'agents', label: 'Agents', icon: Bot },
  { name: 'verification', label: 'Verification', icon: PhoneCall },
  { name: 'gate', label: 'Gate', icon: Gavel },
];

const STATUS_STYLES: Record<TraceStage['status'], { ring: string; chip: string; dot: string; label: string }> = {
  idle: {
    ring: 'border-slate-700/60',
    chip: 'bg-slate-900/40 text-slate-400',
    dot: 'bg-slate-500',
    label: 'text-slate-400',
  },
  running: {
    ring: 'border-[#1f6c92]/70',
    chip: 'bg-[#1f6c92]/15 text-[#7fb8d6]',
    dot: 'bg-[#1f6c92]',
    label: 'text-[#7fb8d6]',
  },
  blocked: {
    ring: 'border-amber-600/70',
    chip: 'bg-amber-950/30 text-amber-300',
    dot: 'bg-amber-500',
    label: 'text-amber-300',
  },
  complete: {
    ring: 'border-emerald-700/60',
    chip: 'bg-emerald-950/30 text-emerald-300',
    dot: 'bg-emerald-500',
    label: 'text-emerald-300',
  },
  failed: {
    ring: 'border-red-700/70',
    chip: 'bg-red-950/40 text-red-300',
    dot: 'bg-red-500',
    label: 'text-red-300',
  },
};

export function PipelineTrace({ stages, runId }: { stages: TraceStage[]; runId?: string | null }) {
  const map = new Map(stages.map((s) => [s.name, s] as const));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-max items-stretch gap-2 py-2">
        {STAGES.map((stage, i) => {
          const s = map.get(stage.name);
          const status = s?.status ?? 'idle';
          const st = STATUS_STYLES[status];
          const Icon = stage.icon;
          const isRunning = status === 'running';
          return (
            <div key={stage.name} className="flex items-stretch gap-2">
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="flex flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    'relative flex h-16 w-16 items-center justify-center rounded-full border-2',
                    st.ring,
                    st.chip,
                    isRunning && 'shadow-[0_0_18px_-2px] shadow-[#1f6c92]/60',
                  )}
                >
                  {isRunning && (
                    <motion.span
                      className={cn('absolute inset-0 rounded-full', st.chip)}
                      animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.15, 0.5] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <Icon className="relative h-6 w-6" />
                  <span className={cn('absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-card', st.dot)} />
                </div>
                <div className="text-center">
                  <div className={cn('text-xs font-semibold', st.label)}>{stage.label}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{status}</div>
                </div>
              </motion.div>
              {i < STAGES.length - 1 && (
                <div className="flex items-center pt-8">
                  <motion.div
                    className={cn('h-0.5 w-6 sm:w-10', status === 'complete' ? 'bg-emerald-700/60' : 'bg-border/60')}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.05 + 0.1 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {runId && (
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">run: {runId}</div>
      )}
    </div>
  );
}
