'use client';

import { useEffect, useMemo, useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { CopilotSheet } from '@/components/CopilotSheet';
import RightSidebar from '@/components/RightSidebar';

export default function AppShell({ calendar }: { calendar: React.ReactNode }) {
  const [railOpen, setRailOpen] = useState(true);        // xl+ rail
  const [sheetOpen, setSheetOpen] = useState(false);     // lg- sheet
  // Simple placeholder data; replace with live data sources
  const [emails, setEmails] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])

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

  const onEventsAction = async (ids: string[], action: 'accept'|'reject'|'snooze'|'delete') => {
    try {
      if (action === 'accept') {
        await fetch('/api/events/confirm', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventDraftIds: ids, syncToGoogle: true }) });
      } else if (action === 'reject') {
        // Mark as declined instead of deleting
        await fetch('/api/events/confirm', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventDraftIds: ids, action: 'reject' }) });
      } else if (action === 'delete') {
        // Delete confirmed events - need to determine if these are drafts or confirmed events
        // For now, assume they are confirmed events and call the delete endpoint
        await fetch('/api/events/confirm', {
          method:'DELETE',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ eventIds: ids })
        });
      } else {
        await fetch('/api/events/review', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids, action:'snooze' }) });
      }
    } catch {}
  };

  // Auto-collapse rail when viewport < 1280
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1280) setRailOpen(false);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      {/* Overlay sheet for smaller screens */}
      <CopilotSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Resizable layout for xl+ */}
      <div className="hidden xl:block h-full">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel defaultSize={railOpen ? 72 : 100} minSize={58}>
            <div className="h-full px-3">
              {calendar}
            </div>
          </Panel>

          {railOpen && (
            <>
              <PanelResizeHandle className="w-[1px] bg-neutral-200 hover:bg-neutral-300" />
              <Panel defaultSize={28} minSize={22} maxSize={36}>
                <RightSidebar emails={emails as any} events={events as any} onEmailsUpdate={onEmailsUpdate as any} onEventsAction={onEventsAction as any} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Regular non-resizable layout for <xl */}
      <div className="xl:hidden h-full">
        <div className="h-full px-2">{calendar}</div>
      </div>

      {/* Floating buttons */}
      <div className="fixed bottom-6 right-6 flex gap-2">
        <button
          onClick={() => setSheetOpen(true)}
          className="xl:hidden rounded-full px-4 py-2 shadow-md bg-black text-white"
        >
          Copilot
        </button>
        {!railOpen && (
          <button
            onClick={() => setRailOpen(true)}
            className="hidden xl:flex rounded-full px-4 py-2 shadow-md bg-black text-white"
          >
            Open Copilot
          </button>
        )}
      </div>
    </>
  );
}
