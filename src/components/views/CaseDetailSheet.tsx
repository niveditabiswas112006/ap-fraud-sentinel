'use client';

import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle, Building2, Download, Info } from 'lucide-react';
import { useAppStore, formatCurrency } from '@/lib/store';
import { useCase, useDecide } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ControllerDecision } from '@/lib/types';

export function CaseDetailSheet() {
  const id = useAppStore((s) => s.selectedCaseId);
  const selectCase = useAppStore((s) => s.selectCase);
  const currency = useAppStore((s) => s.currency);
  const { data } = useCase(id);
  const decide = useDecide();
  const { toast } = useToast();

  const open = Boolean(id);
  const close = () => selectCase(null);

  const onDecision = async (decision: ControllerDecision) => {
    if (!id) return;
    try {
      await decide.mutateAsync({
        id,
        decision,
        approver: 'controller_admin',
        reason: decision === 'hold' ? 'BEC suspected - lookalike domain & bank mismatch' : 'Manual verification passed',
      });
      toast({
        title: `Disposition set to ${decision.toUpperCase()}`,
        description: `Case ${id} updated.`,
      });
    } catch (e) {
      toast({
        title: 'Action failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const caseData = {
    caseId: data?.caseId ?? id ?? 'INV-2026-4418',
    vendorName: data?.vendorName ?? 'Acme Industrial Supply',
    amountUsd: data?.amountUsd ?? 48394.27,
    senderDomain: data?.senderDomain ?? 'acme-industrial1.com',
    riskScore: data?.riskScore ?? 0.50,
  };

  const downloadEvidencePack = () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Evidence Pack - ${caseData.caseId}</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px; margin: 0; }
          .card { background: #ffffff; border: 2px solid #0f172a; border-radius: 16px; padding: 32px; max-width: 800px; margin: 0 auto; box-shadow: 4px 4px 0px 0px #0f172a; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
          .brand { font-size: 20px; font-weight: 800; color: #00668c; letter-spacing: -0.02em; }
          .badge-red { background: #fee2e2; color: #991b1b; border: 1px solid #f87171; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
          .box { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; }
          .box-red { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; padding: 16px; }
          .amount { font-size: 28px; font-weight: 800; color: #00668c; font-family: monospace; }
          .alert-title { font-weight: 800; color: #991b1b; font-size: 12px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
          .transcript-box { background: #0b121e; color: #f8fafc; border-radius: 12px; padding: 20px; font-family: monospace; font-size: 12px; line-height: 1.6; margin-top: 24px; }
          .sys { color: #94a3b8; font-weight: 700; }
          .vnd { color: #f59e0b; font-weight: 700; }
          .highlight { background: #7c2d12; color: #ffedd5; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
          .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
          @media print {
            body { background: #ffffff; padding: 0; }
            .card { border: 1px solid #0f172a; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div>
              <div class="brand">AP SENTINEL · EVIDENCE PACK</div>
              <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px;">Case Record: ${caseData.caseId}</div>
            </div>
            <span class="badge-red">FRAUD SUSPECTED — HOLD PAYMENT</span>
          </div>

          <div class="grid">
            <div class="box">
              <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Vendor Name</div>
              <div style="font-size: 18px; font-weight: 800; margin-top: 4px;">${caseData.vendorName}</div>
              
              <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-top: 16px;">Requested Amount</div>
              <div class="amount">$${Number(caseData.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>

            <div class="box-red">
              <div class="alert-title">⚠️ LOOKALIKE DOMAIN ALERT</div>
              <div style="font-size: 12px; color: #7f1d1d; margin-top: 6px; font-weight: 500;">
                Sender Domain: <strong>${caseData.senderDomain}</strong><br/>
                Domain registered 48 hours ago. Historic vendor domain is acme-industrial.com.
              </div>
              
              <div style="margin-top: 14px; font-size: 11px; font-weight: 700; color: #991b1b;">
                System Risk Score: <strong>${caseData.riskScore.toFixed(2)} / 1.00</strong>
              </div>
            </div>
          </div>

          <div style="font-size: 14px; font-weight: 800; margin-bottom: 12px;">Agent Swarm Diagnostics</div>
          <div class="grid">
            <div class="box">
              <div style="font-weight: 800; font-size: 12px; color: #991b1b;">🎯 BEC Analyst — Flagged</div>
              <div style="font-size: 11px; color: #475569; margin-top: 4px;">Linguistic analysis detected unnatural urgency and unexplained deviation in standard operational phrasing.</div>
            </div>
            <div class="box">
              <div style="font-weight: 800; font-size: 12px; color: #991b1b;">🏦 Vendor Verifier — Bank Mismatch</div>
              <div style="font-size: 11px; color: #475569; margin-top: 4px;">Routing transit number associated with consumer prepaid account, not commercial institutional banking.</div>
            </div>
          </div>

          <div style="font-size: 14px; font-weight: 800; margin-bottom: 8px;">Voice Verification Call Transcript</div>
          <div class="transcript-box">
            <div><span class="sys">[14:02:11] SYS:</span> Call initiated to verified vendor number +1 (555) 019-3829.</div>
            <div><span class="vnd">[14:02:15] VND:</span> Acme Accounts Receivable, this is Sarah.</div>
            <div><span class="sys">[14:02:18] SYS:</span> Hello Sarah, verifying an invoice update for $48,394.27 submitted today.</div>
            <div><span class="vnd">[14:02:22] VND:</span> Let me check... No, we haven't sent any updates today. <span class="highlight">We have no new banking details on file.</span></div>
            <div><span class="sys">[14:02:30] SYS:</span> Understood. Terminating verification. Case flagged.</div>
          </div>

          <div class="footer">
            <div>Generated by AP Payment Fraud Sentinel Engine</div>
            <div>Timestamp: ${new Date().toLocaleString()}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
      setTimeout(() => {
        win.print();
      }, 300);
    }

    toast({
      title: 'Evidence Pack PDF Ready',
      description: `Opened Evidence Pack PDF report for ${caseData.caseId}.`,
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[90vw] lg:max-w-[1100px] bg-slate-100/90 backdrop-blur"
      >
        {/* Top Header */}
        <div className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
              {caseData.caseId}
            </span>
            <h1 className="text-xl font-extrabold text-slate-900">{caseData.vendorName}</h1>
          </div>
        </div>

        {/* 3 Column Grid Content matching Reference Image 4 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Column 1: Transaction Facts */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Transaction Facts</h3>
                <p className="text-xs text-slate-400 font-medium">Extracted entities and risk assessment</p>
              </div>

              <div className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Requested Amount</span>
                <span className="font-mono text-3xl font-extrabold text-[#00668c]">
                  {formatCurrency(caseData.amountUsd, currency)}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Sender Domain</span>
                <span className="inline-self-start rounded-full bg-red-50 text-red-600 border border-red-200 font-mono text-xs px-3 py-1 font-bold w-fit">
                  {caseData.senderDomain}
                </span>
              </div>

              {/* Lookalike Alert Box */}
              <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-red-700">
                  <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
                  <span>LOOKALIKE ALERT</span>
                </div>
                <p className="text-xs text-red-600 leading-relaxed font-medium">
                  Domain was registered 48 hours ago. Historic vendor domain is acme-industrial.com.
                </p>
              </div>

              {/* System Risk Score Bar */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600">System Risk Score</span>
                  <span className="font-mono text-red-600">{caseData.riskScore.toFixed(2)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${Math.round(caseData.riskScore * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Column 2: Agent Diagnostics */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Agent Diagnostics</h3>
                <p className="text-xs text-slate-400 font-medium">Specialized model outputs</p>
              </div>

              <div className="flex flex-col gap-3">
                {/* BEC Analyst */}
                <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>🎯 BEC Analyst</span>
                    </span>
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-extrabold text-red-700 border border-red-200">
                      ! High Probability
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Linguistic analysis detected unnatural urgency and unexplained deviation in standard operational phrasing.
                  </p>
                </div>

                {/* Vendor Verifier */}
                <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-500" />
                      <span>Vendor Verifier</span>
                    </span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800 border border-amber-200">
                      🏦 Bank mismatch
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Routing transit number associated with consumer prepaid account, not commercial institutional banking.
                  </p>
                </div>

                {/* Case Builder */}
                <div className="flex flex-col gap-2 pt-2">
                  <span className="text-xs font-bold text-slate-800">🛠 Case Builder</span>
                  <Button
                    onClick={downloadEvidencePack}
                    className="w-full rounded-full bg-[#854d0e] hover:bg-[#713f12] text-white text-xs font-bold gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Evidence Pack
                  </Button>
                </div>
              </div>
            </div>

            {/* Column 3: Verification Call */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Verification Call</h3>
                <p className="text-xs text-slate-400 font-medium">Automated voice verification transcript</p>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                {/* Chat Bubble 1 */}
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] font-bold text-slate-400">SYSTEM_VERIFIER</span>
                  <div className="rounded-2xl rounded-tl-none bg-slate-100 p-3 text-slate-700 leading-relaxed">
                    Hello. I am calling from AP Sentinel regarding Acme Industrial Supply. We received a request to update the banking details for invoice ending in 4410. Can you confirm this change?
                  </div>
                </div>

                {/* Chat Bubble 2 */}
                <div className="flex flex-col gap-1 items-end">
                  <span className="font-mono text-[10px] font-bold text-amber-700">VENDOR_REP (VERIFIED)</span>
                  <div className="rounded-2xl rounded-tr-none bg-amber-100/80 p-3 text-amber-900 leading-relaxed max-w-[85%]">
                    Hi, let me check our accounting system. One moment please.
                  </div>
                </div>

                {/* Chat Bubble 3 */}
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] font-bold text-slate-400">SYSTEM_VERIFIER</span>
                  <div className="rounded-2xl rounded-tl-none bg-slate-100 p-3 text-slate-700 leading-relaxed w-fit">
                    Take your time.
                  </div>
                </div>

                {/* Chat Bubble 4 */}
                <div className="flex flex-col gap-1 items-end">
                  <span className="font-mono text-[10px] font-bold text-orange-700">VENDOR_REP (VERIFIED)</span>
                  <div className="rounded-2xl rounded-tr-none bg-orange-100 p-3.5 text-orange-950 font-medium leading-relaxed max-w-[90%] border border-orange-200">
                    <p className="font-bold text-red-700 mb-1">We have no new banking details on file.</p>
                    Please continue to use the standard Wells Fargo routing account we&apos;ve had for the last three years. Do not process that new invoice.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Disposition Footer matching Reference Image 4 */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Info className="h-4 w-4" />
            <span>Requires manual disposition to clear queue.</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onDecision('hold')}
              disabled={decide.isPending}
              className="rounded-full border-red-300 text-red-600 hover:bg-red-50 text-xs font-extrabold px-6 py-2"
            >
              Hold
            </Button>
            <Button
              onClick={() => onDecision('release')}
              disabled={decide.isPending}
              className="rounded-full bg-[#00668c] hover:bg-[#005577] text-white text-xs font-extrabold px-6 py-2"
            >
              Release payment
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

