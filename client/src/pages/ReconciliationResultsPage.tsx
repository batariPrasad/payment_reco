import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Paginator } from 'primereact/paginator';
import { api } from '../api/client';
import type { ApiListResponse, ApiSingleResponse } from '../api/client';
import { MATCH_STATUS_LABELS } from '../types';
import type { ReconciliationBreakdownItem, ReconciliationResult, ReconciliationRun } from '../types';

interface LostBreakdownItem {
  status_api: string | null;
  count: number;
  claim_sum: number;
}

interface SummaryResponse {
  run: ReconciliationRun;
  breakdown: ReconciliationBreakdownItem[];
  lostBreakdown: LostBreakdownItem[];
}

// PrimeReact's Dropdown shows nothing for an empty-string value, so "no filter" uses this sentinel.
const ALL = 'ALL';
const MATCH_STATUS_OPTIONS = [{ label: 'All statuses', value: ALL }, ...Object.entries(MATCH_STATUS_LABELS).map(([value, label]) => ({ label, value }))];
const ZONE_OPTIONS = [{ label: 'All zones', value: ALL }, ...['A', 'B', 'C', 'D', 'E'].map((z) => ({ label: `Zone ${z}`, value: z }))];
const MODE_OPTIONS = [{ label: 'All modes', value: ALL }, ...['SURFACE', 'AIR', 'NDD'].map((m) => ({ label: m, value: m }))];

const STATUS_TAG: Record<string, string> = {
  MATCHED: 'tag-g',
  FREIGHT_MISMATCH: 'tag-r',
  PAYMENT_MISMATCH: 'tag-r',
  STATUS_MISMATCH: 'tag-y',
  ZONE_MISMATCH: 'tag-b',
  WEIGHT_MISMATCH: 'tag-y',
  NO_API_DATA: 'tag-y',
  RATE_NOT_FOUND: 'tag-y',
  ZONE_NOT_FOUND: 'tag-y',
  LOST: 'tag-p',
};

const STATUS_COLOR: Record<string, string> = {
  'tag-g': '#0e8a78',
  'tag-r': '#d33a2c',
  'tag-y': '#c76a06',
  'tag-b': '#2f6fd0',
  'tag-p': '#8a3fd0',
};

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function StatCard({ label, value, tile, onClick, active }: { label: string; value: string; tile: 1 | 2 | 3 | 4; onClick?: () => void; active?: boolean }) {
  return (
    <div
      className={`tile tile-${tile} ${onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}
      style={active ? { outline: '3px solid var(--accent)', outlineOffset: '2px' } : undefined}
      onClick={onClick}
    >
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {onClick && <div className="tile-note">Click to filter the table</div>}
    </div>
  );
}

export default function ReconciliationResultsPage() {
  const { runId } = useParams<{ runId: string }>();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const zone = params.get('zone') ?? '';
  const mode = params.get('mode') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(q);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const perPage = 50;

  function setFilter(patch: Record<string, string>, scroll = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== ALL) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
    if (scroll) setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  useEffect(() => {
    api.get<ApiSingleResponse<SummaryResponse>>(`/reconcile/runs/${runId}/summary`).then((res) => setSummary(res.data.data));
  }, [runId]);

  useEffect(() => {
    setLoading(true);
    const query: Record<string, string> = { page: String(page), per_page: String(perPage) };
    if (status) query.match_status = status;
    if (zone) query.zone = zone;
    if (mode) query.mode = mode;
    if (q) query.search = q;
    api
      .get<ApiListResponse<ReconciliationResult>>(`/reconcile/runs/${runId}/results`, { params: query })
      .then((res) => {
        setResults(res.data.data);
        setTotalRecords(res.data.meta?.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [runId, page, status, zone, mode, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== q) setFilter({ q: searchInput });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  if (!summary) return <div className="text-[var(--muted)]">Loading…</div>;

  const { run, breakdown, lostBreakdown } = summary;
  const sorted = [...breakdown].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...sorted.map((b) => b.count));
  const hasFilter = !!(status || zone || mode || q);

  function exportCsv() {
    const query = new URLSearchParams();
    if (status) query.set('match_status', status);
    if (zone) query.set('zone', zone);
    if (mode) query.set('mode', mode);
    if (q) query.set('search', q);
    window.open(`${api.defaults.baseURL}/reconcile/runs/${runId}/export?${query.toString()}`, '_blank');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Reconciliation Run #{run.id}</h1>
          <p className="page-sub">{run.mis_filename}</p>
        </div>
        <Button label="Export CSV" icon="pi pi-download" severity="secondary" outlined onClick={exportCsv} />
      </div>

      <div className="tiles">
        <StatCard label="Total rows" value={run.total_rows.toLocaleString('en-IN')} tile={1} onClick={() => setFilter({ status: ALL, zone: ALL, mode: ALL, q: '' }, true)} active={!hasFilter} />
        <StatCard label="Matched" value={run.matched_count.toLocaleString('en-IN')} tile={2} onClick={() => setFilter({ status: 'MATCHED' }, true)} active={status === 'MATCHED'} />
        <StatCard label="Mismatched" value={run.mismatch_count.toLocaleString('en-IN')} tile={1} />
        <StatCard label="Total discrepancy" value={inr(run.total_discrepancy)} tile={3} />
        <StatCard label="Overcharged — Kwikship owes you" value={`${run.overcharged_count} · ${inr(run.overcharged_amount)}`} tile={2} />
        <StatCard label="Undercharged — you may owe Kwikship" value={`${run.undercharged_count} · ${inr(run.undercharged_amount)}`} tile={3} />
        <StatCard label="Lost / stuck RTO — claim back" value={`${run.lost_count} · ${inr(run.total_claimable)}`} tile={4} onClick={() => setFilter({ status: 'LOST' }, true)} active={status === 'LOST'} />
      </div>

      <div className="card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <b style={{ color: 'var(--text)' }}>Results by category</b>
          <span className="page-sub">Click a row to filter the table below</span>
        </div>
        <div className="mt-3 flex flex-col">
          {sorted.map((b) => {
            const tag = STATUS_TAG[b.match_status] ?? 'tag-y';
            const on = status === b.match_status;
            return (
              <div
                key={b.match_status}
                className={`bar-row ${on ? 'on' : ''}`}
                onClick={() => setFilter({ status: on ? ALL : b.match_status }, true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setFilter({ status: on ? ALL : b.match_status }, true)}
              >
                <span className="w-44 shrink-0 text-sm" style={{ color: 'var(--text)' }}>
                  {MATCH_STATUS_LABELS[b.match_status] ?? b.match_status}
                </span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max(2, (b.count / maxCount) * 100)}%`, background: STATUS_COLOR[tag] }} />
                </div>
                <b className="w-16 shrink-0 text-right text-sm" style={{ color: 'var(--text)' }}>
                  {b.count.toLocaleString('en-IN')}
                </b>
              </div>
            );
          })}
        </div>
      </div>

      {status === 'LOST' && lostBreakdown.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <strong className="text-sm text-[var(--text)]">What's actually in "Lost / stuck RTO":</strong>
          <div className="flex flex-wrap gap-2">
            {lostBreakdown.map((b) => (
              <span key={b.status_api ?? 'unknown'} className="tag tag-p">
                {b.status_api ?? 'unknown'} · {b.count} · {inr(b.claim_sum)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div ref={tableRef} className="card flex flex-wrap items-center gap-3 p-3" style={{ scrollMarginTop: '1rem' }}>
        <Dropdown value={status || ALL} options={MATCH_STATUS_OPTIONS} onChange={(e) => setFilter({ status: e.value })} className="w-56" />
        <Dropdown value={zone || ALL} options={ZONE_OPTIONS} onChange={(e) => setFilter({ zone: e.value })} className="w-36" />
        <Dropdown value={mode || ALL} options={MODE_OPTIONS} onChange={(e) => setFilter({ mode: e.value })} className="w-36" />
        <InputText placeholder="Search AWB…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="w-48" />
        {hasFilter && (
          <button
            className="chip on"
            onClick={() => {
              setSearchInput('');
              setFilter({ status: ALL, zone: ALL, mode: ALL, q: '' });
            }}
          >
            {status ? `${MATCH_STATUS_LABELS[status] ?? status} ` : ''}
            {zone ? `· Zone ${zone} ` : ''}
            {mode ? `· ${mode} ` : ''}
            {q ? `· "${q}" ` : ''}✕ Clear
          </button>
        )}
        <span className="page-sub ml-auto">{totalRecords.toLocaleString('en-IN')} result{totalRecords === 1 ? '' : 's'}</span>
      </div>

      <div className="card overflow-x-auto" style={{ opacity: loading ? 0.6 : 1 }}>
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="text-left">
              {['AWB', 'Match status', 'Payment (MIS / API)', 'Status (MIS / API)', 'Zone (MIS / Calc)', 'Weight (MIS / API)', 'Total freight (MIS)', 'Total freight (Calc)', 'Delta', 'Claim back'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className={`cursor-pointer border-t border-[var(--line)] hover:bg-[var(--hov)] ${r.match_status === 'LOST' ? 'bg-[var(--p-bg)]' : ''}`}
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text)]">{r.awb}</td>
                  <td className="px-3 py-2">
                    <span className={`tag ${STATUS_TAG[r.match_status] ?? 'tag-y'}`}>{MATCH_STATUS_LABELS[r.match_status] ?? r.match_status}</span>
                  </td>
                  <td className={`px-3 py-2 ${r.payment_mismatch ? 'font-semibold text-[var(--r-t)]' : 'text-[var(--text)]'}`}>
                    {r.payment_mis ?? '—'} / {r.payment_api ?? '—'}
                  </td>
                  <td className={`px-3 py-2 ${r.status_mismatch ? 'font-semibold text-[var(--r-t)]' : 'text-[var(--text)]'}`}>
                    {r.status_mis ?? '—'} / {r.status_api ?? '—'}
                  </td>
                  <td className={`px-3 py-2 ${r.zone_mismatch ? 'font-semibold text-[var(--r-t)]' : 'text-[var(--text)]'}`}>
                    {r.zone_mis ?? '—'} / {r.zone_calculated ?? '—'}
                  </td>
                  <td className={`px-3 py-2 ${r.weight_mismatch ? 'font-semibold text-[var(--r-t)]' : 'text-[var(--text)]'}`}>
                    {r.weight_mis ?? '—'} / {r.weight_api ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]">{r.total_freight_mis !== null ? `₹${r.total_freight_mis}` : '—'}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{r.match_status === 'LOST' ? 'N/A' : r.total_freight_calc !== null ? `₹${r.total_freight_calc}` : '—'}</td>
                  <td className={`px-3 py-2 ${r.freight_delta && Math.abs(Number(r.freight_delta)) > 1 ? 'font-semibold text-[var(--r-t)]' : 'text-[var(--text)]'}`}>
                    {r.match_status === 'LOST' ? 'N/A' : r.freight_delta !== null ? `₹${r.freight_delta}` : '—'}
                  </td>
                  <td className={`px-3 py-2 ${r.claim_amount ? 'font-semibold text-[var(--p-t)]' : 'text-[var(--text)]'}`}>{r.claim_amount ? `₹${r.claim_amount}` : '—'}</td>
                </tr>
                {expandedId === r.id && (
                  <tr className="border-t border-[var(--line)] bg-[var(--hov)]">
                    <td colSpan={10} className="px-4 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">Courier</strong>
                          <div className="text-sm text-[var(--text)]">
                            {r.courier_name_api ?? '—'} ({r.courier_group ?? '—'})
                          </div>
                        </div>
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">Mode used</strong>
                          <div className="text-sm text-[var(--text)]">{r.mode_used ?? '—'}</div>
                        </div>
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">Pickup → Destination (API)</strong>
                          <div className="text-sm text-[var(--text)]">
                            {r.pickup_pincode_api ?? '—'} ({r.pickup_hub ?? '—'}) → {r.destination_pincode_api ?? '—'}
                          </div>
                        </div>
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">Forward freight (MIS / Calc)</strong>
                          <div className="text-sm text-[var(--text)]">
                            ₹{r.forward_freight_mis ?? '—'} / ₹{r.forward_freight_calc ?? '—'}
                          </div>
                        </div>
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">RTO freight (MIS / Calc)</strong>
                          <div className="text-sm text-[var(--text)]">
                            ₹{r.rto_freight_mis ?? '—'} / ₹{r.rto_freight_calc ?? '—'}
                          </div>
                        </div>
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">COD charge (MIS / Calc)</strong>
                          <div className="text-sm text-[var(--text)]">
                            ₹{r.cod_charge_mis ?? '—'} / ₹{r.cod_charge_calc ?? '—'}
                          </div>
                        </div>
                        <div>
                          <strong className="block text-xs uppercase text-[var(--muted)]">Gross freight (MIS / Calc)</strong>
                          <div className="text-sm text-[var(--text)]">
                            ₹{r.gross_freight_mis ?? '—'} / ₹{r.gross_freight_calc ?? '—'}
                          </div>
                        </div>
                        {r.notes && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <strong className="block text-xs uppercase text-[var(--muted)]">Notes</strong>
                            <div className="text-sm text-[var(--text)]">{r.notes}</div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {results.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-[var(--muted)]">
                  No results match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginator
        first={(page - 1) * perPage}
        rows={perPage}
        totalRecords={totalRecords}
        onPageChange={(e) => setFilter({ page: String(e.page + 1) })}
        template="PrevPageLink PageLinks NextPageLink CurrentPageReport"
        currentPageReportTemplate={`Page ${page} of ${Math.max(1, Math.ceil(totalRecords / perPage))}`}
      />
    </div>
  );
}
