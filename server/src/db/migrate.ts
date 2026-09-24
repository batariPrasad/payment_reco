import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    const { rows } = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
      console.log(`applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  done: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('Migrations complete.');
    await seedBootstrapAdmin(client);
  } finally {
    client.release();
    await pool.end();
  }
}

// Nobody can self-register, so the very first admin has to come from somewhere: seed it
// from ADMIN_EMAIL/ADMIN_PASSWORD. Idempotent — safe to run every time. Also backfills a
// password onto that same row if it was seeded before password_hash existed (migration 006).
async function seedBootstrapAdmin(client: import('pg').PoolClient) {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not both set — skipping bootstrap admin seed.');
    return;
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count === 0) {
    await client.query(
      `INSERT INTO users (email, role, can_view, can_edit, can_upload, is_active, password_hash)
       VALUES ($1, 'admin', true, true, true, true, $2)`,
      [adminEmail, passwordHash]
    );
    console.log(`Seeded bootstrap admin: ${adminEmail}`);
    return;
  }

  const { rowCount } = await client.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2 AND password_hash IS NULL',
    [passwordHash, adminEmail]
  );
  if (rowCount) console.log(`Backfilled password for existing admin: ${adminEmail}`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
