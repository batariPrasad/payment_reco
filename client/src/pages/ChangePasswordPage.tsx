import { useState } from 'react';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { api } from '../api/client';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('New password and confirmation do not match.');

    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess('Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title">Change Password</h1>
      <div className="flex max-w-sm flex-col gap-4 card p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text)]">Current password</label>
          <Password
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            toggleMask
            feedback={false}
            inputClassName="w-full"
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text)]">New password</label>
          <Password
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            toggleMask
            placeholder="Min 8 characters"
            inputClassName="w-full"
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text)]">Confirm new password</label>
          <Password
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            toggleMask
            feedback={false}
            inputClassName="w-full"
            className="w-full"
          />
        </div>
        <Button
          label={busy ? 'Changing…' : 'Change password'}
          disabled={!currentPassword || !newPassword || !confirmPassword || busy}
          loading={busy}
          onClick={handleSubmit}
        />
        {error && <Message severity="error" text={error} className="w-full justify-start" />}
        {success && <Message severity="success" text={success} className="w-full justify-start" />}
      </div>
    </div>
  );
}
