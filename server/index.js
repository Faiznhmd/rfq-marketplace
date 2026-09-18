import 'dotenv/config';
import { openDatabase } from './database.js';
import { createApp } from './app.js';

const production = process.env.NODE_ENV === 'production';
const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';
if (production && !appOrigin.startsWith('https://'))
  throw new Error('Production APP_ORIGIN must be the public HTTPS origin.');
const db = await openDatabase(process.env.DATABASE_URL);
const app = createApp(db, {
  production,
  appOrigin,
  serveClient: true,
  trustProxy: process.env.TRUST_PROXY === '1',
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
