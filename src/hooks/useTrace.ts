'use client';

// useTrace — WebSocket hook. Connects to the pipeline-ws mini-service on port 3003.
// Dual-mode connection so the SAME build works in the hosted preview and on a
// developer PC:
//   - Hosted preview (page served through the browser gateway): the gateway
//     form io('/?XTransformPort=3003', ...) forwards the upgrade to port 3003.
//   - Local PC (page opened at http://localhost:3000): no gateway exists, so we
//     connect straight to the WS service at ws://localhost:3003.
// Subscribes to 'trace' + 'hello' events and forwards them into the Zustand store.
//
// On 'trace':
//   - `addTraceEvent(e)` — pushes the event to `recentEvents` (last 50) and runs
//     the existing `applyTraceEvent` side-effects (stage transitions, run_id
//     tracking, case-status propagation).
//   - For `e.type === 'case'`, invalidate the relevant TanStack Queries
//     (`['cases']` list + `['case', e.caseId]` detail) so views re-fetch.
//   - For `e.type === 'run_completed'`, invalidate `['stats']` so the dashboard
//     top callouts refresh against the freshly-completed batch.

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import type { TraceEvent, TraceStage } from '@/lib/types';

let socket: Socket | null = null;
let refCount = 0;

/** Pick the socket.io URL for the current environment (hosted gateway vs local PC). */
function wsUrl(): string {
  if (typeof window === 'undefined') return '/?XTransformPort=3003';
  const host = window.location.hostname;
  const isLocalPc =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (isLocalPc) {
    // Developer PC — reach the WS mini-service directly (no gateway in front).
    return `${window.location.protocol}//${host}:3003`;
  }
  // Hosted preview — route the upgrade through the browser gateway.
  return '/?XTransformPort=3003';
}

export function useTrace() {
  const addTraceEvent = useAppStore((s) => s.addTraceEvent);
  const setWsConnected = useAppStore((s) => s.setWsConnected);
  const qc = useQueryClient();

  useEffect(() => {
    refCount += 1;
    if (!socket) {
      socket = io(wsUrl(), {
        path: '/',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 8000,
        timeout: 12000,
      });
      socket.on('connect', () => {
        setWsConnected(true);
      });
      socket.on('disconnect', () => {
        setWsConnected(false);
      });
      socket.on('connect_error', () => {
        setWsConnected(false);
      });
      socket.on('hello', () => {
        setWsConnected(true);
      });
      socket.on('trace', (event: TraceEvent) => {
        // 1) Push to recentEvents + run stage/run_id side-effects.
        addTraceEvent(event);
        // 2) Invalidate the relevant TanStack Queries so views re-fetch.
        if (event.type === 'case' && event.caseId) {
          qc.invalidateQueries({ queryKey: ['case', event.caseId] });
          qc.invalidateQueries({ queryKey: ['cases'] });
          qc.invalidateQueries({ queryKey: ['stats'] });
        }
        if (event.type === 'run_completed') {
          qc.invalidateQueries({ queryKey: ['stats'] });
          qc.invalidateQueries({ queryKey: ['runs'] });
          if (event.runId) qc.invalidateQueries({ queryKey: ['run', event.runId] });
        }
      });
    }
    return () => {
      refCount -= 1;
      if (refCount <= 0 && socket) {
        socket.removeAllListeners('trace');
        socket.removeAllListeners('hello');
        socket.removeAllListeners('connect');
        socket.removeAllListeners('disconnect');
        socket.removeAllListeners('connect_error');
        socket.disconnect();
        socket = null;
        refCount = 0;
      }
    };
  }, [addTraceEvent, setWsConnected, qc]);

  return socket;
}

/** Subscribe to the WS-connected boolean (cheap re-render only on flip). */
export function useWsConnected() {
  return useAppStore((s) => s.wsConnected);
}

/**
 * useTraceStatus — composite selector for the live trace state.
 * Returns `{ connected, activeRunId, stages, recentEvents }` so any component
 * can read the full pipeline picture in one go. Re-renders only when any of
 * those slices change.
 */
export function useTraceStatus(): {
  connected: boolean;
  activeRunId: string | null;
  stages: TraceStage[];
  recentEvents: TraceEvent[];
} {
  const connected = useAppStore((s) => s.wsConnected);
  const activeRunId = useAppStore((s) => s.activeRunId);
  const stages = useAppStore((s) => s.stages);
  const recentEvents = useAppStore((s) => s.recentEvents);
  return { connected, activeRunId, stages, recentEvents };
}
