'use client';

// RunsView — table of batch runs + the cost table per selected run + the detector score panel
// (against the 10 ground-truth rows).

import { useState } from 'react';
import { History, Target, ShieldCheck, AlertTriangle, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import type { RunRecord } from '@/lib/types';

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z')).toLocaleString();
  } catch {
    return s;
  }
}

function fmtMoney(n: number) {
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RunsView() {
  const { data: runs, isLoading } = useRuns();
  const { data: truth } = useGroundTruth();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runs_items: RunRecord[] = runs?.items ?? [];
  const selectedRun = runs_items.find((r) => r.runId === selectedRunId) ?? runs_items[0] ?? null;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-[#1f6c92]" />
            Batch runs ({runs_items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase">Run</TableHead>
                  <TableHead className="text-[11px] uppercase">Started</TableHead>
                  <TableHead className="text-[11px] uppercase">Ended</TableHead>
                  <TableHead className="text-[11px] uppercase">Status</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Cases</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Held</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Fraud</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">$ saved</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Total cost</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="p-0"><Skeleton className="h-12 w-full rounded-none" /></TableCell></TableRow>
                ) : runs_items.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">No runs yet.</TableCell></TableRow>
                ) : (
                  runs_items.map((r) => (
                    <TableRow
                      key={r.runId}
                      onClick={() => setSelectedRunId(r.runId)}
                      className={cn(
                        'cursor-pointer hover:bg-muted/30',
                        selectedRun?.runId === r.runId && 'bg-[#1f6c92]/10',
                      )}
                    >
                      <TableCell><code className="font-mono text-xs">{r.runId}</code></TableCell>
                      <TableCell className="text-xs">{fmtDate(r.startedAt)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.endedAt)}</TableCell>
                      <TableCell>
                        <span className={cn(
                          'font-mono text-[10px] uppercase tracking-wider',
                          r.status === 'complete' && 'text-emerald-300',
                          r.status === 'running' && 'text-[#7fb8d6]',
                          r.status === 'failed' && 'text-red-300',
                        )}>
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.casesProcessed}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-red-300">{r.casesHeld}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-emerald-300">{r.fraudCaught}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtMoney(r.amountSavedUsd)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${r.totalUsd.toFixed(4)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.durationS.toFixed(2)}s</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedRun && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Cost breakdown — <code className="font-mono text-xs">{selectedRun.runId}</code></span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CostTable
                signalsCost={selectedRun.signalsCostUsd}
                llmCost={selectedRun.llmCostUsd}
                callCost={selectedRun.callCostUsd}
                totalCost={selectedRun.totalUsd}
                casesProcessed={selectedRun.casesProcessed}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-[#1f6c92]" />
                Detector score vs ground truth
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!truth ? (
                <Skeleton className="h-40 w-full rounded-md" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <ScoreTile label="True +" value={truth.score.truePositives} color="emerald" icon={<ShieldCheck className="h-4 w-4" />} />
                    <ScoreTile label="False -" value={truth.score.falseNegatives} color="red" icon={<AlertTriangle className="h-4 w-4" />} />
                    <ScoreTile label="False +" value={truth.score.falsePositives} color="amber" icon={<AlertTriangle className="h-4 w-4" />} />
                    <ScoreTile label="Pending" value={truth.score.pending} color="steel" icon={<EyeOff className="h-4 w-4" />} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 p-2">
                      <div className="text-muted-foreground">Precision</div>
                      <div className="font-mono text-lg">{(truth.score.precision * 100).toFixed(0)}%</div>
                    </div>
                    <div className="rounded-md border border-border/60 p-2">
                      <div className="text-muted-foreground">Recall</div>
                      <div className="font-mono text-lg">{(truth.score.recall * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border/60">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px] uppercase">Case</TableHead>
                          <TableHead className="text-[11px] uppercase">Type</TableHead>
                          <TableHead className="text-[11px] uppercase">Expected</TableHead>
                          <TableHead className="text-[11px] uppercase">Detector</TableHead>
                          <TableHead className="text-[11px] uppercase">Outcome</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {truth.items.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell><code className="font-mono text-xs">{t.caseId}</code></TableCell>
                            <TableCell className="text-xs">{t.fraudType}</TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">{t.expectedSignal}</TableCell>
                            <TableCell className="text-xs uppercase">
                              {t.detectorRecommendation ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {t.caught ? (
                                <span className="text-emerald-300">caught</span>
                              ) : t.missed ? (
                                <span className="text-red-300">missed</span>
                              ) : (
                                <span className="text-muted-foreground">n/a</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScoreTile({ label, value, color, icon }: { label: string; value: number; color: 'emerald' | 'red' | 'amber' | 'steel'; icon: React.ReactNode }) {
  const map = {
    emerald: 'border-emerald-700/40 bg-emerald-950/20 text-emerald-300',
    red: 'border-red-700/40 bg-red-950/20 text-red-300',
    amber: 'border-amber-700/40 bg-amber-950/20 text-amber-300',
    steel: 'border-[#1f6c92]/40 bg-[#1f6c92]/15 text-[#7fb8d6]',
  } as const;
  return (
    <div className={cn('rounded-md border p-2', map[color])}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="font-mono text-xl font-semibold">{value}</div>
    </div>
  );
}
