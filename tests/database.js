import { PGlite } from '@electric-sql/pglite';

// Test-only PostgreSQL engine. Tests never connect to the application's DATABASE_URL.
export async function openTestDatabase(directory) {
  const client = new PGlite(directory);
  await client.waitReady;
  return {
    query: (sql, values) => client.query(sql, values),
    exec: (sql) => client.exec(sql),
    close: () => client.close(),
  };
}
