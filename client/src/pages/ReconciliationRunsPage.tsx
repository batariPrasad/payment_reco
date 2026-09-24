import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';
import type { ApiListResponse } from '../api/client';
import type { ReconciliationRun } from '../types';
import { useAuth } from '../context/AuthContext';

function inr(v: string | number) {
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function ReconciliationRunsPage() {
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useRef<Toast>(null);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiListResponse<ReconciliationRun>>('/reconcile/runs');
    setRuns(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function confirmDelete(run: ReconciliationRun) {
    confirmDialog({
      message: `Permanently delete run #${run.id} (${run.mis_filename})? This can't be undone.`,
      header: 'Delete reconciliation run',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await api.delete(`/reconcile/runs/${run.id}`);
          toast.current?.show({ severity: 'success', summary: 'Run deleted', detail: `#${run.id}`, life: 3000 });
          await load();
        } catch (err: any) {
          toast.current?.show({ severity: 'error', summary: 'Delete failed', detail: err?.response?.data?.error || 'Failed to delete run.', life: 4000 });
        }
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Toast ref={toast} />
      <ConfirmDialog />

      <div>
        <h1 className="page-title">Reconciliation Runs</h1>
        <p className="page-sub">Every run of an MIS file against your shipments and rate card</p>
      </div>

      {runs.length > 0 && (
        <div className="tiles">
          <div className="tile tile-1">
            <div className="tile-label">Total runs</div>
            <div className="tile-value">{runs.length}</div>
            <div className="tile-note">all time</div>
          </div>
          <div className="tile tile-2">
            <div className="tile-label">Kwikship owes you</div>
            <div className="tile-value">{inr(runs[0].overcharged_amount)}</div>
            <div className="tile-note">latest run #{runs[0].id}</div>
          </div>
          <div className="tile tile-3">
            <div className="tile-label">You may owe</div>
            <div className="tile-value">{inr(runs[0].undercharged_amount)}</div>
            <div className="tile-note">undercharged, latest run</div>
          </div>
          <div className="tile tile-4">
            <div className="tile-label">Lost / claim back</div>
            <div className="tile-value">
              {runs[0].lost_count} · {inr(runs[0].total_claimable)}
            </div>
            <div className="tile-note">stuck RTO, latest run</div>
          </div>
        </div>
      )}

      <DataTable
        value={runs}
        loading={loading}
        responsiveLayout="stack"
        breakpoint="960px"
        stripedRows
        emptyMessage='No reconciliation runs yet. Upload an MIS file and click "Run reconciliation".'
        className="card overflow-hidden"
        onRowClick={(e) => navigate(`/reconciliation/${(e.data as ReconciliationRun).id}`)}
        rowClassName={() => 'cursor-pointer'}
      >
        <Column header="Run" body={(r: ReconciliationRun) => <b>#{r.id}</b>} />
        <Column field="mis_filename" header="MIS file" />
        <Column header="Total rows" body={(r: ReconciliationRun) => r.total_rows.toLocaleString('en-IN')} />
        <Column header="Matched" body={(r: ReconciliationRun) => <span className="tag tag-g">{r.matched_count.toLocaleString('en-IN')}</span>} />
        <Column header="Mismatched" body={(r: ReconciliationRun) => <span className={`tag ${r.mismatch_count > 0 ? 'tag-r' : 'tag-g'}`}>{r.mismatch_count.toLocaleString('en-IN')}</span>} />
        <Column header="No API data" body={(r: ReconciliationRun) => <span className={`tag ${r.no_api_data_count > 0 ? 'tag-y' : 'tag-g'}`}>{r.no_api_data_count}</span>} />
        <Column header="Total discrepancy" body={(r: ReconciliationRun) => <b>{inr(r.total_discrepancy)}</b>} />
        <Column
          header="Kwikship owes you"
          body={(r: ReconciliationRun) => <b style={{ color: Number(r.overcharged_amount) > 0 ? 'var(--g-t)' : undefined }}>{inr(r.overcharged_amount)}</b>}
        />
        <Column
          header="You may owe"
          body={(r: ReconciliationRun) => <b style={{ color: Number(r.undercharged_amount) > 0 ? 'var(--y-t)' : undefined }}>{inr(r.undercharged_amount)}</b>}
        />
        <Column
          header="Lost / claim back"
          body={(r: ReconciliationRun) => (
            <span className={`tag ${r.lost_count > 0 ? 'tag-p' : 'tag-y'}`}>
              {r.lost_count} · {inr(r.total_claimable)}
            </span>
          )}
        />
        <Column header="Run at" body={(r: ReconciliationRun) => new Date(r.run_at).toLocaleString()} />
        {user?.role === 'admin' && (
          <Column
            header="Actions"
            body={(r: ReconciliationRun) => (
              <button
                className="ic-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(r);
                }}
                aria-label="Delete run"
                title="Delete run"
              >
                <i className="pi pi-trash" />
              </button>
            )}
          />
        )}
      </DataTable>
    </div>
  );
}
