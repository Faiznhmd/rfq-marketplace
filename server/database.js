import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Return DATE values without applying the server's local timezone.
pg.types.setTypeParser(1082, (value) => value);

export async function openDatabase(url) {
  if (!url) throw new Error('DATABASE_URL is required. Copy .env.example to .env first.');
  if (!/^postgres(ql)?:\/\//.test(url))
    throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 10000 });
  pool.on('error', () => console.error('An idle database connection failed.'));
  await pool.query('SELECT 1');
  return {
    query: (sql, values) => pool.query(sql, values),
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
}

export async function migrate(db) {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.exec(`BEGIN;\n${schema}\nCOMMIT;`);
}
