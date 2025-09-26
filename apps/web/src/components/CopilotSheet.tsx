'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import RightSidebar from '@/components/RightSidebar';
import { useMemo } from 'react';

export function CopilotSheet({
  open, onOpenChange
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const emails = useMemo(() => ([] as any[]), []);
  const events = useMemo(() => ([] as any[]), []);

  const onEmailsUpdate = async (ids: string[], change: { included?: boolean; scope?: 'subject'|'summary' }) => {
    try {
      if (change.scope) {
        await fetch('/api/context/email', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids, action:'digest', level: change.scope }) });
      }
      if (typeof change.included === 'boolean') {
        await fetch('/api/context/email', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids, action: change.included ? 'include' : 'exclude' }) });
      }
    } catch {}
  };

  const onEventsAction = async (ids: string[], action: 'accept'|'reject'|'snooze') => {
    try {
      if (action === 'accept') {
        await fetch('/api/events/confirm', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventDraftIds: ids, syncToGoogle: true }) });
      } else if (action === 'reject') {
        await fetch('/api/events/confirm', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventDraftIds: ids, action: 'delete' }) });
      } else {
        await fetch('/api/events/review', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids, action:'snooze' }) });
      }
    } catch {}
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] sm:w-[480px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Copilot</SheetTitle>
        </SheetHeader>
        <RightSidebar emails={emails as any} events={events as any} onEmailsUpdate={onEmailsUpdate as any} onEventsAction={onEventsAction as any} />
      </SheetContent>
    </Sheet>
  );
}