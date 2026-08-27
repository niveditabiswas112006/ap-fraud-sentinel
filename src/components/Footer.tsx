'use client';

// Footer — sticky bottom bar. Left: product tagline. Right: worker mode + ws
// connection dot + the current view name. Reads worker mode from useHealthz
// (polled every 15s) and the ws channel from useWsConnected (set by useTrace).

import { Rocket, Wifi, WifiOff } from 'lucide-react';
import { useWsConnected } from '@/hooks/useTrace';
import { useHealthz } from '@/hooks/useDashboardData';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Footer() {
  const wsConnected = useWsConnected();
  const { data: health } = useHealthz();
  const view = useAppStore((s) => s.view);
  const workerMode = health?.worker?.mode ?? 'offline';

  return (
    <footer className="mt-auto flex flex-col gap-2 border-t border-border/60 bg-card/40 px-3 py-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2">
        <Rocket className="h-3.5 w-3.5 text-[#1f6c92]" />
        <span>AP Payment Fraud Sentinel · RocketRide Buildathon PS #4</span>
      </div>
      <div className="sm:ml-auto flex items-center gap-3">
        <span className="font-mono">
          worker:{' '}
          <span className={cn(workerMode === 'offline' ? 'text-red-400' : 'text-emerald-400')}>
            {workerMode}
          </span>
        </span>
        <span className="font-mono flex items-center gap-1">
          ws:{' '}
          <span className={cn('flex items-center gap-1', wsConnected ? 'text-emerald-400' : 'text-amber-400')}>
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? 'connected' : 'offline'}
          </span>
        </span>
        <span className="font-mono hidden sm:inline">
          view: <span className="text-[#7fb8d6]">{view}</span>
        </span>
      </div>
    </footer>
  );
}
