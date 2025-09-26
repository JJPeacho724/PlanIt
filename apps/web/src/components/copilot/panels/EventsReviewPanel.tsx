'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { RefreshCw } from 'lucide-react';

type EventRow = {
  id: string;
  title: string;
  when: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
};

export function EventsReviewPanel() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/context/events');
      if (response.ok) {
        const events = await response.json();
        setRows(events);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    
    // Listen for email ingestion completion
    const handleIngestionComplete = () => {
      fetchEvents();
    };
    
    window.addEventListener('emailIngestionComplete', handleIngestionComplete);
    
    return () => {
      window.removeEventListener('emailIngestionComplete', handleIngestionComplete);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const updateStatus = (ids: string[], status: EventRow['status']) =>
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, status } : r));

  async function bulk(status: 'accepted'|'rejected') {
    const ids = [...selected];
    updateStatus(ids, status);
    try {
      await fetch('/api/events/review', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids, action: status }) });
    } catch {}
  }

  async function snooze() {
    const ids = [...selected];
    try {
      await fetch('/api/events/review', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ids, action:'snooze' }) });
    } catch {}
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading events...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-neutral-600">
          Selected <Badge variant="secondary">{selected.size}</Badge>
          {rows.length > 0 && (
            <span className="ml-2 text-xs text-text-muted">• {rows.length} events</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => bulk('accepted')}>Accept</Button>
          <Button size="sm" variant="destructive" onClick={() => bulk('rejected')}>Reject</Button>
          <Button size="sm" variant="outline" onClick={snooze}>Snooze</Button>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto pr-1">
        {rows.map(r => (
          <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-neutral-50">
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium whitespace-normal break-words" title={r.title}>{r.title}</span>
                <Badge variant={r.status === 'accepted' ? 'default' : r.status === 'rejected' ? 'destructive' : 'outline'}>
                  {r.status}
                </Badge>
                <span className="ml-auto text-xs text-neutral-500">Confidence: {(r.confidence*100).toFixed(0)}%</span>
              </div>
              <div className="text-xs text-neutral-500">{r.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


