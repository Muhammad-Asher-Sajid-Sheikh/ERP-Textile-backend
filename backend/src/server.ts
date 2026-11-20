import app from './app.js';
import { prisma } from './lib/prisma.js';
import { cleanupExpiredTokens } from './services/token.service.js';

await prisma.$connect();
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`TextileERP Backend listening on port ${port}`));
server.on('error', () => { console.error('Server failed to listen'); void prisma.$disconnect().finally(() => process.exit(1)); });
let cleanup: NodeJS.Timeout | undefined;
if (process.env.ENABLE_TOKEN_CLEANUP !== 'false') {
  const interval = Number(process.env.TOKEN_CLEANUP_INTERVAL_MS || 3600000);
  if (!Number.isSafeInteger(interval) || interval < 1000) throw new Error('TOKEN_CLEANUP_INTERVAL_MS must be an integer >= 1000');
  cleanup = setInterval(() => { void cleanupExpiredTokens().catch(() => console.error({ event: 'token_cleanup_failed' })); }, interval);
  cleanup.unref();
}
function shutdown() {
  if (cleanup) clearInterval(cleanup);
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  server.close(() => { void prisma.$disconnect().finally(() => { clearTimeout(timeout); process.exit(0); }); });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
