'use client';

// UploadView — drop your own CSV / PDF / EML dataset from your PC.
//
// Three file kinds, three destinies:
//   • .csv named vendor_master.csv / payment_history.csv / fraud_ground_truth.csv
//       → saved to /data/ (overwrites the synthetic reference master) and the
//         worker re-imports the DB tables immediately so the Vendors view +
//         payment-history sparklines reflect YOUR data before the batch runs.
//   • .pdf  (invoices)
//       → saved to /data/uploads/<run_id>/ and screened as cases.
//   • .eml  (emails — bank-change requests, BEC lures)
//       → saved to /data/uploads/<run_id>/ and paired with PDFs by invoice #
//         or case_id marker (mirrors how the synthetic seed dataset pairs them).
//
// After upload, click "Start batch run" — the worker scans the upload dir for
// both .pdf and .eml, pairs them, and runs the 7-stage pipeline.

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Terminal, Play, Copy, Check, Table2, Mail, FileSearch, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUploadFiles, useRuns, useStartRun } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

const ACCEPTED = /\.(csv|pdf|eml|json|txt)$/i;

const REFERENCE_CSV_NAMES = new Set([
  'vendor_master.csv',
  'payment_history.csv',
  'fraud_ground_truth.csv',
]);

function fileKind(name: string): 'reference-csv' | 'pdf' | 'eml' | 'csv' | 'other' {
  const lower = name.toLowerCase();
  if (REFERENCE_CSV_NAMES.has(lower)) return 'reference-csv';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.eml')) return 'eml';
  if (lower.endsWith('.csv')) return 'csv';
  return 'other';
}

function FileIcon({ kind }: { kind: ReturnType<typeof fileKind> }) {
  if (kind === 'reference-csv' || kind === 'csv') return <Table2 className="h-3.5 w-3.5 text-[#7fb8d6]" />;
  if (kind === 'pdf') return <FileText className="h-3.5 w-3.5 text-[#7fb8d6]" />;
  if (kind === 'eml') return <Mail className="h-3.5 w-3.5 text-[#7fb8d6]" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function UploadView() {
  const [files, setFiles] = useState<File[]>([]);
  const [runId, setRunId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useUploadFiles();
  const startRun = useStartRun();
  const { data: runs } = useRuns();
  const setView = useAppStore((s) => s.setView);
  const { toast } = useToast();

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []).filter((f) => ACCEPTED.test(f.name));
    if (dropped.length) setFiles((prev) => [...prev, ...dropped].slice(0, 200));
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => ACCEPTED.test(f.name));
    if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, 200));
  };

  const submit = async () => {
    if (!files.length) {
      toast({ title: 'Add files first', variant: 'destructive' });
      return;
    }
    try {
      const r = await upload.mutateAsync({ runId: runId || undefined, files });
      setRunId(r.run_id);
      const refCount = r.files.filter((f) => f.kind === 'reference-csv').length;
      const caseCount = r.files.length - refCount;
      toast({
        title: `Uploaded ${r.files_received} file(s)`,
        description: r.csv_reloaded
          ? `${refCount} reference CSV(s) re-seeded → ${r.csv_reloaded.vendors} vendors / ${r.csv_reloaded.payments} payments. ${caseCount} case file(s) staged.`
          : `${caseCount} case file(s) staged in /data/uploads/${r.run_id}/.`,
      });
      setFiles([]);
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const kickRun = async () => {
    if (!runId) {
      toast({ title: 'Upload first', description: 'Submit files to get a run_id.', variant: 'destructive' });
      return;
    }
    try {
      const r = await startRun.mutateAsync({ batch_path: `data/uploads/${runId}` });
      toast({ title: 'Worker started', description: `run_id: ${r.run_id} — scanning data/uploads/${runId}/ for PDFs + EMLs` });
      setView('dashboard');
    } catch (e) {
      toast({ title: 'Run failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const curl = `curl -X POST http://localhost:3000/api/upload \\
  -F "run_id=upload-$(date +%s)" \\
  -F "file=@vendor_master.csv" \\
  -F "file=@payment_history.csv" \\
  -F "file=@invoice_001.pdf" \\
  -F "file=@bank_change.eml"`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const refCsvCount = files.filter((f) => fileKind(f.name) === 'reference-csv').length;
  const caseCount = files.length - refCsvCount;

  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4 text-[#7fb8d6]" />
            Upload your dataset (CSV · PDF · EML)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              dragging ? 'border-[#1f6c92] bg-[#1f6c92]/10' : 'border-border/60 hover:border-[#1f6c92]/50 hover:bg-muted/20',
            )}
          >
            <Upload className="h-8 w-8 text-[#7fb8d6]" />
            <div className="text-sm font-medium">Drop your CSV / PDF / EML files here</div>
            <div className="text-xs text-muted-foreground">or click to browse — accepts .csv, .pdf, .eml, .json, .txt</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.pdf,.eml,.json,.txt"
              onChange={onPick}
              className="hidden"
            />
          </div>

          {/* Help callout — explains what each file kind does. */}
          <div className="rounded-md border border-[#1f6c92]/30 bg-[#1f6c92]/[0.07] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#7fb8d6]">
              <Info className="h-3 w-3" />
              How files are routed
            </div>
            <ul className="space-y-1 text-xs text-foreground/85">
              <li className="flex gap-2">
                <Table2 className="mt-0.5 h-3 w-3 shrink-0 text-[#7fb8d6]" />
                <span><code className="font-mono text-[11px]">vendor_master.csv</code> / <code className="font-mono text-[11px]">payment_history.csv</code> / <code className="font-mono text-[11px]">fraud_ground_truth.csv</code> → overwrites the reference master and re-seeds the DB immediately (vendors + payment history the pipeline grounds against).</span>
              </li>
              <li className="flex gap-2">
                <FileText className="mt-0.5 h-3 w-3 shrink-0 text-[#7fb8d6]" />
                <span><code className="font-mono text-[11px]">*.pdf</code> invoices → staged in <code className="font-mono text-[11px]">/data/uploads/&lt;run_id&gt;/</code> and screened as cases.</span>
              </li>
              <li className="flex gap-2">
                <Mail className="mt-0.5 h-3 w-3 shrink-0 text-[#7fb8d6]" />
                <span><code className="font-mono text-[11px]">*.eml</code> emails → staged alongside the PDFs and paired by invoice # (the BEC-signal input).</span>
              </li>
            </ul>
          </div>

          {files.length > 0 && (
            <ScrollArea className="max-h-56 rounded-md border border-border/60 p-2">
              <ul className="flex flex-col gap-1">
                {files.map((f, i) => {
                  const kind = fileKind(f.name);
                  return (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs">
                      <FileIcon kind={kind} />
                      <span className="truncate">{f.name}</span>
                      {kind === 'reference-csv' && (
                        <span className="rounded bg-[#1f6c92]/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#7fb8d6]">ref</span>
                      )}
                      {kind === 'pdf' && (
                        <span className="rounded bg-emerald-700/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">invoice</span>
                      )}
                      {kind === 'eml' && (
                        <span className="rounded bg-amber-700/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">email</span>
                      )}
                      <span className="ml-auto font-mono text-muted-foreground">{(f.size / 1024).toFixed(1)} kB</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, idx) => idx !== i)); }}
                        className="text-xs text-red-300 hover:underline"
                      >
                        remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}

          {files.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {refCsvCount > 0 && <span className="text-[#7fb8d6]">{refCsvCount} reference CSV</span>}
              {refCsvCount > 0 && caseCount > 0 && <span> · </span>}
              {caseCount > 0 && <span className="text-emerald-300">{caseCount} case file</span>}
              {' · '}
              <span>total {files.length}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="run_id" className="text-xs">Run ID (optional)</Label>
              <Input
                id="run_id"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="auto-generated on submit"
                className="font-mono"
              />
            </div>
            <Button onClick={submit} disabled={upload.isPending || !files.length} className="gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <Button onClick={kickRun} disabled={startRun.isPending || !runId} variant="outline" className="gap-2 border-[#1f6c92]/50 text-[#7fb8d6]">
              <Play className="h-4 w-4" />
              Start batch run
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Terminal className="h-4 w-4 text-[#7fb8d6]" />
            Webhook (curl)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-card/60 p-3 font-mono text-[11px] text-foreground/80">{curl}</pre>
          <Button size="sm" variant="outline" onClick={copy} className="gap-2 self-start">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'copied' : 'copy'}
          </Button>
          <div className="rounded-md border border-border/60 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <FileSearch className="h-3 w-3" />
              Recent runs
            </div>
            <ScrollArea className="max-h-64">
              {(runs?.items ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground">No runs yet.</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(runs?.items ?? []).map((r) => (
                    <li key={r.runId} className="flex items-center justify-between rounded border border-border/40 px-2 py-1 text-xs">
                      <code className="font-mono">{r.runId}</code>
                      <span className={cn(
                        'font-mono text-[10px] uppercase',
                        r.status === 'complete' ? 'text-emerald-300' : r.status === 'running' ? 'text-amber-300' : 'text-muted-foreground',
                      )}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
