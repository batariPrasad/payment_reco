import { useEffect, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { InputSwitch } from 'primereact/inputswitch';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';
import type { ApiListResponse, ApiSingleResponse } from '../api/client';
import type { ManagedUser } from '../types';
import { useAuth } from '../context/AuthContext';

const ROLE_OPTIONS = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const { user: me } = useAuth();
  const toast = useRef<Toast>(null);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiListResponse<ManagedUser>>('/admin/users');
    setUsers(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetCreateForm() {
    setEmail('');
    setPassword('');
    setRole('user');
    setCanView(true);
    setCanEdit(false);
    setCanUpload(false);
    setError(null);
  }

  async function handleCreate() {
    if (!email || !password) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/users', { email, password, role, canView, canEdit, canUpload });
      resetCreateForm();
      setCreateOpen(false);
      toast.current?.show({ severity: 'success', summary: 'User created', detail: email, life: 3000 });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create user.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(
    id: number,
    patch: Partial<{ role: 'admin' | 'user'; canView: boolean; canEdit: boolean; canUpload: boolean; isActive: boolean }>
  ) {
    try {
      await api.patch<ApiSingleResponse<ManagedUser>>(`/admin/users/${id}`, patch);
      await load();
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Update failed', detail: err?.response?.data?.error || 'Failed to update user.', life: 4000 });
    }
  }

  async function handleResetPassword(id: number) {
    if (resetPassword.length < 8) {
      toast.current?.show({ severity: 'error', summary: 'Too short', detail: 'Reset password must be at least 8 characters.', life: 4000 });
      return;
    }
    try {
      await api.post(`/admin/users/${id}/reset-password`, { password: resetPassword });
      setResetTargetId(null);
      setResetPassword('');
      toast.current?.show({ severity: 'success', summary: 'Password reset', life: 3000 });
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Reset failed', detail: err?.response?.data?.error || 'Failed to reset password.', life: 4000 });
    }
  }

  function confirmDelete(u: ManagedUser) {
    confirmDialog({
      message: `Permanently delete ${u.email}? This can't be undone.`,
      header: 'Delete user',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await api.delete(`/admin/users/${u.id}`);
          toast.current?.show({ severity: 'success', summary: 'User deleted', detail: u.email, life: 3000 });
          await load();
        } catch (err: any) {
          toast.current?.show({ severity: 'error', summary: 'Delete failed', detail: err?.response?.data?.error || 'Failed to delete user.', life: 4000 });
        }
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-sub">
            Only admins can see this page. Nobody can self-register — create every user here.
          </p>
        </div>
        <Button
          label="Add user"
          icon="pi pi-user-plus"
          onClick={() => {
            resetCreateForm();
            setCreateOpen(true);
          }}
        />
      </div>

      <DataTable
        value={users}
        loading={loading}
        responsiveLayout="stack"
        breakpoint="960px"
        stripedRows
        emptyMessage="No users yet."
        className="card overflow-hidden"
      >
        <Column
          header="User"
          body={(u: ManagedUser) => (
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold text-white" style={{ background: 'var(--grad)' }}>
                {u.email[0].toUpperCase()}
              </div>
              <div>
                <b>{u.email}</b>
                {u.id === me?.sub && <div className="text-xs text-[var(--muted)]">You (signed in)</div>}
              </div>
            </div>
          )}
        />
        <Column
          header="Role"
          body={(u: ManagedUser) =>
            u.id === me?.sub ? (
              <span className="tag tag-p" title="You can't change your own role">
                <i className="pi pi-lock mr-1 text-[0.65rem]" />
                {u.role === 'admin' ? 'Admin' : 'User'}
              </span>
            ) : (
              <Dropdown value={u.role} options={ROLE_OPTIONS} onChange={(e) => handleUpdate(u.id, { role: e.value })} className="w-32" />
            )
          }
        />
        <Column header="View" body={(u: ManagedUser) => <InputSwitch checked={u.can_view} onChange={(e) => handleUpdate(u.id, { canView: !!e.value })} />} />
        <Column header="Edit" body={(u: ManagedUser) => <InputSwitch checked={u.can_edit} onChange={(e) => handleUpdate(u.id, { canEdit: !!e.value })} />} />
        <Column header="Upload" body={(u: ManagedUser) => <InputSwitch checked={u.can_upload} onChange={(e) => handleUpdate(u.id, { canUpload: !!e.value })} />} />
        <Column
          header="Active"
          body={(u: ManagedUser) => (
            <span title={u.id === me?.sub ? "You can't deactivate your own account" : undefined}>
              <InputSwitch checked={u.is_active} disabled={u.id === me?.sub} onChange={(e) => handleUpdate(u.id, { isActive: !!e.value })} />
            </span>
          )}
        />
        <Column header="Created" body={(u: ManagedUser) => new Date(u.created_at).toLocaleDateString()} />
        <Column
          header="Password"
          body={(u: ManagedUser) =>
            resetTargetId === u.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <Password
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password"
                  toggleMask
                  feedback={false}
                  inputClassName="w-36"
                />
                <Button icon="pi pi-check" severity="success" text onClick={() => handleResetPassword(u.id)} aria-label="Save" />
                <Button
                  icon="pi pi-times"
                  severity="secondary"
                  text
                  onClick={() => {
                    setResetTargetId(null);
                    setResetPassword('');
                  }}
                  aria-label="Cancel"
                />
              </div>
            ) : (
              <Button label="Reset" size="small" severity="secondary" outlined onClick={() => setResetTargetId(u.id)} />
            )
          }
        />
        <Column
          header="Actions"
          body={(u: ManagedUser) =>
            u.id === me?.sub ? (
              <span className="tag tag-b" title="Your own account can't be deleted">
                <i className="pi pi-lock mr-1 text-[0.65rem]" />
                You
              </span>
            ) : (
              <button className="ic-btn" onClick={() => confirmDelete(u)} aria-label="Delete user" title="Delete user">
                <i className="pi pi-trash" />
              </button>
            )
          }
        />
      </DataTable>

      <Dialog
        header="Create user"
        visible={createOpen}
        onHide={() => setCreateOpen(false)}
        style={{ width: '28rem', maxWidth: '95vw' }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text)]">Email</label>
            <InputText type="email" placeholder="email@pokonut.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text)]">Initial password</label>
            <Password
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              toggleMask
              feedback={false}
              inputClassName="w-full"
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text)]">Role</label>
            <Dropdown value={role} options={ROLE_OPTIONS} onChange={(e) => setRole(e.value)} className="w-full" />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Checkbox checked={canView} onChange={(e) => setCanView(!!e.checked)} /> View
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Checkbox checked={canEdit} onChange={(e) => setCanEdit(!!e.checked)} /> Edit (run reconciliation)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Checkbox checked={canUpload} onChange={(e) => setCanUpload(!!e.checked)} /> Upload files
            </label>
          </div>
          {error && <Message severity="error" text={error} className="w-full justify-start" />}
          <div className="flex justify-end gap-2">
            <Button label="Cancel" severity="secondary" outlined onClick={() => setCreateOpen(false)} disabled={busy} />
            <Button label={busy ? 'Creating…' : 'Create user'} loading={busy} disabled={!email || !password || busy} onClick={handleCreate} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
