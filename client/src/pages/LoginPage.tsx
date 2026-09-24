import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { api } from '../api/client';
import type { ApiSingleResponse } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const FEATURES = ['Freight, zone and weight checks on every AWB', 'Lost and stuck shipment claim tracking', 'Overcharge recovery from your rate card'];

export default function LoginPage() {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  async function handleLogin() {
    if (!email || !password) {
      toast.warn('Missing details', 'Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.post<ApiSingleResponse<{ loggedIn?: boolean; otpRequired?: boolean; message?: string }>>('/auth/login', {
        email,
        password,
      });
      if (res.data.data.loggedIn) {
        await refresh();
        toast.success('Login successful', 'Welcome back to Payment Reco.');
        navigate('/');
        return;
      }
      setInfo(res.data.data.message ?? null);
      setStep('otp');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Login failed.';
      setError(msg);
      toast.error('Login failed', msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp) {
      toast.warn('Missing code', 'Enter the verification code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/verify-otp', { email, otp });
      await refresh();
      toast.success('Login successful', 'Welcome back to Payment Reco.');
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Incorrect code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <div
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-14 text-white lg:flex"
        style={{ background: 'linear-gradient(135deg,#4a230e 0%,#8a3a12 55%,#ff7a3d 130%)' }}
      >
        <div className="pointer-events-none absolute -right-28 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-20 h-64 w-64 rounded-full bg-white/10" />

        <div className="relative z-10">
          <img src="/logo-white.png" alt="Pokonut" className="h-28 w-auto" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-extrabold leading-tight">Catch every freight overcharge before it costs you.</h1>
          <p className="mt-3 text-sm opacity-85">Match Kwikship bills against your shipments and rate card, automatically.</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 rounded-xl bg-white/15 px-4 py-2.5 text-sm">
                <i className="pi pi-check-circle" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-xs tracking-[0.4em] opacity-80">SCIENCE BACKED AYURVEDA</div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <img src="/logo-brown.png" alt="Pokonut" className="mx-auto mb-4 h-16 w-auto dark:hidden lg:hidden" />
            <img src="/logo-white.png" alt="Pokonut" className="mx-auto mb-4 hidden h-16 w-auto dark:block dark:lg:hidden" />
            <h2 className="font-serif text-4xl font-bold" style={{ color: 'var(--text)' }}>
              {step === 'credentials' ? 'Welcome back' : 'Verify it’s you'}
            </h2>
            <p className="mt-2 text-base" style={{ color: 'var(--muted)' }}>
              {step === 'credentials' ? 'Sign in to access Payment Reco.' : 'Enter the code sent to your email.'}
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {step === 'credentials' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    Email Address
                  </label>
                  <InputText
                    id="email"
                    type="email"
                    placeholder="you@pokonut.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    autoFocus
                    className="w-full !py-3"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    Password
                  </label>
                  <Password
                    inputId="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    toggleMask
                    feedback={false}
                    inputClassName="w-full !py-3"
                    className="w-full"
                  />
                </div>
                <Button
                  label={busy ? 'Checking…' : 'Sign In'}
                  disabled={busy}
                  loading={busy}
                  onClick={handleLogin}
                  className="mt-2 w-full justify-center !py-3 !text-base"
                />
              </>
            )}

            {step === 'otp' && (
              <>
                {info && <Message severity="success" text={info} className="w-full justify-start" />}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="otp" className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    Verification code
                  </label>
                  <InputText
                    id="otp"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                    autoFocus
                    className="w-full !py-3"
                  />
                </div>
                <Button
                  label={busy ? 'Verifying…' : 'Verify & sign in'}
                  disabled={busy}
                  loading={busy}
                  onClick={handleVerifyOtp}
                  className="w-full justify-center !py-3 !text-base"
                />
                <Button label="Back" severity="secondary" text disabled={busy} onClick={() => setStep('credentials')} className="w-full justify-center" />
              </>
            )}

            {error && <Message severity="error" text={error} className="w-full justify-start" />}

            <p className="mt-4 text-center text-xs" style={{ color: 'var(--muted)' }}>
              POKONUT Payment Reco © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
