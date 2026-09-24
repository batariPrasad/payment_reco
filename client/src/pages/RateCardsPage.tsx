import { useEffect, useRef, useState } from 'react';
import { FileUpload } from 'primereact/fileupload';
import type { FileUploadSelectEvent } from 'primereact/fileupload';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';
import type { ApiListResponse } from '../api/client';
import type { RateCardRow } from '../types';
import { useAuth } from '../context/AuthContext';

export default function RateCardsPage() {
  const [rows, setRows] = useState<RateCardRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const canUpload = user?.role === 'admin' || !!user?.canUpload;
  const fileUploadRef = useRef<FileUpload>(null);
  const toast = useRef<Toast>(null);

  async function load() {
    const res = await api.get<ApiListResponse<RateCardRow>>('/rate-cards');
    setRows(res.data.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/rate-cards', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFile(null);
      fileUploadRef.current?.clear();
      toast.current?.show({ severity: 'success', summary: 'Uploaded', life: 3000 });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Toast ref={toast} />
      <div>
        <h1 className="page-title">Rate Card (Schedule B)</h1>
        <p className="page-sub">
          Uploading a new file deactivates the previous rate card and activates this one for all future reconciliations.
        </p>
      </div>

      {canUpload ? (
        <div className="flex flex-col gap-3 card p-4 sm:flex-row sm:items-center">
          <FileUpload
            ref={fileUploadRef}
            mode="basic"
            accept=".xlsx,.xls"
            chooseLabel="Choose file"
            auto={false}
            onSelect={(e: FileUploadSelectEvent) => setFile(e.files[0] ?? null)}
            onClear={() => setFile(null)}
          />
          <Button label={busy ? 'Uploading…' : 'Upload / Replace'} disabled={!file || busy} loading={busy} onClick={handleUpload} />
          {error && <Message severity="error" text={error} />}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">You don't have upload permission — ask an admin for access.</p>
      )}

      <h2 className="section-title">Active rate card</h2>
      <DataTable
        value={rows}
        responsiveLayout="stack"
        breakpoint="960px"
        stripedRows
        paginator
        rows={25}
        emptyMessage="No active rate card. Upload a Schedule B file above."
        className="card overflow-hidden"
      >
        <Column field="courier_group" header="Courier group" />
        <Column header="Mode" body={(r: RateCardRow) => <span className={`tag ${r.mode === 'SURFACE' ? 'tag-b' : r.mode === 'AIR' ? 'tag-p' : 'tag-y'}`}>{r.mode}</span>} />

        <Column field="type" header="Type" />
        <Column field="zone" header="Zone" />
        <Column field="rate" header="Rate (₹)" />
        <Column header="Weight slab" body={(r: RateCardRow) => `${r.base_weight_slab} kg`} />
        <Column header="COD flat" body={(r: RateCardRow) => `₹${r.cod_flat}`} />
        <Column header="COD %" body={(r: RateCardRow) => `${(Number(r.cod_percent) * 100).toFixed(2)}%`} />
      </DataTable>
    </div>
  );
}
