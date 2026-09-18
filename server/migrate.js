import 'dotenv/config';
import { openDatabase, migrate } from './database.js';

const db = await openDatabase(process.env.DATABASE_URL);
try {
  await migrate(db);
  console.log('Database schema is ready.');
} finally {
  await db.close();
}
