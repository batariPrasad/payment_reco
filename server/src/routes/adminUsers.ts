import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../config/db';
import { authMiddleware, requireAdmin } from '../middleware/auth';

export const adminUsersRouter = Router();
adminUsersRouter.use(authMiddleware, requireAdmin);

adminUsersRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, role, can_view, can_edit, can_upload, is_active, created_at FROM users ORDER BY created_at DESC'
  );
  res.json({ success: true, data: rows });
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'user']).default('user'),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canUpload: z.boolean().default(false),
});

adminUsersRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? parsed.error.message });
  const { email, password, role, canView, canEdit, canUpload } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, role, can_view, can_edit, can_upload, created_by, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, email, role, can_view, can_edit, can_upload, is_active, created_at`,
      [email.toLowerCase().trim(), role, canView, canEdit, canUpload, req.user!.sub, passwordHash]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'A user with that email already exists.' });
    throw err;
  }
});

const resetPasswordSchema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') });

adminUsersRouter.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? parsed.error.message });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, data: { message: 'Password reset.' } });
});

const updateSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canUpload: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

adminUsersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });
  const f = parsed.data;

  if (id === req.user!.sub && (f.role === 'user' || f.isActive === false)) {
    return res.status(400).json({ success: false, error: "You can't demote or deactivate your own account." });
  }

  const { rows } = await pool.query(
    `UPDATE users SET
       role = COALESCE($1, role),
       can_view = COALESCE($2, can_view),
       can_edit = COALESCE($3, can_edit),
       can_upload = COALESCE($4, can_upload),
       is_active = COALESCE($5, is_active)
     WHERE id = $6
     RETURNING id, email, role, can_view, can_edit, can_upload, is_active, created_at`,
    [f.role ?? null, f.canView ?? null, f.canEdit ?? null, f.canUpload ?? null, f.isActive ?? null, id]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, data: rows[0] });
});

adminUsersRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.sub) {
    return res.status(400).json({ success: false, error: "You can't delete your own account." });
  }

  const { rows: target } = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
  if (target.length === 0) return res.status(404).json({ success: false, error: 'User not found.' });

  if (target[0].role === 'admin') {
    const { rows: adminCount } = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");
    if (adminCount[0].count <= 1) {
      return res.status(400).json({ success: false, error: "You can't delete the last remaining admin." });
    }
  }

  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  res.json({ success: true, data: { message: 'User deleted.' } });
});
