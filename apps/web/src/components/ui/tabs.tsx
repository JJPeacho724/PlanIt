'use client';

import { createContext, useContext, useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
  id: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({ defaultValue, value: controlled, onValueChange, className, children }: { defaultValue?: string; value?: string; onValueChange?: (v: string)=>void; className?: string; children: React.ReactNode }) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue || '');
  const isControlled = controlled !== undefined;
  const val = isControlled ? controlled! : uncontrolled;
  const setValue = (v: string) => {
    if (!isControlled) setUncontrolled(v);
    onValueChange?.(v);
  };
  const id = useId();
  const ctx = useMemo(() => ({ value: val, setValue, id }), [val]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn(className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('sticky top-0 z-10 bg-white/70 dark:bg-black/30 backdrop-blur border-b', className)}>
      <div className="flex items-center gap-1 p-1">{children}</div>
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext)!;
  const selected = ctx.value === value;
  return (
    <button
      role="tab"
      aria-selected={selected}
      aria-controls={`${ctx.id}-${value}`}
      onClick={() => ctx.setValue(value)}
      className={cn('flex-1 text-sm rounded-md px-3 py-1.5', selected ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800')}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext)!;
  if (ctx.value !== value) return null;
  return (
    <div id={`${ctx.id}-${value}`} role="tabpanel" className={cn(className)}>
      {children}
    </div>
  );
}


