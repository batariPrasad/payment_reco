import { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { api } from '../api/client';
import type { ApiListResponse, ApiSingleResponse } from '../api/client';
import type { SyncRun } from '../types';
import { useAuth } from '../context/AuthContext';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const STATUS_SEVERITY: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  completed: 'success',
  failed: 'danger',
  running: 'info',
};

export default function SyncPage() {
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ listed: number; detailed: number } | null>(null);
  const { user } = useAuth();
  const canUpload = user?.role === 'admin' || !!user?.canUpload;

  async function load() {
    const res = await api.get<ApiListResponse<SyncRun>>('/sync/runs');
    setRuns(res.data.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<ApiSingleResponse<{ listed: number; detailed: number }>>('/sync', { from, to });
      setResult(res.data.data);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Sync failed. Check KWIKSHIP_APP_ID / KWIKSHIP_APP_SECRET in server/.env.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Sync from Kwikship</h1>
        <p className="page-sub max-w-3xl">
          Pulls shipment ground-truth (status, payment method, pincodes, weight) from the Kwikship API for a date range
          (max 30 days per request internally; longer ranges are auto-chunked). This can take a while for large ranges
          since it calls the shipment detail endpoint per AWB.
        </p>
      </div>

      <div className="flex flex-col gap-3 card p-4 sm:flex-row sm:items-end sm:flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text)]">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text)]">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <Button
          label={busy ? 'Syncing… this can take a few minutes' : canUpload ? 'Run sync' : 'No upload permission'}
          disabled={busy || !canUpload}
          loading={busy}
          onClick={handleSync}
        />
        {error && <Message severity="error" text={error} className="w-full justify-start" />}
        {result && (
          <Message
            severity="success"
            text={`Listed ${result.listed} shipments, synced full detail for ${result.detailed}.`}
            className="w-full justify-start"
          />
        )}
      </div>

      <h2 className="section-title">Past syncs</h2>
      <DataTable
        value={runs}
        responsiveLayout="stack"
        breakpoint="960px"
        stripedRows
        emptyMessage="No syncs yet."
        className="card overflow-hidden"
      >
        <Column header="Range" body={(r: SyncRun) => `${r.from_date} → ${r.to_date}`} />
        <Column header="Status" body={(r: SyncRun) => <Tag value={r.status} severity={STATUS_SEVERITY[r.status] ?? 'info'} />} />
        <Column field="shipments_listed" header="Listed" />
        <Column field="shipments_detailed" header="Detailed" />
        <Column header="Started" body={(r: SyncRun) => new Date(r.started_at).toLocaleString()} />
        <Column header="Error" body={(r: SyncRun) => <span className="text-[var(--muted)]">{r.error_message ?? ''}</span>} />
      </DataTable>
    </div>
  );
}
