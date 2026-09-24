import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function generateOtp(): string {
  // crypto.randomInt, not Math.random — this gates account access, needs real randomness.
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

export interface CreateOtpResult {
  ok: boolean;
  otp?: string;
  error?: string;
}

/** Generates and stores a new OTP for a user, enforcing a resend cooldown. Returns the raw
 * OTP (caller is responsible for emailing it — never logged or returned to the HTTP client). */
export async function createOtp(userId: number): Promise<CreateOtpResult> {
  const { rows: recent } = await pool.query<{ created_at: string }>(
    'SELECT created_at FROM otp_codes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (recent.length > 0) {
    const secondsSince = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (secondsSince < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, error: `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince)}s before requesting another code.` };
    }
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await pool.query('INSERT INTO otp_codes (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)', [userId, otpHash, expiresAt]);
  return { ok: true, otp };
}

export interface VerifyOtpResult {
  ok: boolean;
  error?: string;
}

export async function verifyOtp(userId: number, otp: string): Promise<VerifyOtpResult> {
  const { rows } = await pool.query<{ id: number; otp_hash: string; expires_at: string; attempts: number; used_at: string | null }>(
    'SELECT id, otp_hash, expires_at, attempts, used_at FROM otp_codes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (rows.length === 0) return { ok: false, error: 'No code requested. Request a new one.' };

  const record = rows[0];
  if (record.used_at) return { ok: false, error: 'This code has already been used. Request a new one.' };
  if (new Date(record.expires_at) < new Date()) return { ok: false, error: 'This code has expired. Request a new one.' };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Too many incorrect attempts. Request a new one.' };

  const matches = await bcrypt.compare(otp, record.otp_hash);
  if (!matches) {
    await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    return { ok: false, error: 'Incorrect code.' };
  }

  await pool.query('UPDATE otp_codes SET used_at = now() WHERE id = $1', [record.id]);
  return { ok: true };
}
