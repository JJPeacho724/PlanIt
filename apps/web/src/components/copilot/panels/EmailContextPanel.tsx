'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { RefreshCw } from 'lucide-react';

type Email = {
  id: string;
  from: string;
  subject: string;
  date: string;
  included: boolean;
  digest: 'subject' | 'summary' | 'full';
};

export function EmailContextPanel() {
  const [rows, setRows] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEmails = async () => {
    try {
      const response = await fetch('/api/context/emails');
      if (response.ok) {
        const emails = await response.json();
        setRows(emails);
      }
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmails();
    
    // Listen for email ingestion completion
    const handleIngestionComplete = () => {
      fetchEmails();
    };
    
    window.addEventListener('emailIngestionComplete', handleIngestionComplete);
    
    return () => {
      window.removeEventListener('emailIngestionComplete', handleIngestionComplete);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEmails();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const bulk = (fn: (r: Email)=>Email) =>
    setRows(prev => prev.map(r => selected.has(r.id) ? fn(r) : r));

  async function applyInclude(included: boolean) {
    bulk(r => ({ ...r, included }));
    try {
      await fetch('/api/context/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action: included ? 'include' : 'exclude' })
      })
    } catch {}
  }

  async function applyDigest(level: Email['digest']) {
    bulk(r => ({ ...r, digest: level, included: true }));
    try {
      await fetch('/api/context/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action: 'digest', level })
      })
    } catch {}
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading emails...</span>
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
            <span className="ml-2 text-xs text-text-muted">• {rows.length} emails</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyInclude(true)}>Include</Button>
          <Button size="sm" variant="ghost" onClick={() => applyInclude(false)}>Exclude</Button>
          <div className="ml-2 flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => applyDigest('subject')}>Subject</Button>
            <Button size="sm" variant="outline" onClick={() => applyDigest('summary')}>Summary</Button>
            <Button size="sm" variant="outline" onClick={() => applyDigest('full')}>Full</Button>
          </div>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto pr-1">
        {rows.map(r => (
          <label key={r.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-neutral-50">
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium whitespace-normal break-words" title={r.subject}>{r.subject}</span>
                {r.included ? <Badge>Included</Badge> : <Badge variant="outline">Ignored</Badge>}
                <Badge variant="secondary" className="ml-auto">{r.digest}</Badge>
              </div>
              <div className="text-xs text-neutral-500">{r.from} • {r.date}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}


