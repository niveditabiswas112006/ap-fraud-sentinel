'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ShieldAlert,
  Upload,
  Building2,
  History,
  Menu,
  ShieldCheck,
  Play,
  Square,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore, type View } from '@/lib/store';
import { useStartRun } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface NavItem {
  id: View;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'cases', label: 'Cases', icon: ShieldAlert },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'vendors', label: 'Vendors', icon: Building2 },
  { id: 'runs', label: 'Runs', icon: History },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00668c]/10 text-[#00668c]">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-poppins text-xs font-bold uppercase tracking-wider text-slate-900">
          AP SENTINEL
        </span>
        <span className="text-[11px] font-medium text-slate-500">RocketRide · 7-stage</span>
      </div>
    </div>
  );
}

function RunBatchSidebarButton() {
  const startRun = useStartRun();
  const setView = useAppStore((s) => s.setView);
  const batchStatus = useAppStore((s) => s.batchStatus);
  const setBatchStatus = useAppStore((s) => s.setBatchStatus);
  const resetStages = useAppStore((s) => s.resetStages);
  const { toast } = useToast();

  const isRunning = startRun.isPending || batchStatus === 'running';
  const isCompleted = !isRunning && batchStatus === 'completed';

  const onRunBatch = async () => {
    try {
      setBatchStatus('running');
      const r = await startRun.mutateAsync({});
      toast({
        title: 'Batch run started',
        description: `run_id ${r.run_id} — processing pipeline in real time.`,
      });
      setView('dashboard');
    } catch (e) {
      setBatchStatus('idle');
      toast({
        title: 'Run failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const onStopBatch = () => {
    setBatchStatus('idle');
    resetStages();
    toast({
      title: 'Batch Stopped',
      description: 'Pipeline batch execution stopped by user.',
    });
  };

  if (isRunning) {
    return (
      <div className="my-2 px-1">
        <Button
          type="button"
          onClick={onStopBatch}
          className="w-full justify-center gap-2.5 rounded-full bg-red-600 py-5 text-sm font-bold text-white shadow-sm hover:bg-red-700 active:scale-[0.98] cursor-pointer"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 animate-pulse">
            <Square className="h-3 w-3 fill-white text-white" />
          </div>
          <span>Stop batch</span>
        </Button>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="my-2 px-1">
        <Button
          type="button"
          onClick={onRunBatch}
          className="w-full justify-center gap-2.5 rounded-full bg-[#0f766e] py-5 text-sm font-bold text-white shadow-sm hover:bg-[#0d655e] active:scale-[0.98] cursor-pointer"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span>Batch Processed ✓</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="my-2 px-1">
      <Button
        type="button"
        onClick={onRunBatch}
        disabled={startRun.isPending}
        className="w-full justify-center gap-2.5 rounded-full bg-[#00668c] py-5 text-sm font-bold text-white shadow-sm hover:bg-[#005577] active:scale-[0.98] cursor-pointer"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
          <Play className="h-3 w-3 fill-white text-white" />
        </div>
        <span>Run batch</span>
      </Button>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <nav className="flex flex-col gap-1.5 py-2 relative" aria-label="Primary">
      {NAV.map((item) => {
        const active = view === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setView(item.id);
              onNavigate?.();
            }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3.5 rounded-full px-4 py-2.5 text-xs font-bold transition-all duration-200 cursor-pointer select-none',
              active ? 'text-[#005577]' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
            )}
          >
            {active && (
              <motion.div
                layoutId="active-nav-pill"
                className="absolute inset-0 rounded-full bg-[#e0f2fe] border border-sky-200 shadow-xs"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}

            <Icon
              className={cn(
                'relative z-10 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-115 group-hover:rotate-6',
                active ? 'text-[#005577]' : 'text-slate-500 group-hover:text-slate-900',
              )}
            />
            <span className="relative z-10 transition-transform duration-200 group-hover:translate-x-0.5 font-medium">
              {item.label}
            </span>

            {active && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-[#00668c]"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function SidebarTrigger() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-white p-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-5 w-5 text-[#00668c]" />
            AP SENTINEL
          </SheetTitle>
          <SheetDescription className="text-xs">RocketRide · 7-stage pipeline</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <RunBatchSidebarButton />
          <NavItems onNavigate={() => setMobileOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SidebarNav() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white p-3 lg:block">
      <Brand />
      <RunBatchSidebarButton />
      <NavItems />
    </aside>
  );
}

export function Sidebar() {
  return <SidebarTrigger />;
}

