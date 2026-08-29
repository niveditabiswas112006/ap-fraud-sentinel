'use client';

// TanStack Query hooks — single source of truth for server-state fetching
// across all dashboard views. The query keys are invalidated from useTrace
// when a case status changes.

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CaseRecord, ControllerDecision, RunRecord, VendorRecord, PaymentRecord } from '@/lib/types';

// ---------- /api/healthz ----------
export function useHealthz() {
  return useQuery({
    queryKey: ['healthz'],
    queryFn: async () => {
      const r = await fetch('/api/healthz', { cache: 'no-store' });
      if (!r.ok) throw new Error('healthz failed');
      return (await r.json()) as {
        ok: boolean;
        worker: { mode: string; has_key: boolean; counts: Record<string, number> };
        ws: { port: number };
      };
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

// ---------- /api/stats ----------
export interface DashboardStats {
  casesScreened: number;
  casesHeld: number;
  fraudCaught: number;
  amountSavedUsd: number;
  lastRunId: string | null;
  runsTotal: number;
}

export function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const r = await fetch('/api/stats', { cache: 'no-store' });
      if (!r.ok) throw new Error('stats failed');
      return (await r.json()) as DashboardStats;
    },
    staleTime: 4000,
    refetchInterval: 8000,
  });
}

// ---------- /api/cases ----------
export interface CasesResponse {
  items: CaseRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CasesFilters {
  status?: string;
  vendor_id?: string;
  runId?: string;
  fraud_type?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useCases(filters: CasesFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  }
  const search = qs.toString();
  return useQuery<CasesResponse>({
    queryKey: ['cases', filters],
    queryFn: async () => {
      const r = await fetch(`/api/cases?${search}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('cases failed');
      return (await r.json()) as CasesResponse;
    },
    placeholderData: keepPreviousData,
    staleTime: 3000,
  });
}

// ---------- /api/cases/[id] ----------
export interface CaseDetail extends CaseRecord {
  vendor: Record<string, unknown> | null;
  decisions: {
    id: number;
    caseId: string;
    approver: string;
    decision: ControllerDecision;
    reason: string;
    timestamp: string;
  }[];
}

export function useCase(id: string | null) {
  return useQuery<CaseDetail>({
    queryKey: ['case', id],
    queryFn: async () => {
      if (!id) throw new Error('no id');
      const r = await fetch(`/api/cases/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('case fetch failed');
      return (await r.json()) as CaseDetail;
    },
    enabled: Boolean(id),
    staleTime: 2000,
  });
}

export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      approver,
      reason,
    }: {
      id: string;
      decision: ControllerDecision;
      approver: string;
      reason: string;
    }) => {
      const r = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, approver, reason }),
      });
      if (!r.ok) throw new Error('decision failed');
      return (await r.json()) as { ok: boolean; caseId: string; status?: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['case', vars.id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['ground-truth'] });
    },
  });
}

// ---------- /api/runs ----------
export function useRuns() {
  return useQuery<{ items: RunRecord[]; total: number }>({
    queryKey: ['runs'],
    queryFn: async () => {
      const r = await fetch('/api/runs', { cache: 'no-store' });
      if (!r.ok) throw new Error('runs failed');
      return (await r.json()) as { items: RunRecord[]; total: number };
    },
    staleTime: 3000,
    refetchInterval: 5000,
  });
}

export function useRun(id: string | null) {
  return useQuery<RunRecord>({
    queryKey: ['run', id],
    queryFn: async () => {
      if (!id) throw new Error('no id');
      const r = await fetch(`/api/runs/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('run fetch failed');
      return (await r.json()) as RunRecord;
    },
    enabled: Boolean(id),
    refetchInterval: 4000,
  });
}

import { useAppStore } from '@/lib/store';

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ batch_path, limit }: { batch_path?: string; limit?: number } = {}) => {
      const storeRunId = useAppStore.getState().runId;
      const targetBatchPath =
        batch_path || (storeRunId ? `data/uploads/${storeRunId}` : undefined);

      const r = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: storeRunId || undefined,
          batch_path: targetBatchPath,
          limit,
        }),
      });
      if (!r.ok) throw new Error('run start failed');
      return (await r.json()) as { run_id: string; status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['healthz'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

// ---------- /api/vendors ----------
export function useVendors(page = 1, limit = 60, search = '') {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) qs.set('search', search);
  return useQuery<{ items: VendorRecord[]; total: number; page: number; limit: number }>({
    queryKey: ['vendors', page, limit, search],
    queryFn: async () => {
      const r = await fetch(`/api/vendors?${qs.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('vendors failed');
      return (await r.json()) as { items: VendorRecord[]; total: number; page: number; limit: number };
    },
    staleTime: 60000,
  });
}

export interface VendorDetail {
  vendor: VendorRecord;
  payments: PaymentRecord[];
  stats: { count: number; mean: number; std: number };
}

export function useVendor(id: string | null) {
  return useQuery<VendorDetail>({
    queryKey: ['vendor', id],
    queryFn: async () => {
      if (!id) throw new Error('no id');
      const r = await fetch(`/api/vendors/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('vendor fetch failed');
      return (await r.json()) as VendorDetail;
    },
    enabled: Boolean(id),
    staleTime: 60000,
  });
}

// ---------- /api/ground-truth ----------
export interface GroundTruthRow {
  id: number;
  caseId: string;
  invoiceNumber: string;
  fraudType: string;
  isFraud: boolean;
  expectedSignal: string;
  detectorRecommendation: string | null;
  detectorStatus: string | null;
  detectorFraudType: string | null;
  caught: boolean;
  missed: boolean;
}

export interface GroundTruthResponse {
  items: GroundTruthRow[];
  total: number;
  score: {
    truePositives: number;
    falseNegatives: number;
    falsePositives: number;
    pending: number;
    precision: number;
    recall: number;
  };
}

export function useGroundTruth() {
  return useQuery<GroundTruthResponse>({
    queryKey: ['ground-truth'],
    queryFn: async () => {
      const r = await fetch('/api/ground-truth', { cache: 'no-store' });
      if (!r.ok) throw new Error('ground-truth failed');
      return (await r.json()) as GroundTruthResponse;
    },
    staleTime: 5000,
  });
}

// ---------- /api/upload ----------
export interface UploadFileEntry {
  name: string;
  size: number;
  path: string;
  kind?: 'reference-csv' | 'case';
}

export interface UploadResponse {
  run_id: string;
  files_received: number;
  names?: string[];
  files: UploadFileEntry[];
  csv_reloaded?: { vendors: number; payments: number; ground_truth: number };
}

export function useUploadFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, files }: { runId?: string; files: File[] }) => {
      const fd = new FormData();
      if (runId) fd.set('run_id', runId);
      for (const f of files) fd.append('file', f, f.name);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload failed');
      return (await r.json()) as UploadResponse;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      // If the user uploaded reference CSVs, the worker re-imported them into
      // the DB — invalidate vendors/healthz/stats so the dashboard reflects
      // the new vendor count + payment history immediately.
      if (data.csv_reloaded) {
        qc.invalidateQueries({ queryKey: ['vendors'] });
        qc.invalidateQueries({ queryKey: ['healthz'] });
        qc.invalidateQueries({ queryKey: ['stats'] });
      }
    },
  });
}

// ---------- convenience: invalidate everything ----------
export function useInvalidateAll() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries();
  }, [qc]);
}
