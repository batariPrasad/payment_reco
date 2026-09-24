import nodemailer from 'nodemailer';
import { env } from '../config/env';

function transporter() {
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
}

export async function sendOtpEmail(toEmail: string, otp: string): Promise<void> {
  if (!env.smtpUser || !env.smtpPass) {
    // SMTP not configured yet — fall back to logging so the login flow is testable
    // before real credentials are added to .env. Never do this in production.
    console.warn(`[DEV FALLBACK] SMTP not configured — OTP for ${toEmail}: ${otp}`);
    return;
  }

  await transporter().sendMail({
    from: env.smtpFrom,
    to: toEmail,
    subject: 'Your Payment Reco login code',
    text: `Your login code is ${otp}. It expires in 5 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Your login code is <strong style="font-size:20px">${otp}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, ignore this email.</p>`,
  });
}
