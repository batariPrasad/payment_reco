import { useEffect, useRef, useState } from 'react';
import { FileUpload } from 'primereact/fileupload';
import type { FileUploadSelectEvent } from 'primereact/fileupload';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';
import type { ApiListResponse, ApiSingleResponse } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface ShipmentSourceSummary {
  source: string;
  count: number;
  last_updated: string;
}

export default function ShipmentUploadPage() {
  const [summary, setSummary] = useState<ShipmentSourceSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rowsInFile: number; upserted: number } | null>(null);
  const { user } = useAuth();
  const canUpload = user?.role === 'admin' || !!user?.canUpload;
  const fileUploadRef = useRef<FileUpload>(null);
  const toast = useRef<Toast>(null);

  async function load() {
    const res = await api.get<ApiListResponse<ShipmentSourceSummary>>('/shipment-upload');
    setSummary(res.data.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<ApiSingleResponse<{ rowsInFile: number; upserted: number }>>('/shipment-upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data.data);
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

  const uploadCount = summary.find((s) => s.source === 'upload')?.count ?? 0;
  const apiCount = summary.find((s) => s.source === 'api')?.count ?? 0;
  const uploadRows = [
    {
      source: 'Manual upload',
      count: uploadCount,
      lastUpdated: summary.find((s) => s.source === 'upload')?.last_updated ?? null,
    },
    {
      source: 'Kwikship API sync',
      count: apiCount,
      lastUpdated: summary.find((s) => s.source === 'api')?.last_updated ?? null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Toast ref={toast} />
      <div>
        <h1 className="page-title">Upload Shipment Data</h1>
        <p className="page-sub max-w-3xl">
          A manual alternative to "Sync from Kwikship" for when API credentials aren't set up yet. Upload a file with
          the same ground-truth fields the API would provide — reconciliation uses whichever source (API sync or this
          upload) most recently populated each AWB.
        </p>
      </div>

      <div className="flex flex-col gap-2 card p-4">
        <a
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          href={`${api.defaults.baseURL}/shipment-upload/template`}
        >
          Download template (.xlsx)
        </a>
        <span className="text-sm text-[var(--muted)]">
          Matches Kwikship's own "shipment report" export columns exactly — you can upload that export directly, no
          reshaping needed. Required: AWB, Status, Payment Mode, Pincode (destination), Weight, and either "Pickup
          Address" (pincode is auto-extracted from the end of the text) or a separate "Pickup Pincode" column. Weight
          above 20 is treated as grams and auto-converted to kg. Optional: Order Code, Shipper Name, Total Amount.
        </span>
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
          <Button label={busy ? 'Uploading…' : 'Upload'} disabled={!file || busy} loading={busy} onClick={handleUpload} />
          {error && <Message severity="error" text={error} />}
          {result && <Message severity="success" text={`Loaded ${result.upserted} of ${result.rowsInFile} rows into the shipments table.`} />}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">You don't have upload permission — ask an admin for access.</p>
      )}

      <h2 className="section-title">Current shipment data</h2>
      <DataTable value={uploadRows} responsiveLayout="stack" breakpoint="960px" stripedRows className="card overflow-hidden">
        <Column field="source" header="Source" />
        <Column field="count" header="AWBs stored" />
        <Column header="Last updated" body={(r: (typeof uploadRows)[number]) => (r.lastUpdated ? new Date(r.lastUpdated).toLocaleString() : '—')} />
      </DataTable>
    </div>
  );
}
