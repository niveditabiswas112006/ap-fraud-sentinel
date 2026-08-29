'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Helper to extract numeric value & currency/prefix from raw value string
function parseNumericValue(val: string | number) {
  if (typeof val === 'number') return { num: val, prefix: '', suffix: '', isMoney: false };
  const str = String(val).trim();
  const isMoney = str.startsWith('$');
  const numStr = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(numStr) || 0;
  return { num, prefix: isMoney ? '$' : '', suffix: '', isMoney };
}

function AnimatedNumber({ value }: { value: string | number }) {
  const { num, prefix, isMoney } = parseNumericValue(value);
  const [displayNum, setDisplayNum] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1000; // 1.0s smooth count-up

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayNum(Math.floor(easedProgress * num));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayNum(num);
      }
    };

    window.requestAnimationFrame(step);
  }, [num]);

  if (isNaN(num)) return <span>{value}</span>;

  const formatted = displayNum.toLocaleString('en-US');

  return (
    <motion.span
      key={num}
      initial={{ opacity: 0.8 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {prefix}
      {formatted}
    </motion.span>
  );
}

export function StatCallout({
  label,
  value,
  accent = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  accent?: 'default' | 'red' | 'emerald' | 'steel' | 'amber';
  hint?: string;
  icon?: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    default: 'text-slate-900',
    red: 'text-red-600',
    emerald: 'text-[#0f766e]',
    steel: 'text-[#00668c]',
    amber: 'text-amber-600',
  };

  const borderMap: Record<string, string> = {
    default: 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-lg',
    red: 'border-red-200 bg-white hover:border-red-300 hover:shadow-red-500/10 hover:shadow-lg',
    emerald: 'border-emerald-200 bg-white hover:border-emerald-300 hover:shadow-emerald-500/10 hover:shadow-lg',
    steel: 'border-sky-200 bg-white hover:border-sky-300 hover:shadow-sky-500/10 hover:shadow-lg',
    amber: 'border-amber-200 bg-white hover:border-amber-300 hover:shadow-amber-500/10 hover:shadow-lg',
  };

  const iconBgMap: Record<string, string> = {
    default: 'bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white',
    red: 'bg-red-50 text-red-600 border border-red-100 group-hover:bg-red-600 group-hover:text-white',
    emerald: 'bg-teal-50 text-[#0f766e] border border-teal-100 group-hover:bg-[#0f766e] group-hover:text-white',
    steel: 'bg-sky-50 text-[#00668c] border border-sky-100 group-hover:bg-[#00668c] group-hover:text-white',
    amber: 'bg-amber-50 text-amber-600 border border-amber-100 group-hover:bg-amber-600 group-hover:text-white',
  };

  const topGlowMap: Record<string, string> = {
    default: 'bg-slate-300',
    red: 'bg-red-500',
    emerald: 'bg-emerald-500',
    steel: 'bg-[#00668c]',
    amber: 'bg-amber-500',
  };

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2, ease: 'easeOut' } }}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-300',
        borderMap[accent]
      )}
    >
      {/* Top Subtle Animated Accent Bar */}
      <div className={cn('absolute top-0 left-0 right-0 h-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100', topGlowMap[accent])} />

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 transition-colors group-hover:text-slate-900">
          {label}
        </span>
        {icon && (
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110 group-hover:rotate-6', iconBgMap[accent])}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline">
        <span className={cn('font-instagram text-3xl font-extrabold tracking-tight sm:text-4xl transition-transform duration-300 group-hover:scale-105 origin-left', accentMap[accent])}>
          <AnimatedNumber value={value} />
        </span>
      </div>
    </motion.div>
  );
}

