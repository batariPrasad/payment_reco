import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from 'primereact/fileupload';
import type { FileUploadSelectEvent } from 'primereact/fileupload';
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ProgressBar } from 'primereact/progressbar';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { api } from '../api/client';
import type { ApiListResponse, ApiSingleResponse } from '../api/client';
import type { MisUpload, ReconciliationRun } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface RunSummary {
  run: ReconciliationRun;
}

export default function MisUploadPage() {
  const [uploads, setUploads] = useState<MisUpload[]>([]);
  const [runCounts, setRunCounts] = useState<Record<number, number>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconciling, setReconciling] = useState<MisUpload | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const canUpload = user?.role === 'admin' || !!user?.canUpload;
  const canEdit = user?.role === 'admin' || !!user?.canEdit;
  const fileUploadRef = useRef<FileUpload>(null);

  async function loadUploads() {
    const res = await api.get<ApiListResponse<MisUpload>>('/mis-uploads');
    const counts: Record<number, number> = {};
    try {
      const runs = await api.get<ApiListResponse<ReconciliationRun>>('/reconcile/runs');
      for (const r of runs.data.data) counts[r.mis_upload_id] = (counts[r.mis_upload_id] ?? 0) + 1;
    } catch {
      /* users without view permission just see "Not run yet" */
    }
    // set together so the table renders once with both pieces of data
    setRunCounts(counts);
    setUploads(res.data.data);
  }

  useEffect(() => {
    loadUploads();
  }, []);

  async function handleUpload() {
    if (!file) {
      toast.warn('No file chosen', 'Choose an .xlsx file first.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/mis-uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('File uploaded successfully', file.name);
      setFile(null);
      fileUploadRef.current?.clear();
      await loadUploads();
    } catch (err: any) {
      toast.error('Upload failed', err?.response?.data?.error || 'Could not upload the file.');
    } finally {
      setBusy(false);
    }
  }

  async function runReconcile(u: MisUpload) {
    setReconciling(u);
    try {
      const res = await api.post<ApiSingleResponse<{ runId: number }>>('/reconcile/run', { misUploadId: u.id });
      const runId = res.data.data.runId;
      let detail = `Run #${runId}`;
      try {
        const s = await api.get<ApiSingleResponse<RunSummary>>(`/reconcile/runs/${runId}/summary`);
        detail = `Run #${runId}: ${s.data.data.run.matched_count} matched, ${s.data.data.run.mismatch_count} mismatched`;
      } catch {
        /* summary is only for the toast text */
      }
      toast.success('Reconciliation completed successfully', detail);
      navigate(`/reconciliation/${runId}`);
    } catch (err: any) {
      toast.error('Reconciliation failed', err?.response?.data?.error || 'Something went wrong while reconciling.');
    } finally {
      setReconciling(null);
    }
  }

  function handleReconcile(u: MisUpload) {
    const existing = runCounts[u.id] ?? 0;
    if (existing === 0) {
      runReconcile(u);
      return;
    }
    confirmDialog({
      header: 'Run again?',
      icon: 'pi pi-exclamation-triangle',
      message: `${u.filename} already has ${existing} reconciliation run${existing > 1 ? 's' : ''}. Run it again anyway?`,
      acceptLabel: 'Run again',
      rejectLabel: 'Cancel',
      accept: () => runReconcile(u),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog />
      <div>
        <h1 className="page-title">MIS Upload</h1>
        <p className="page-sub">Upload the Kwikship MIS payment reference file you want to reconcile.</p>
      </div>

      {reconciling && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Reconciling {reconciling.row_count.toLocaleString('en-IN')} rows from {reconciling.filename}…
          </div>
          <ProgressBar mode="indeterminate" style={{ height: '8px' }} />
          <div className="page-sub">This can take a little while for large files. Please keep this page open.</div>
        </div>
      )}

      {canUpload ? (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <FileUpload
            ref={fileUploadRef}
            mode="basic"
            accept=".xlsx,.xls"
            chooseLabel={file ? file.name : 'Choose file'}
            auto={false}
            onSelect={(e: FileUploadSelectEvent) => setFile(e.files[0] ?? null)}
            onClear={() => setFile(null)}
          />
          <Button label={busy ? 'Uploading…' : 'Upload'} loading={busy} onClick={handleUpload} />
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">You don't have upload permission — ask an admin for access.</p>
      )}

      <h2 className="section-title">Past uploads</h2>
      <DataTable
        value={uploads}
        responsiveLayout="stack"
        breakpoint="960px"
        stripedRows
        emptyMessage="No uploads yet."
        className="card overflow-hidden"
      >
        <Column header="Filename" body={(u: MisUpload) => <b>{u.filename}</b>} />
        <Column header="Rows" body={(u: MisUpload) => u.row_count.toLocaleString('en-IN')} />
        <Column header="Uploaded" body={(u: MisUpload) => new Date(u.uploaded_at).toLocaleString()} />
        <Column
          header="Runs"
          body={(u: MisUpload) => {
            const n = runCounts[u.id] ?? 0;
            return <span className={`tag ${n > 0 ? 'tag-b' : 'tag-y'}`}>{n > 0 ? `${n} run${n > 1 ? 's' : ''}` : 'Not run yet'}</span>;
          }}
        />
        <Column
          header=""
          body={(u: MisUpload) =>
            canEdit ? (
              <Button
                label={reconciling?.id === u.id ? 'Running…' : 'Run reconciliation'}
                size="small"
                loading={reconciling?.id === u.id}
                disabled={!!reconciling}
                onClick={() => handleReconcile(u)}
              />
            ) : (
              <span className="text-sm text-[var(--muted)]">No edit permission</span>
            )
          }
        />
      </DataTable>
    </div>
  );
}
