'use client';

// AP Payment Fraud Sentinel — the single user-visible `/` route.
// Dark, professional financial-crime-ops console. Internal client-side navigation
// (sidebar + Zustand `view` state). Case-detail opens as a right-side Sheet.

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Play, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger, SidebarNav } from '@/components/dashboard/Sidebar';
import { Footer } from '@/components/Footer';
import { DashboardView } from '@/components/views/DashboardView';
import { CasesView } from '@/components/views/CasesView';
import { UploadView } from '@/components/views/UploadView';
import { VendorsView } from '@/components/views/VendorsView';
import { RunsView } from '@/components/views/RunsView';
import { CaseDetailSheet } from '@/components/views/CaseDetailSheet';
import { useAppStore } from '@/lib/store';
import { useTrace, useWsConnected } from '@/hooks/useTrace';
import { useHealthz, useStartRun } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);
  // Keep the WS channel live for the whole session.
  useTrace();
  const wsConnected = useWsConnected();
  const { data: health } = useHealthz();
  const startRun = useStartRun();
  const { toast } = useToast();

  // Default to dashboard on first paint.
  useEffect(() => {
    if (!useAppStore.getState().view) setView('dashboard');
  }, [setView]);

  const onRunBatch = async () => {
    try {
      const r = await startRun.mutateAsync({});
      toast({
        title: 'Batch run started',
        description: `run_id ${r.run_id} — the pipeline trace will animate as WS events arrive.`,
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

  const workerMode = health?.worker?.mode ?? 'offline';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header — sticky top matching reference screenshots. */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="font-poppins text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            AP Payment Fraud Sentinel
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setCurrency(currency === 'INR' ? 'USD' : 'INR')}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer shadow-xs"
            title="Click to toggle currency between INR (₹) and USD ($)"
          >
            <span className="font-extrabold">{currency === 'INR' ? '₹ INR' : '$ USD'}</span>
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            WORKER: LOCAL
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-[#00668c] border border-sky-200">
            <span className="h-2 w-2 rounded-full bg-[#0284c7] animate-pulse" />
            WORKER: RUNNING
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500" title={wsConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}>
            <Wifi className={cn('h-3.5 w-3.5', wsConnected ? 'text-emerald-600' : 'text-amber-500')} />
          </div>
        </div>
      </header>

      {/* Body — sidebar (desktop) + main */}
      <div className="flex flex-1">
        <SidebarNav />
        <main className="flex-1 min-w-0 pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {view === 'dashboard' && <DashboardView />}
              {view === 'cases' && <CasesView />}
              {view === 'upload' && <UploadView />}
              {view === 'vendors' && <VendorsView />}
              {view === 'runs' && <RunsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Footer — sticky bottom (lifted to its own component). */}
      <Footer />

      {/* Case-detail Sheet — overlays the whole UI; opens from any view. */}
      <CaseDetailSheet />
    </div>
  );
}

