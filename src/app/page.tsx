'use client';

// AP Payment Fraud Sentinel — the single user-visible `/` route.
// Dark, professional financial-crime-ops console. Internal client-side navigation
// (sidebar + Zustand `view` state). Case-detail opens as a right-side Sheet.

import { useEffect } from 'react';
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
import { SetupGuideView } from '@/components/views/SetupGuideView';
import { CaseDetailSheet } from '@/components/views/CaseDetailSheet';
import { useAppStore } from '@/lib/store';
import { useTrace, useWsConnected } from '@/hooks/useTrace';
import { useHealthz, useStartRun } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
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
      {/* Header — sticky top. */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <div className="hidden items-center gap-2 lg:flex">
            <Rocket className="h-5 w-5 text-[#1f6c92]" />
            <span className="text-sm font-semibold tracking-tight">AP Payment Fraud Sentinel</span>
            <Badge variant="outline" className="border-[#1f6c92]/40 text-[10px] font-normal text-[#7fb8d6]">
              powered by RocketRide · 7-stage pipeline
            </Badge>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <Rocket className="h-5 w-5 text-[#1f6c92]" />
            <span className="text-sm font-semibold">AP Sentinel</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-[10px] uppercase tracking-wider',
              workerMode === 'offline'
                ? 'border-red-700/40 text-red-300'
                : workerMode === 'rocketride'
                  ? 'border-emerald-700/40 text-emerald-300'
                  : 'border-[#1f6c92]/40 text-[#7fb8d6]',
            )}
            title="worker mode"
          >
            worker: {workerMode}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-[10px] uppercase tracking-wider',
              wsConnected
                ? 'border-emerald-700/40 text-emerald-300'
                : 'border-amber-700/40 text-amber-300',
            )}
            title="websocket channel"
          >
            {wsConnected ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
            ws {wsConnected ? 'live' : 'down'}
          </Badge>
          <Button size="sm" onClick={onRunBatch} disabled={startRun.isPending} className="gap-2 bg-[#1f6c92] text-white hover:bg-[#1f6c92]/80">
            <Play className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Run batch</span>
            <span className="sm:hidden">Run</span>
          </Button>
        </div>
      </header>

      {/* Body — sidebar (desktop) + main */}
      <div className="flex flex-1">
        <SidebarNav />
        <main className="flex-1 min-w-0 pb-10">
          {view === 'dashboard' && <DashboardView />}
          {view === 'cases' && <CasesView />}
          {view === 'upload' && <UploadView />}
          {view === 'vendors' && <VendorsView />}
          {view === 'runs' && <RunsView />}
          {view === 'setup' && <SetupGuideView />}
        </main>
      </div>

      {/* Footer — sticky bottom (lifted to its own component). */}
      <Footer />

      {/* Case-detail Sheet — overlays the whole UI; opens from any view. */}
      <CaseDetailSheet />
    </div>
  );
}

