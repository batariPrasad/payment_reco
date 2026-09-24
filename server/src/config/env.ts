import crypto from 'node:crypto';
import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Falls back to a random secret so local dev works without setup, but that means every
// server restart invalidates existing logins — set a real JWT_SECRET in .env to avoid that
// and, more importantly, before this ever runs anywhere but your own machine.
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET not set in .env — using a random one-time secret. Logins will not survive a server restart. Set JWT_SECRET in server/.env to fix this.');
}

export const env = {
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: required('DATABASE_URL'),
  // Render's *internal* database URL needs no SSL; its external URL (and most hosted
  // Postgres from outside the provider's network) does. Set DATABASE_SSL=true for those.
  databaseSsl: process.env.DATABASE_SSL === 'true',
  kwikshipBaseUrl: process.env.KWIKSHIP_BASE_URL || 'https://api.gokwik.co/kwikship',
  kwikshipAppId: process.env.KWIKSHIP_APP_ID || '',
  kwikshipAppSecret: process.env.KWIKSHIP_APP_SECRET || '',
  port: Number(process.env.PORT || 4000),

  jwtSecret,
  sessionHours: Number(process.env.SESSION_HOURS || 24),
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  // Defaults OFF: OTP requires working SMTP, which isn't set up yet. Login is password-only
  // until this is explicitly turned on (REQUIRE_OTP=true in .env) once email delivery works.
  requireOtp: process.env.REQUIRE_OTP === 'true',

  smtpHost: process.env.SMTP_HOST || 'smtp.zoho.com',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || '',
};
