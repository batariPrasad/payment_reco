import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { misUploadsRouter } from './routes/misUploads';
import { zoneReferenceRouter } from './routes/zoneReference';
import { rateCardsRouter } from './routes/rateCards';
import { syncRouter } from './routes/sync';
import { reconcileRouter } from './routes/reconcile';
import { shipmentUploadRouter } from './routes/shipmentUpload';
import { authRouter } from './routes/auth';
import { adminUsersRouter } from './routes/adminUsers';

export const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use('/api/auth', authRouter);
app.use('/api/admin/users', adminUsersRouter);

app.use('/api/mis-uploads', misUploadsRouter);
app.use('/api/zone-reference', zoneReferenceRouter);
app.use('/api/rate-cards', rateCardsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/shipment-upload', shipmentUploadRouter);
app.use('/api/reconcile', reconcileRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const isBadRequest = err?.type === 'entity.parse.failed' || err?.status === 400 || err?.statusCode === 400;
  res.status(isBadRequest ? 400 : 500).json({ success: false, error: err instanceof Error ? err.message : 'Internal error' });
});
