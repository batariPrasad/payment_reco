-- Two-factor login: email + password first, then OTP. Every user (including the bootstrap
-- admin) needs a password now.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
