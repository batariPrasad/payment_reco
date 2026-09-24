import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { SessionPayload } from '../types';

export const AUTH_COOKIE_NAME = 'payment_reco_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: `${env.sessionHours}h` });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true once this runs behind HTTPS
    maxAge: env.sessionHours * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
}

/** Verifies the session cookie and attaches the user to the request. 401s if missing/invalid. */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return res.status(401).json({ success: false, error: 'Not logged in.' });

  try {
    const payload = jwt.verify(token, env.jwtSecret) as unknown as SessionPayload;
    req.user = payload;
    next();
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
  }
}

/** Admins bypass all individual permission flags. */
export function requirePermission(permission: 'canView' | 'canEdit' | 'canUpload') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not logged in.' });
    if (req.user.role === 'admin' || req.user[permission]) return next();
    return res.status(403).json({ success: false, error: 'You do not have permission to do this.' });
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not logged in.' });
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access required.' });
  next();
}
