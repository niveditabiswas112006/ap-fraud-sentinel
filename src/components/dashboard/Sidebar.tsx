'use client';

// Sidebar — split into SidebarTrigger (mobile menu button, lives in the header)
// and SidebarNav (the desktop aside, lives in the body row). Previously both
// were rendered by a single <Sidebar/> placed inside the <header>, which made
// the tall desktop aside overflow the 56px header and overlap the main content
// — nav clicks were getting intercepted. Active item is steel-blue.

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, ShieldAlert, Upload, Building2, History, Menu, ShieldCheck, Laptop } from 'lucide-react';
import { useAppStore, type View } from '@/lib/store';
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
  { id: 'setup', label: 'Setup on PC', icon: Laptop },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
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
              'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-[#1f6c92]/15 text-[#7fb8d6]'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                active ? 'text-[#1f6c92]' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            <span>{item.label}</span>
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#1f6c92]" />}
          </button>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-1 pb-3">
      <ShieldCheck className="h-5 w-5 text-[#1f6c92]" />
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          AP Sentinel
        </span>
        <span className="text-[10px] text-muted-foreground">RocketRide · 7-stage</span>
      </div>
    </div>
  );
}

// Mobile-only trigger + Sheet drawer. Renders nothing on desktop (lg:hidden trigger).
export function SidebarTrigger() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-3">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-[#1f6c92]" />
            AP Sentinel
          </SheetTitle>
          <SheetDescription className="text-[11px]">RocketRide · 7-stage pipeline</SheetDescription>
        </SheetHeader>
        <div className="mt-3">
          <NavItems onNavigate={() => setMobileOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Desktop aside — belongs in the body row (NOT the header).
export function SidebarNav() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-border/60 bg-card/40 p-3 lg:block">
      <Brand />
      <NavItems />
    </aside>
  );
}

// Back-compat: <Sidebar/> renders trigger (for header) + nav (for body) when
// you actually want both in one place. Prefer <SidebarTrigger/> + <SidebarNav/>.
export function Sidebar() {
  return (
    <>
      <SidebarTrigger />
    </>
  );
}
