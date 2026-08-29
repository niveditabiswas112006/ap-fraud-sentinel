'use client';

import { useState, useCallback, useRef } from 'react';
import { UploadCloud, FileText, Mail, CheckCircle2, ShieldAlert, Loader2, Info, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUploadFiles, useStartRun } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const ACCEPTED = /\.(csv|pdf|eml|json|txt|msg)$/i;

interface QueueItem {
  id: string;
  name: string;
  size: string;
  time: string;
  status: 'Ready' | 'Parsing' | 'Quarantined' | 'Analyzed';
  badgeCls: string;
}

export function UploadView() {
  const [dragging, setDragging] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const setRunId = useAppStore((s) => s.setRunId);
  const setView = useAppStore((s) => s.setView);
  const activeRunId = useAppStore((s) => s.runId);

  const upload = useUploadFiles();
  const startRun = useStartRun();
  const { toast } = useToast();

  const [queue, setQueue] = useState<QueueItem[]>([
    { id: '1', name: 'INV-2023-8942_GlobalTech.pdf', size: '1.2 MB', time: 'Uploaded 2m ago', status: 'Parsing', badgeCls: 'bg-[#e0f2fe] text-[#0284c7] border-sky-200' },
    { id: '2', name: 'FWD Payment Instructions_Updated.pdf', size: '45 KB', time: 'Uploaded 15m ago', status: 'Ready', badgeCls: 'bg-sky-50 text-[#005577] border-sky-300' },
    { id: '3', name: 'Urgent Invoice Overdue Notice.pdf', size: '500 KB', time: 'Metadata anomalous', status: 'Quarantined', badgeCls: 'bg-red-100 text-red-700 border-red-300' },
    { id: '4', name: 'Receipt_Oct_2023_Meals.pdf', size: '1.8 MB', time: 'Uploaded 1h ago', status: 'Analyzed', badgeCls: 'bg-teal-50 text-teal-800 border-teal-200' },
  ]);

  const handleFilesUpload = async (fileList: File[]) => {
    const valid = fileList.filter((f) => ACCEPTED.test(f.name));
    if (!valid.length) {
      toast({
        title: 'Unsupported file format',
        description: 'Please upload PDF, EML, CSV, JSON, or TXT files.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const res = await upload.mutateAsync({ files: valid });
      if (res.run_id) setRunId(res.run_id);

      const newItems: QueueItem[] = valid.map((f, i) => ({
        id: `upload-${Date.now()}-${i}`,
        name: f.name,
        size: `${(f.size / 1024).toFixed(1)} KB`,
        time: 'Just now',
        status: 'Ready',
        badgeCls: 'bg-sky-50 text-[#005577] border-sky-300',
      }));

      setQueue((prev) => [...newItems, ...prev]);
      setToastMsg(`${valid.length} file${valid.length > 1 ? 's' : ''} uploaded to processing queue. Run ID: ${res.run_id}`);
      
      toast({
        title: 'Upload Successful',
        description: `${valid.length} file(s) saved. Click 'Run Batch' to analyze.`,
      });
    } catch (e) {
      toast({
        title: 'Upload Failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length) handleFilesUpload(dropped);
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) handleFilesUpload(picked);
  };

  const onRunBatch = async () => {
    try {
      const r = await startRun.mutateAsync({});
      toast({
        title: 'Batch run started',
        description: `run_id ${r.run_id} — processing pipeline in real time.`,
      });
      setView('dashboard');
    } catch (e) {
      toast({
        title: 'Run failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Upload Dataset</h1>
          <p className="text-xs font-semibold text-slate-500">
            Upload invoices, vendor communications, or reference CSV files to process through RocketRide.
          </p>
        </div>

        <Button
          onClick={onRunBatch}
          disabled={startRun.isPending}
          className="gap-2 rounded-full bg-[#00668c] hover:bg-[#005577] text-white text-xs font-extrabold px-5 py-2.5 shadow-sm cursor-pointer"
        >
          {startRun.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-white" />
          )}
          <span>Run Batch</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Side: Upload Box */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer bg-slate-50/50',
              dragging ? 'border-[#00668c] bg-sky-50' : 'border-slate-300 hover:border-[#00668c] hover:bg-white',
              upload.isPending && 'opacity-60 pointer-events-none'
            )}
          >
            {upload.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-[#00668c]" />
                <span className="text-xs font-bold text-slate-700">Uploading files to dataset...</span>
              </div>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200/80 text-slate-600">
                  <UploadCloud className="h-7 w-7" />
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-extrabold text-slate-800">Drag & Drop Invoice / Dataset files</h3>
                  <p className="max-w-md text-xs font-medium text-slate-500">
                    Supports PDF, EML, CSV (vendor_master, payment_history, fraud_ground_truth), JSON, or TXT.
                  </p>
                </div>

                <Button
                  type="button"
                  className="mt-2 rounded-full bg-[#e0f2fe] hover:bg-sky-200 text-[#005577] text-xs font-extrabold px-6 py-2 shadow-none border border-sky-200 cursor-pointer"
                >
                  Browse Files
                </Button>
              </>
            )}

            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.pdf,.eml,.json,.txt,.msg"
              onChange={onPick}
              className="hidden"
            />
          </div>

          {/* Info cards at bottom of left panel */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
                <FileText className="h-4 w-4 text-[#00668c]" />
                Supported Formats
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                <li>• PDF (Invoices, Receipts & Statements)</li>
                <li>• EML & MSG (Raw Vendor Communications)</li>
                <li>• CSV (Master Databases & Ground Truth)</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
                <Info className="h-4 w-4 text-[#00668c]" />
                Dataset Staging Policy
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Uploaded reference files automatically reload the SQLite ground-truth database for immediate out-of-band verification.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Processing Queue */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Processing Queue
              </h2>
              <span className="rounded-full bg-sky-50 text-[#005577] px-3 py-0.5 text-[10px] font-extrabold border border-sky-200">
                {queue.length} Active
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {queue.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-3.5"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 shadow-xs">
                        {item.name.endsWith('.eml') ? <Mail className="h-4 w-4 text-sky-600" /> : <FileText className="h-4 w-4 text-[#00668c]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-xs font-bold text-slate-800">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-medium">{item.size} • {item.time}</span>
                      </div>
                    </div>

                    <span className={cn('shrink-0 rounded-full border px-3 py-0.5 text-[10px] font-extrabold uppercase flex items-center gap-1.5', item.badgeCls)}>
                      {item.status === 'Parsing' && <Loader2 className="h-3 w-3 animate-spin text-[#0284c7]" />}
                      {item.status === 'Quarantined' && <ShieldAlert className="h-3 w-3 text-red-600" />}
                      {item.status === 'Ready' && <CheckCircle2 className="h-3 w-3 text-[#005577]" />}
                      {item.status}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onRunBatch}
              className="text-xs font-extrabold text-[#00668c] hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="h-3 w-3 fill-[#00668c]" />
              Run Pipeline Now
            </button>
            <span className="font-mono text-[10px] font-bold text-slate-400">
              {activeRunId ?? 'RUN-992'}
            </span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-xl bg-slate-900 text-white px-5 py-3 shadow-2xl animate-in slide-in-from-bottom-5">
          <span className="text-xs font-bold">{toastMsg}</span>
          <button
            onClick={() => setToastMsg(null)}
            className="text-xs font-bold text-sky-400 hover:text-sky-300 uppercase tracking-wider cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      )}
    </div>
  );
}

