'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal, Calendar, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuns, useGroundTruth } from '@/hooks/useDashboardData';
import { CostTable } from '@/components/dashboard/CostTable';
import { useAppStore, formatCurrency } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { RunRecord } from '@/lib/types';

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try {
    const d = new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return s;
  }
}

function fmtMoney(n: number) {
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function RunsView() {
  const currency = useAppStore((state) => state.currency);
  const currSymbol = currency === 'INR' ? '₹' : '$';

  const { data: runs, isLoading } = useRuns();
  const { data: truth } = useGroundTruth();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const runs_items: RunRecord[] = runs?.items ?? [
    {
      runId: '#R-2023-9021',
      startedAt: '2026-10-24 14:30:00',
      endedAt: '2026-10-24 14:42:15',
      status: 'complete',
      casesProcessed: 14205,
      casesHeld: 342,
      fraudCaught: 12,
      amountSavedUsd: 42500,
      signalsCostUsd: 120.5,
      llmCostUsd: 800.0,
      callCostUsd: 284.0,
      totalUsd: 1204.5,
      durationS: 735,
    },
    {
      runId: '#R-2023-9020',
      startedAt: '2026-10-24 10:15:00',
      endedAt: '2026-10-24 10:28:40',
      status: 'complete',
      casesProcessed: 12850,
      casesHeld: 280,
      fraudCaught: 5,
      amountSavedUsd: 18200,
      signalsCostUsd: 100.0,
      llmCostUsd: 650.0,
      callCostUsd: 230.2,
      totalUsd: 980.2,
      durationS: 820,
    },
    {
      runId: '#R-2023-9019',
      startedAt: '2026-10-23 18:00:00',
      endedAt: '2026-10-23 18:05:12',
      status: 'failed',
      casesProcessed: 4500,
      casesHeld: 0,
      fraudCaught: 0,
      amountSavedUsd: 0,
      signalsCostUsd: 20.0,
      llmCostUsd: 80.0,
      callCostUsd: 20.0,
      totalUsd: 120.0,
      durationS: 312,
    },
  ];

  const selectedRun = runs_items.find((r) => r.runId === selectedRunId) ?? runs_items[0] ?? null;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Top Header & Search matching Reference Image 3 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Batch runs</h1>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filter</span>
            </button>
            <button className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <Calendar className="h-3.5 w-3.5" />
              <span>Last 7 Days</span>
            </button>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Run ID..."
              className="rounded-full bg-slate-100 border-none pl-9 pr-4 text-xs shadow-inner focus-visible:ring-1 focus-visible:ring-[#00668c]"
            />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-100/70">
            <TableRow>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3">RUN ID</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3">STARTED</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3">ENDED</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3">STATUS</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3 text-right">CASES</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3 text-right">HELD</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3 text-right">FRAUD</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3 text-right">{currSymbol} SAVED</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3 text-right">TOTAL COST</TableHead>
              <TableHead className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3 text-right">DURATION</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="p-4"><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            ) : runs_items.map((r) => (
              <TableRow
                key={r.runId}
                onClick={() => setSelectedRunId(r.runId)}
                className={cn(
                  'cursor-pointer hover:bg-slate-50 border-b border-slate-100',
                  selectedRun?.runId === r.runId && 'bg-sky-50/50',
                )}
              >
                <TableCell><code className="font-mono text-xs font-bold text-slate-800">{r.runId}</code></TableCell>
                <TableCell className="text-xs text-slate-600 font-medium">{fmtDate(r.startedAt)}</TableCell>
                <TableCell className="text-xs text-slate-600 font-medium">{fmtDate(r.endedAt)}</TableCell>
                <TableCell>
                  {r.status === 'complete' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-0.5 text-[10px] font-extrabold text-[#005577] border border-sky-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#005577]" />
                      COMPLETED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-0.5 text-[10px] font-extrabold text-red-700 border border-red-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                      FAILED
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{r.casesProcessed.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{r.casesHeld}</TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{r.fraudCaught}</TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-slate-900">{formatCurrency(r.amountSavedUsd, currency)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-slate-800">{formatCurrency(r.totalUsd, currency)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-slate-600">{Math.floor(r.durationS / 60)}m {Math.round(r.durationS % 60)}s</TableCell>
                <TableCell className="text-slate-400"><ChevronDown className="h-4 w-4" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs font-semibold text-slate-500">
          <span>Showing 1-3 of 124 runs</span>
          <div className="flex items-center gap-2">
            <button className="p-1 rounded hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
            <button className="p-1 rounded hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {selectedRun && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold text-slate-800">
              Cost breakdown — <code className="font-mono text-xs text-[#00668c]">{selectedRun.runId}</code>
            </h2>
            <CostTable
              signalsCost={selectedRun.signalsCostUsd}
              llmCost={selectedRun.llmCostUsd}
              callCost={selectedRun.callCostUsd}
              totalCost={selectedRun.totalUsd}
              casesProcessed={selectedRun.casesProcessed}
            />
          </div>
        </div>
      )}
    </div>
  );
}

