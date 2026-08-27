'use client';

// SetupGuideView — "Run it on your own PC" section. Bundles the whole project
// as a ready-to-run ZIP (via /api/download) and walks the user through:
// prerequisites → setup script → start script → swapping in their own
// CSV / PDF / EML dataset. Mirrors SETUP.md shipped inside the archive.

import { useState } from 'react';
import {
  Laptop,
  Download,
  Copy,
  Check,
  Terminal,
  FolderOpen,
  Server,
  Wrench,
  FileSpreadsheet,
  FileText,
  Mail,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

function CopyCmd({ cmd, label }: { cmd: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group flex items-center justify-between gap-2 rounded-md border border-border/60 bg-zinc-950/70 px-3 py-2">
      <code className="min-w-0 truncate font-mono text-xs text-emerald-300">
        <span className="select-none text-zinc-500">$ </span>
        {cmd}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={label ?? 'Copy command'}
        onClick={() => {
          navigator.clipboard?.writeText(cmd).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function StepRow({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#1f6c92]/50 bg-[#1f6c92]/10 font-mono text-xs font-semibold text-[#7fb8d6]"
        aria-hidden="true"
      >
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-2 pb-5">
        <p className="text-sm font-medium leading-7">{title}</p>
        {children}
      </div>
    </div>
  );
}

const CSV_HEADERS: { file: string; icon: React.ReactNode; desc: string; header: string }[] = [
  {
    file: 'data/vendor_master.csv',
    icon: <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />,
    desc: 'Known-good vendor baseline (phones, bank accounts, domains) the pipeline grounds against.',
    header:
      'vendorId,legalName,registeredDomain,knownPhone,knownBankAccount,bankAccountAddedDate,firstInvoiceDate,address,contactEmail,taxId',
  },
  {
    file: 'data/payment_history.csv',
    icon: <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />,
    desc: 'Historic payments — powers the z-score amount-anomaly signal (8+ rows per vendor works best).',
    header: 'paymentId,vendorId,invoiceNumber,paidDate,amountUsd,currencyOriginal',
  },
  {
    file: 'data/fraud_ground_truth.csv',
    icon: <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />,
    desc: 'Optional labels — only used to score the detector on the Runs page.',
    header: 'caseId,invoiceNumber,fraudType,isFraud,expectedSignal',
  },
];

export function SetupGuideView() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Heading */}
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Laptop className="h-5 w-5 text-[#1f6c92]" aria-hidden="true" />
          Run it on your own PC
        </h1>
        <p className="text-sm text-muted-foreground">
          Download the full stack — dashboard, 7-stage pipeline worker, trace
          service, and the synthetic dataset as a reference — then screen{' '}
          <span className="text-foreground">your own</span> CSV + PDF + EML files locally.
          No API keys required: without a RocketRide key everything runs in deterministic local mode.
        </p>
      </div>

      {/* Hero download card */}
      <Card className="border-[#1f6c92]/30 bg-gradient-to-br from-[#1f6c92]/10 via-transparent to-emerald-900/10">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-base font-semibold">ap-fraud-sentinel.zip</p>
            <p className="text-sm text-muted-foreground">
              Full project, ready to run — includes setup scripts for Windows &amp; macOS/Linux,
              the synthetic dataset (60 vendors · 480 payments · 141 invoices · 31 emails),
              and a portable pre-configured <code className="font-mono text-xs">.env</code>.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="outline" className="border-emerald-700/40 text-[10px] text-emerald-300">~18 MB</Badge>
              <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">zero API keys needed</Badge>
              <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">SQLite — no server DB</Badge>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <a href="/api/download" download="ap-fraud-sentinel.zip">
              <Download className="h-4 w-4" />
              Download project ZIP
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Prerequisites */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-[#7fb8d6]" aria-hidden="true" />
            Prerequisites
          </CardTitle>
          <CardDescription>Install these first — everything else is automatic.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {[
            { name: 'Node.js', ver: '18+', get: 'nodejs.org', note: 'runs the dashboard' },
            { name: 'Python', ver: '3.10+', get: 'python.org', note: 'runs the pipeline worker' },
            { name: 'Bun', ver: '1.x', get: 'bun.sh', note: 'optional — faster installs' },
          ].map((p) => (
            <div key={p.name} className="rounded-lg border border-border/60 bg-zinc-950/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant="outline" className="font-mono text-[10px] text-[#7fb8d6]">{p.ver}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.note} · <span className="font-mono">{p.get}</span>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Steps per OS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-[#7fb8d6]" aria-hidden="true" />
            Quick start — two commands
          </CardTitle>
          <CardDescription>
            The setup script installs every dependency, creates <code className="font-mono text-xs">.env</code>,
            builds the SQLite database, and loads the reference CSVs. The start script boots all
            three services and opens the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="win">
            <TabsList className="mb-4">
              <TabsTrigger value="win">Windows</TabsTrigger>
              <TabsTrigger value="unix">macOS / Linux</TabsTrigger>
            </TabsList>

            <TabsContent value="win" className="mt-0 space-y-0">
              <StepRow n={1} title="Download the ZIP above, extract it, and open the folder.">
                <p className="text-xs text-muted-foreground">
                  Right-click the ZIP → <em>Extract All…</em> Any folder works — no install location requirements.
                </p>
              </StepRow>
              <StepRow n={2} title="One-time setup — double-click setup.bat">
                <CopyCmd cmd="setup.bat" label="Copy setup command" />
                <p className="text-xs text-muted-foreground">
                  Installs Node + Python dependencies, creates .env, runs <code className="font-mono">prisma db push</code> and seeds the demo CSVs.
                </p>
              </StepRow>
              <StepRow n={3} title="Start everything — double-click start.bat">
                <CopyCmd cmd="start.bat" label="Copy start command" />
                <p className="text-xs text-muted-foreground">
                  Opens three console windows (trace :3003 · worker :3030 · dashboard :3000) and launches your browser at{' '}
                  <code className="font-mono text-xs text-[#7fb8d6]">http://localhost:3000</code>.
                </p>
              </StepRow>
              <StepRow n={4} title="Click “Run batch” on the dashboard.">
                <p className="text-xs text-muted-foreground">
                  Watch the 7-stage trace animate live, then open a case to review signals, the verification
                  call, and the evidence pack — exactly like this preview.
                </p>
              </StepRow>
            </TabsContent>

            <TabsContent value="unix" className="mt-0 space-y-0">
              <StepRow n={1} title="Download the ZIP above, extract it, and cd in.">
                <CopyCmd cmd="unzip ap-fraud-sentinel.zip && cd ap-fraud-sentinel" />
              </StepRow>
              <StepRow n={2} title="One-time setup">
                <CopyCmd cmd="./setup.sh" label="Copy setup command" />
                <p className="text-xs text-muted-foreground">
                  Installs Node + Python dependencies, creates .env, runs <code className="font-mono">prisma db push</code> and seeds the demo CSVs.
                </p>
              </StepRow>
              <StepRow n={3} title="Start all three services">
                <CopyCmd cmd="./start.sh" label="Copy start command" />
                <p className="text-xs text-muted-foreground">
                  Boots trace :3003, worker :3030, dashboard :3000, then opens{' '}
                  <code className="font-mono text-xs text-[#7fb8d6]">http://localhost:3000</code>. Ctrl+C stops all three.
                </p>
              </StepRow>
              <StepRow n={4} title="Click “Run batch” on the dashboard.">
                <p className="text-xs text-muted-foreground">
                  Watch the 7-stage trace animate live, then open a case to review signals, the verification
                  call, and the evidence pack.
                </p>
              </StepRow>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Bring your own dataset */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Bring your own dataset
          </CardTitle>
          <CardDescription>
            After the demo works, replace the synthetic data with your real files — keep the exact
            column headers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-zinc-950/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" /> data/*.csv
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Vendor master + payment history (+ optional truth labels)</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-zinc-950/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <FileText className="h-3.5 w-3.5 text-[#7fb8d6]" /> data/invoices/*.pdf
              </p>
              <p className="mt-1 text-xs text-muted-foreground">One invoice per PDF — text-based PDFs parse best; scanned images quarantine by design</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-zinc-950/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Mail className="h-3.5 w-3.5 text-amber-400" /> data/emails/*.eml
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Standard .eml exports (Outlook drag-out, Gmail takeout) drive the BEC signal</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Required CSV headers
            </p>
            {CSV_HEADERS.map((c) => (
              <div key={c.file} className="space-y-1 rounded-lg border border-border/60 bg-zinc-950/40 p-3">
                <p className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                  {c.icon} {c.file}
                </p>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
                <p className="overflow-x-auto rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-emerald-300/90">
                  {c.header}
                </p>
              </div>
            ))}
          </div>

          <StepRow n={5} title="Reload the reference tables, then run a batch against your files.">
            <CopyCmd cmd="python scripts/seed_db.py" label="Copy reseed command" />
            <p className="text-xs text-muted-foreground">
              Then hit <span className="text-foreground">Run batch</span> — every case is grounded against{' '}
              <em>your</em> vendor master and payment history.
            </p>
          </StepRow>
        </CardContent>
      </Card>

      {/* What runs where */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-[#7fb8d6]" aria-hidden="true" />
            What runs where
          </CardTitle>
          <CardDescription>
            Three local processes share one SQLite file — no other infrastructure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/60">
                {[
                  ['Dashboard (Next.js)', ':3000', 'The single-page UI — what you are looking at'],
                  ['Pipeline worker (Python)', ':3030', 'Runs the 7 stages, writes cases + runs to SQLite'],
                  ['Trace service (socket.io)', ':3003', 'Streams live pipeline events to the dashboard'],
                ].map(([svc, port, what], i) => (
                  <tr key={svc} className={cn('bg-zinc-950/40', i % 2 === 1 && 'bg-transparent')}>
                    <td className="px-3 py-2.5 font-medium">{svc}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-[#7fb8d6]">{port}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-amber-400" aria-hidden="true" />
            Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="ws">
              <AccordionTrigger className="text-sm">Dashboard shows the “ws down” badge</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                The trace service on port 3003 isn&apos;t running. Start it with{' '}
                <code className="font-mono">npm run ws</code> (or the start script) and refresh — the badge flips to{' '}
                <span className="text-emerald-300">ws live</span> automatically.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="pdf">
              <AccordionTrigger className="text-sm">All my PDFs land in “quarantined”</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                Install the PDF text extractor (<code className="font-mono">pip install pdfplumber</code>) and make sure
                the PDFs contain selectable text — scanned/image-only invoices are quarantined by design
                (that&apos;s the malformed-input path working correctly).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="python">
              <AccordionTrigger className="text-sm">“python” is not recognized (Windows)</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                Re-run the Python installer and tick <em>Add python.org to PATH</em>, or use the launcher:{' '}
                <code className="font-mono">py -3 worker/main.py</code>.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reset">
              <AccordionTrigger className="text-sm">Reset everything and start fresh</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                Delete <code className="font-mono">db/custom.db</code>, then{' '}
                <code className="font-mono">npm run db:push &amp;&amp; python scripts/seed_db.py</code>. Cases and runs
                rebuild from your data folder on the next batch.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
