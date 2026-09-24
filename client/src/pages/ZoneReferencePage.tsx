import { useEffect, useRef, useState } from 'react';
import { FileUpload } from 'primereact/fileupload';
import type { FileUploadSelectEvent } from 'primereact/fileupload';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';
import type { ApiListResponse } from '../api/client';
import type { ZoneReferenceSummary } from '../types';
import { useAuth } from '../context/AuthContext';

const HUBS = [
  { code: 'bangalore', label: 'Bangalore (560076)' },
  { code: 'pinjore', label: 'Pinjore (134102)' },
];

export default function ZoneReferencePage() {
  const [summary, setSummary] = useState<ZoneReferenceSummary[]>([]);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busyHub, setBusyHub] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const canUpload = user?.role === 'admin' || !!user?.canUpload;
  const uploadRefs = useRef<Record<string, FileUpload | null>>({});
  const toast = useRef<Toast>(null);

  async function load() {
    const res = await api.get<ApiListResponse<ZoneReferenceSummary>>('/zone-reference');
    setSummary(res.data.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(hub: string) {
    const file = files[hub];
    if (!file) return;
    setBusyHub(hub);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/zone-reference/${hub}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFiles((f) => ({ ...f, [hub]: null }));
      uploadRefs.current[hub]?.clear();
      toast.current?.show({ severity: 'success', summary: 'Uploaded', life: 3000 });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed');
    } finally {
      setBusyHub(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Toast ref={toast} />
      <div>
        <h1 className="page-title">Zone Reference</h1>
        <p className="page-sub">
          Pincode-to-zone mapping for each pickup hub. Re-uploading a hub's file fully replaces its existing map.
        </p>
      </div>

      {error && <Message severity="error" text={error} className="w-full justify-start" />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {HUBS.map((hub) => {
          const existing = summary.find((s) => s.pickup_hub === hub.code);
          return (
            <div key={hub.code} className="flex flex-col gap-3 card p-4">
              <h3 className="text-base font-semibold text-[var(--text)]">{hub.label}</h3>
              {existing ? (
                <p className="text-sm text-[var(--muted)]">
                  {existing.row_count} pincodes loaded · from {existing.source_file} · {new Date(existing.uploaded_at).toLocaleString()}
                </p>
              ) : (
                <p className="text-sm text-[var(--muted)]">No zone map uploaded yet.</p>
              )}
              {canUpload ? (
                <div className="flex flex-wrap items-center gap-3">
                  <FileUpload
                    ref={(el) => {
                      uploadRefs.current[hub.code] = el;
                    }}
                    mode="basic"
                    accept=".xlsx,.xls"
                    chooseLabel="Choose file"
                    auto={false}
                    onSelect={(e: FileUploadSelectEvent) => setFiles((f) => ({ ...f, [hub.code]: e.files[0] ?? null }))}
                    onClear={() => setFiles((f) => ({ ...f, [hub.code]: null }))}
                  />
                  <Button
                    label={busyHub === hub.code ? 'Uploading…' : 'Upload / Replace'}
                    disabled={!files[hub.code] || busyHub === hub.code}
                    loading={busyHub === hub.code}
                    onClick={() => handleUpload(hub.code)}
                  />
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">No upload permission.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
