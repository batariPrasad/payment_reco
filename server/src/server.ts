import { app } from './app';
import { env } from './config/env';

// Safety net: an uncaught error in any async route handler shouldn't be able to take the
// whole server down for every user (this happened for real — an SMTP auth failure crashed
// the process). Every route with an external call (email, HTTP, etc.) should still have its
// own try/catch, but this stops any gap from becoming a full outage.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (server stayed up):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server stayed up):', err);
});

const server = app.listen(env.port, () => {
  console.log(`payment-reco server listening on http://localhost:${env.port}`);
});

// Large syncs (thousands of per-AWB detail calls) can take a while; give them room.
server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 15 * 60 * 1000 + 5000;
