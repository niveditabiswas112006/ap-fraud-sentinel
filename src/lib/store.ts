'use client';

// Zustand store — single source of truth for client-side navigation + live pipeline trace.
// Persisted view state survives reloads so refresh drops you back on the same section.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CaseRecord, TraceStage, TraceEvent, CaseStatus } from '@/lib/types';

export type View = 'dashboard' | 'cases' | 'upload' | 'vendors' | 'runs' | 'setup';

export interface AppState {
  // Navigation.
  view: View;
  setView: (v: View) => void;

  // Case-detail Sheet state.
  selectedCaseId: string | null;
  selectCase: (id: string | null) => void;

  // Live pipeline trace (filled by WS events).
  // `activeRunId` is the spec name; `runId` is kept as an alias for legacy
  // consumers (PipelineTrace reads it). Both stay in sync via setRunId.
  activeRunId: string | null;
  runId: string | null;
  setRunId: (id: string | null) => void;
  setActiveRunId: (id: string | null) => void;

  stages: TraceStage[];
  resetStages: () => void;
  resetTrace: () => void;
  setStageStatus: (name: TraceStage['name'], status: TraceStage['status']) => void;
  applyTraceEvent: (e: TraceEvent) => void;

  // Recent trace events (last 50) — used by the WS hook + trace UI.
  recentEvents: TraceEvent[];
  addTraceEvent: (e: TraceEvent) => void;

  // Recent cases (updated live by WS case events).
  recentCases: CaseRecord[];
  pushRecentCase: (c: CaseRecord) => void;
  setRecentCases: (c: CaseRecord[]) => void;

  // WS channel state.
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;
}

const EMPTY_STAGES: TraceStage[] = [
  { name: 'intake', label: 'Intake', status: 'idle' },
  { name: 'extraction', label: 'Extraction', status: 'idle' },
  { name: 'grounding', label: 'Grounding', status: 'idle' },
  { name: 'signals', label: 'Signals', status: 'idle' },
  { name: 'agents', label: 'Agents', status: 'idle' },
  { name: 'verification', label: 'Verification', status: 'idle' },
  { name: 'gate', label: 'Gate', status: 'idle' },
];

const STAGE_LABELS: Record<string, string> = {
  intake: 'Intake',
  extraction: 'Extraction',
  grounding: 'Grounding',
  signals: 'Signals',
  agents: 'Agents',
  verification: 'Verification',
  gate: 'Gate',
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'dashboard',
      setView: (v) => set({ view: v }),

      selectedCaseId: null,
      selectCase: (id) => set({ selectedCaseId: id }),

      activeRunId: null,
      runId: null,
      setRunId: (id) => set({ runId: id, activeRunId: id }),
      setActiveRunId: (id) => set({ runId: id, activeRunId: id }),

      stages: EMPTY_STAGES,
      resetStages: () => set({ stages: EMPTY_STAGES }),
      resetTrace: () =>
        set({
          activeRunId: null,
          runId: null,
          stages: EMPTY_STAGES.map((s) => ({ ...s, status: 'idle' as const })),
          recentEvents: [],
        }),
      setStageStatus: (name, status) =>
        set({
          stages: get().stages.map((s) =>
            s.name === name
              ? {
                  ...s,
                  status,
                  startedAt: status === 'running' ? Date.now() : s.startedAt,
                  completedAt:
                    status === 'complete' || status === 'failed' ? Date.now() : s.completedAt,
                }
              : s,
          ),
        }),
      applyTraceEvent: (e) => {
        if (e.type === 'run_started') {
          set({
            runId: e.runId,
            activeRunId: e.runId,
            stages: EMPTY_STAGES.map((s) => ({ ...s, status: 'idle' as const })),
          });
          return;
        }
        if (e.type === 'run_completed') {
          set({
            stages: get().stages.map((s) => ({
              ...s,
              status: 'complete' as const,
              completedAt: e.timestamp,
            })),
          });
          return;
        }
        if (e.type === 'stage' && e.stage && e.stageStatus) {
          set({
            stages: get().stages.map((s) =>
              s.name === e.stage
                ? {
                    ...s,
                    status: e.stageStatus as TraceStage['status'],
                    startedAt: e.stageStatus === 'running' ? e.timestamp : s.startedAt,
                    completedAt:
                      e.stageStatus === 'complete' || e.stageStatus === 'failed'
                        ? e.timestamp
                        : s.completedAt,
                  }
                : s,
            ),
          });
          return;
        }
        if (e.type === 'case' && e.caseId && e.caseStatus) {
          // Lightly push caseStatus into recentCases if already present.
          const existing = get().recentCases;
          if (existing.length === 0) return;
          set({
            recentCases: existing.map((c) =>
              c.caseId === e.caseId ? { ...c, status: e.caseStatus as CaseStatus } : c,
            ),
          });
        }
      },

      recentEvents: [],
      addTraceEvent: (e) => {
        // Cap at 50 most-recent events (newest first).
        const next = [e, ...get().recentEvents.filter((x) => x !== e)].slice(0, 50);
        set({ recentEvents: next });
        // Then run the existing side-effects (stage transitions, case-status
        // propagation, etc.).
        get().applyTraceEvent(e);
      },

      recentCases: [],
      pushRecentCase: (c) => {
        const existing = get().recentCases;
        const next = [c, ...existing.filter((x) => x.caseId !== c.caseId)].slice(0, 20);
        set({ recentCases: next });
      },
      setRecentCases: (c) => set({ recentCases: c.slice(0, 20) }),

      wsConnected: false,
      setWsConnected: (v) => set({ wsConnected: v }),
    }),
    {
      name: 'apsfs-store',
      // Only persist navigation; trace/ws state is transient.
      partialize: (s) => ({ view: s.view }) as Partial<AppState>,
    },
  ),
);

export { STAGE_LABELS, EMPTY_STAGES };
