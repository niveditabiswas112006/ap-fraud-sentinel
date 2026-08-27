'use client';

// CaseDetail — right-side Sheet content. Renders the invoice preview, signal list,
// transcript, evidence pack, and the controller decision bar (Release/Hold/Escalate).

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, ShieldAlert, Clock, Sparkles, Building2, FileText } from 'lucide-react';
import { RiskGauge } from '@/components/dashboard/RiskGauge';
import { SignalList } from '@/components/dashboard/SignalList';
import { TranscriptViewer } from '@/components/dashboard/TranscriptViewer';
import {
  StatusBadge,
  RecommendationBadge,
  DecisionBadge,
} from '@/components/dashboard/StatusBadge';
import { useAppStore } from '@/lib/store';
import { useCase, useDecide } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ControllerDecision } from '@/lib/types';

interface Facts {
  vendor_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount?: string | number;
  currency?: string;
  line_items?: { description?: string; quantity?: number; unit_price?: number; total?: number }[];
  sender_domain?: string;
  requested_bank_account?: string;
  bank_change_request_date?: string;
  email_body?: string;
  vendor_id?: string;
  error?: string;
  reason?: string;
  [k: string]: unknown;
}

function parseFacts(json: string | undefined): Facts | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Facts;
  } catch {
    return null;
  }
}

interface EvidencePack {
  [k: string]: unknown;
}

function parseEvidence(json: string | undefined): EvidencePack | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as EvidencePack;
  } catch {
    return null;
  }
}

function maskedBank(acct?: string | null): string {
  if (!acct) return '—';
  if (acct.length <= 4) return acct.replace(/./g, '•');
  return `${acct.slice(0, 4)}••••${acct.slice(-4)}`;
}

function highlightLookalike(domain?: string | null, registered?: string | null) {
  if (!domain) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">sender</span>
        <code className="font-mono text-xs text-red-300 underline decoration-red-500/50 decoration-wavy underline-offset-2">
          {domain}
        </code>
      </div>
      {registered && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">registered</span>
          <code className="font-mono text-xs text-emerald-300">{registered}</code>
        </div>
      )}
    </div>
  );
}

export function CaseDetailSheet() {
  const id = useAppStore((s) => s.selectedCaseId);
  const selectCase = useAppStore((s) => s.selectCase);
  const { data, isLoading } = useCase(id);
  const decide = useDecide();
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ decision: ControllerDecision | null; approver: string; reason: string }>({
    decision: null,
    approver: '',
    reason: '',
  });

  const open = Boolean(id);
  const close = () => {
    selectCase(null);
    setDraft({ decision: null, approver: '', reason: '' });
  };

  const facts = data ? parseFacts(data.factsJson) : null;
  const evidence = data ? parseEvidence(data.evidencePackJson) : null;
  const decided = Boolean(data?.decision);
  const audioUrl = data?.callAudioUrl ?? (data ? `/calls/${data.caseId}.wav` : null);

  const submit = async (decision: ControllerDecision) => {
    if (!id) return;
    if (!draft.approver.trim() || !draft.reason.trim()) {
      toast({
        title: 'Approver + reason required',
        description: 'Both an approver name and a written reason are required to gate this payment.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await decide.mutateAsync({ id, decision, approver: draft.approver, reason: draft.reason });
      toast({
        title: `Decision recorded: ${decision}`,
        description: `${id} is now closed. The audit trail reflects your action.`,
      });
      setDraft({ decision: null, approver: '', reason: '' });
    } catch (e) {
      toast({
        title: 'Decision failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px] md:max-w-[820px]"
      >
        <SheetHeader className="gap-2 border-b border-border/60 bg-card/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SheetTitle className="font-mono text-base">{id ?? '—'}</SheetTitle>
            {data && (
              <div className="flex items-center gap-1.5">
                <StatusBadge status={data.status} />
                <RecommendationBadge rec={data.recommendation} />
                <DecisionBadge decision={data.decision} />
              </div>
            )}
          </div>
          <SheetDescription className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
            <span className="truncate">
              <Building2 className="mr-1 inline h-3 w-3" />
              {data?.vendorName ?? '—'}
            </span>
            <code className="font-mono">{data?.invoiceNumber ?? '—'}</code>
            <span className="font-mono text-base font-semibold text-foreground">
              ${Number(data?.amountUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {data?.fraudType && (
              <span className="rounded border border-red-700/40 bg-red-950/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-300">
                {data.fraudType}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 p-4">
            {!data && isLoading && (
              <div className="text-sm text-muted-foreground">Loading case…</div>
            )}

            {data && (
              <>
                {/* Risk gauge — always prominent */}
                <section className="rounded-md border border-border/60 bg-card/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-[#7fb8d6]" />
                      Risk assessment
                    </div>
                    <div className="font-mono text-2xl font-semibold" data-risk-score={data.riskScore}>
                      {data.riskScore.toFixed(2)}
                    </div>
                  </div>
                  <RiskGauge score={data.riskScore} />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Recommendation: <span className="font-mono uppercase">{data.recommendation ?? '—'}</span>
                  </div>
                </section>

                {/* Signals + Transcript in 2-col grid */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                      Signals ({data.signals.filter((s) => s.fired).length}/{data.signals.length} fired)
                    </div>
                    <SignalList signals={data.signals} className="max-h-80 overflow-y-auto pr-1" />
                  </section>

                  <section className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-4">
                    <TranscriptViewer
                      transcript={data.callTranscript}
                      audioUrl={audioUrl}
                      verificationResult={data.verificationResult}
                    />
                  </section>
                </div>

                {/* Invoice preview + email source */}
                <section className="rounded-md border border-border/60 bg-card/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#7fb8d6]" />
                    Invoice preview
                  </div>
                  {facts?.error ? (
                    <div className="rounded border border-red-700/40 bg-red-950/30 p-3 font-mono text-xs text-red-200">
                      <div className="text-red-400">{facts.error}</div>
                      {facts.reason && <div className="mt-1 text-red-300/80">{facts.reason}</div>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                        <div>
                          <div className="text-muted-foreground">Vendor</div>
                          <div className="font-medium">{facts?.vendor_name ?? data.vendorName}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Invoice #</div>
                          <code className="font-mono">{facts?.invoice_number ?? data.invoiceNumber}</code>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Amount</div>
                          <div className="font-mono">
                            ${Number(facts?.amount ?? data.amountUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-muted-foreground">{facts?.currency ?? data.currency}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Invoice date</div>
                          <div className="font-mono">{facts?.invoice_date ?? data.invoiceDate ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Due date</div>
                          <div className="font-mono">{facts?.due_date ?? data.dueDate ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Bank-change date</div>
                          <div className="font-mono">{data.bankChangeRequestDate ?? facts?.bank_change_request_date ?? '—'}</div>
                        </div>
                      </div>
                      {Array.isArray(facts?.line_items) && facts!.line_items!.length > 0 && (
                        <div className="overflow-hidden rounded border border-border/40">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                              <tr>
                                <th className="px-2 py-1 text-left">Description</th>
                                <th className="px-2 py-1 text-right">Qty</th>
                                <th className="px-2 py-1 text-right">Unit</th>
                                <th className="px-2 py-1 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              {facts!.line_items!.map((li, i) => (
                                <tr key={i} className="border-t border-border/30">
                                  <td className="px-2 py-1">{li.description ?? '—'}</td>
                                  <td className="px-2 py-1 text-right">{li.quantity ?? '—'}</td>
                                  <td className="px-2 py-1 text-right">${(li.unit_price ?? 0).toFixed(2)}</td>
                                  <td className="px-2 py-1 text-right">${(li.total ?? 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {data.senderDomain &&
                        highlightLookalike(data.senderDomain, facts?.vendor_id ? undefined : facts?.vendor_id)}
                      {data.requestedBankAccount && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Requested bank:</span>
                          <code className="font-mono text-red-300">{maskedBank(data.requestedBankAccount)}</code>
                        </div>
                      )}
                      {data.emailBody && (
                        <details className="rounded border border-border/40 bg-card/60 p-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            Email body excerpt
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-foreground/80">{data.emailBody}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </section>

                {/* Evidence pack */}
                {evidence && (
                  <section className="rounded-md border border-border/60 bg-card/40 p-4">
                    <div className="mb-2 text-sm font-medium">Evidence pack</div>
                    <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                      {Object.entries(evidence).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                          <span className="text-muted-foreground">{k}</span>
                          <code className="font-mono break-words text-foreground/80">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </code>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Decision history */}
                {data.decisions.length > 0 && (
                  <section className="rounded-md border border-border/60 bg-card/40 p-4">
                    <div className="mb-2 text-sm font-medium">Decision history</div>
                    <ul className="flex flex-col gap-1.5">
                      {data.decisions.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-xs">
                          <DecisionBadge decision={d.decision} />
                          <span className="font-mono">{d.approver}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{new Date(d.timestamp.replace(' ', 'T') + 'Z').toLocaleString()}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="truncate">{d.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <Separator />

                {/* Controller decision bar */}
                <section className="rounded-md border border-border/60 bg-card/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-amber-400" />
                    Controller decision
                  </div>
                  {decided && data.decision ? (
                    <div className="flex flex-col gap-2 rounded border border-emerald-700/40 bg-emerald-950/20 p-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-medium">Locked — case decided</span>
                        <DecisionBadge decision={data.decision} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{data.approver}</span> · {data.decisionReason ?? '—'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="approver" className="text-xs">Approver</Label>
                          <Input
                            id="approver"
                            placeholder="controller_smith"
                            value={draft.approver}
                            onChange={(e) => setDraft((d) => ({ ...d, approver: e.target.value }))}
                            className="font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="reason" className="text-xs">Reason</Label>
                          <Textarea
                            id="reason"
                            placeholder="BEC showstopper — out-of-band call denied; bank account change."
                            rows={2}
                            value={draft.reason}
                            onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => submit('release')}
                          disabled={decide.isPending}
                          className={cn('border-emerald-700/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 hover:text-emerald-200')}
                        >
                          Release
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => submit('hold')}
                          disabled={decide.isPending}
                          className={cn('border-red-700/60 bg-red-950/40 text-red-300 hover:bg-red-900/50 hover:text-red-200')}
                        >
                          Hold
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => submit('escalate')}
                          disabled={decide.isPending}
                          className={cn('border-amber-700/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 hover:text-amber-200')}
                        >
                          Escalate
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
