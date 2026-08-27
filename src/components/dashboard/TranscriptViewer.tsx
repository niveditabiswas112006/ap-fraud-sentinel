'use client';

// TranscriptViewer — audio player (HTML5 <audio>) + transcript text.
// Highlights deny phrases in red. Plays audio at the resolved callAudioUrl.

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, PhoneCall, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { VerificationBadge } from '@/components/dashboard/StatusBadge';

const DENY_PHRASES = [
  'did not request',
  'no change',
  'never asked',
  'not us',
  'do not recognize',
  "don't recognize",
  'incorrect',
  'fraud',
  'no idea',
  'i do not',
  "i don't",
  'wrong',
  'fake',
  'scam',
];

export function TranscriptViewer({
  transcript,
  audioUrl,
  verificationResult,
  className,
}: {
  transcript?: string | null;
  audioUrl?: string | null;
  verificationResult?: 'confirmed' | 'denied' | 'unclear' | null;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Create the audio element once on the client.
  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    audioRef.current = new Audio();
    return () => {
      try {
        audioRef.current?.pause();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (urlRef.current !== audioUrl) {
      audio.src = audioUrl;
      urlRef.current = audioUrl;
    }
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  const lines = (transcript ?? '').split(/\n+/).map((l) => l.trim()).filter(Boolean);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-[#7fb8d6]" />
          <span className="text-sm font-medium">Verification call</span>
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge result={verificationResult ?? null} />
          {audioUrl ? (
            <Button size="sm" variant="outline" onClick={togglePlay} className="gap-2">
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span className="font-mono text-[11px]">{playing ? 'pause' : 'play'}</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled className="gap-2">
              <PhoneOff className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px]">no audio</span>
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="max-h-72 rounded-md border border-border/60 bg-card/40 p-3">
        {lines.length === 0 ? (
          <div className="text-xs text-muted-foreground">No transcript available for this case.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lines.map((l, i) => {
              const lower = l.toLowerCase();
              const deny = DENY_PHRASES.some((p) => lower.includes(p));
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-md border-l-2 px-2 py-1 font-mono text-xs leading-relaxed',
                    deny
                      ? 'border-red-500/70 bg-red-950/30 text-red-200'
                      : 'border-border/40 bg-transparent text-foreground/80',
                  )}
                >
                  {l}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
