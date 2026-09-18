import 'dotenv/config';
import { openDatabase } from './database.js';
import { createApp } from './app.js';
import { resolveAuthConfig } from './origin.js';

const authConfig = resolveAuthConfig();
console.log('Authentication configuration:', {
  mode: authConfig.production ? 'production' : 'development',
  origin: authConfig.appOrigin,
});
const db = await openDatabase(process.env.DATABASE_URL);
const app = createApp(db, {
  ...authConfig,
  serveClient: true,
});
const server = app.listen(Number(process.env.PORT || 3000), () =>
  console.log(`RFQ API listening on port ${process.env.PORT || 3000}`),
);
async function shutdown() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
