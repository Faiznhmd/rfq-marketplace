import { migrate } from '../server/database.js';
import { openTestDatabase } from './database.js';
import { createApp } from '../server/app.js';

// Each run gets an isolated, real PostgreSQL database on disk, never the user's DATABASE_URL.
const db = await openTestDatabase(`.data/browser-${process.pid}`);
await migrate(db);
const app = createApp(db, { appOrigin: 'http://127.0.0.1:4173', serveClient: true });
const server = app.listen(4173, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
