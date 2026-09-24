import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../config/db';
import { createOtp, verifyOtp } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';
import { authMiddleware, clearSessionCookie, setSessionCookie, signSessionToken } from '../middleware/auth';
import { UserRole } from '../types';
import { env } from '../config/env';
import type { Response } from 'express';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

interface UserDbRow {
  id: number;
  email: string;
  role: UserRole;
  can_view: boolean;
  can_edit: boolean;
  can_upload: boolean;
  is_active: boolean;
  password_hash: string | null;
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function issueSession(res: Response, user: UserDbRow) {
  const token = signSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    canView: user.can_view,
    canEdit: user.can_edit,
    canUpload: user.can_upload,
  });
  setSessionCookie(res, token);
  return { email: user.email, role: user.role, canView: user.can_view, canEdit: user.can_edit, canUpload: user.can_upload };
}

// Step 1: email + password. If REQUIRE_OTP is on, this sends an OTP and stops short of a
// session — verify-otp has to succeed too. If REQUIRE_OTP is off (default, until SMTP is set
// up), password alone logs you in immediately — same endpoint either way, response shape says
// which happened (`otpRequired` vs `loggedIn`) so the frontend knows whether to show step 2.
authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Email and password required.' });
  const email = parsed.data.email.toLowerCase().trim();

  const { rows } = await pool.query<UserDbRow>('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !user.is_active || !user.password_hash) {
    return res.status(400).json({ success: false, error: GENERIC_LOGIN_ERROR });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!passwordOk) return res.status(400).json({ success: false, error: GENERIC_LOGIN_ERROR });

  if (!env.requireOtp) {
    const sessionUser = issueSession(res, user);
    return res.json({ success: true, data: { loggedIn: true, ...sessionUser } });
  }

  const result = await createOtp(user.id);
  if (!result.ok) return res.status(429).json({ success: false, error: result.error });

  try {
    await sendOtpEmail(user.email, result.otp!);
  } catch (err) {
    console.error('Failed to send OTP email:', err);
    return res.status(502).json({ success: false, error: 'Could not send the verification email. Check the server SMTP configuration.' });
  }
  res.json({ success: true, data: { otpRequired: true, message: 'Password correct. A verification code has been sent to your email.' } });
});

const verifySchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(10) });

// Step 2: the OTP. Only after this succeeds does a session actually get issued.
authRouter.post('/verify-otp', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Email and code required.' });
  const email = parsed.data.email.toLowerCase().trim();

  const { rows } = await pool.query<UserDbRow>('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !user.is_active) return res.status(400).json({ success: false, error: 'Incorrect code.' });

  const result = await verifyOtp(user.id, parsed.data.otp.trim());
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });

  const sessionUser = issueSession(res, user);
  res.json({ success: true, data: sessionUser });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true, data: { message: 'Logged out.' } });
});

authRouter.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

authRouter.post('/change-password', authMiddleware, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });

  const { rows } = await pool.query<UserDbRow>('SELECT * FROM users WHERE id = $1', [req.user!.sub]);
  const user = rows[0];
  if (!user?.password_hash) return res.status(400).json({ success: false, error: 'No password set on this account — ask an admin to set one.' });

  const currentOk = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
  if (!currentOk) return res.status(400).json({ success: false, error: 'Current password is incorrect.' });

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
  res.json({ success: true, data: { message: 'Password changed.' } });
});
