import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { migrate } from '../server/database.js';
import { openTestDatabase } from './database.js';
let db, app, buyer, supplier, other, rfqId, quoteId;
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
const rfq = {
  productName: 'Saved industrial bearings',
  description: 'Sealed bearings, quantity in pieces.',
  quantity: 50,
  deliveryLocation: 'Pune',
  deadline: future,
};
const quote = { price: '850.50', deliveryTime: '10 days', message: 'Shipping included.' };
const status = { status: 'WITHDRAWN' };
before(async () => {
  db = await openTestDatabase();
  await migrate(db);
  app = createApp(db);
  [buyer, supplier, other] = Array.from({ length: 3 }, () => request.agent(app));
  for (const [agent, name, role] of [
    [buyer, 'Buyer', 'BUYER'],
    [supplier, 'Supplier A', 'SUPPLIER'],
    [other, 'Supplier B', 'SUPPLIER'],
  ]) {
    await agent
      .post('/api/auth/register')
      .send({
        name,
        role,
        email: name.replaceAll(' ', '') + '@example.test',
        password: 'Test-password42',
      })
      .expect(201);
  }
  rfqId = (await buyer.post('/api/rfqs').send(rfq).expect(201)).body.rfq.id;
  quoteId = (await supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quote).expect(201)).body
    .quotation.id;
});
after(async () => {
  await db?.close();
});
test('withdraw requires authentication, supplier role, ownership and valid input', async () => {
  const path = `/api/quotations/${quoteId}/status`;
  await request(app).patch(path).send(status).expect(401);
  await buyer.patch(path).send(status).expect(403);
  await other.patch(path).send(status).expect(403);
  await supplier.patch('/api/quotations/invalid/status').send(status).expect(400);
  await supplier.patch(`/api/quotations/${randomUUID()}/status`).send(status).expect(404);
  for (const body of [
    {},
    { status: 'ACTIVE' },
    { status: 'ACCEPTED' },
    { ...status, supplierId: randomUUID() },
  ])
    await supplier.patch(path).send(body).expect(400);
  await supplier.patch(path).set('Origin', 'https://evil.example').send(status).expect(403);
  assert.equal(
    (await buyer.get(`/api/rfqs/${rfqId}/quotations`)).body.quotations[0].status,
    'ACTIVE',
  );
});
test('withdraw persists history, filters buyer comparison, updates active buyer count and is idempotent', async () => {
  const otherQuote = (
    await other
      .post(`/api/rfqs/${rfqId}/quotations`)
      .send({ ...quote, price: 900 })
      .expect(201)
  ).body.quotation;
  assert.equal((await buyer.get('/api/dashboard/summary')).body.summary.totalQuotations, 2);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await supplier.patch(`/api/quotations/${quoteId}/status`).send(status).expect(200)).body
        .quotation.status,
      'WITHDRAWN',
    );
  const comparison = (await buyer.get(`/api/rfqs/${rfqId}/quotations`).expect(200)).body.quotations;
  assert.deepEqual(
    comparison.map((q) => q.id),
    [otherQuote.id],
  );
  const history = (await supplier.get('/api/quotations/my').expect(200)).body.quotations;
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'WITHDRAWN');
  assert.equal(history[0].price, quote.price);
  assert.equal(
    (await supplier.get(`/api/rfqs/${rfqId}`).expect(200)).body.quotation.status,
    'WITHDRAWN',
  );
  assert.equal((await buyer.get('/api/dashboard/summary')).body.summary.totalQuotations, 1);
  assert.equal((await supplier.get('/api/dashboard/summary')).body.summary.myQuotations, 1);
  await supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quote).expect(409);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM quotations')).rows[0].count, 2);
});
test('save APIs enforce authentication, role, validation and session-derived ownership', async () => {
  const path = `/api/rfqs/${rfqId}/saved`;
  for (const method of ['put', 'delete']) {
    await request(app)[method](path).send({}).expect(401);
    await buyer[method](path).send({}).expect(403);
    await supplier[method]('/api/rfqs/invalid/saved').send({}).expect(400);
    await supplier[method](`/api/rfqs/${randomUUID()}/saved`).send({}).expect(404);
    await supplier[method](path).send({ supplierId: randomUUID() }).expect(400);
    await supplier[method](path).set('Sec-Fetch-Site', 'cross-site').send({}).expect(403);
  }
  await request(app).get('/api/rfqs/saved').expect(401);
  await buyer.get('/api/rfqs/saved').expect(403);
  assert.deepEqual((await supplier.get('/api/rfqs/saved').expect(200)).body.rfqs, []);
});
test('saving is unique and private; browse flags, removal and repeated requests remain consistent', async () => {
  const path = `/api/rfqs/${rfqId}/saved`;
  const initial = (await supplier.get('/api/rfqs')).body.rfqs;
  assert.equal(initial.find((r) => r.id === rfqId).isSaved, false);
  await Promise.all([
    supplier.put(path).send({}).expect(200),
    supplier.put(path).send({}).expect(200),
  ]);
  assert.equal((await supplier.get('/api/rfqs/saved').expect(200)).body.rfqs.length, 1);
  assert.equal(
    (await supplier.get('/api/rfqs')).body.rfqs.find((r) => r.id === rfqId).isSaved,
    true,
  );
  assert.deepEqual((await other.get('/api/rfqs/saved').expect(200)).body.rfqs, []);
  assert.equal((await other.get('/api/rfqs')).body.rfqs.find((r) => r.id === rfqId).isSaved, false);
  await other.delete(path).send({}).expect(204);
  assert.equal((await supplier.get('/api/rfqs/saved')).body.rfqs.length, 1);
  await other.put(path).send({}).expect(200);
  await supplier.delete(path).send({}).expect(204);
  await supplier.delete(path).send({}).expect(204);
  assert.equal(
    (await supplier.get('/api/rfqs')).body.rfqs.find((r) => r.id === rfqId).isSaved,
    false,
  );
  assert.equal((await other.get('/api/rfqs/saved')).body.rfqs.length, 1);
});
test('saved closed and expired RFQs remain viewable, withdrawal still works and deleting RFQ cleans bookmarks', async () => {
  await buyer.patch(`/api/rfqs/${rfqId}/status`).send({ status: 'CLOSED' }).expect(200);
  await supplier.put(`/api/rfqs/${rfqId}/saved`).send({}).expect(200);
  await db.query("UPDATE rfqs SET deadline='2020-01-01' WHERE id=$1", [rfqId]);
  const saved = (await supplier.get('/api/rfqs/saved').expect(200)).body.rfqs;
  assert.equal(saved[0].status, 'CLOSED');
  assert.equal(saved[0].isOpen, false);
  assert.equal((await supplier.get('/api/rfqs')).body.rfqs.length, 0);
  const id = (await other.get('/api/quotations/my')).body.quotations[0].id;
  await other.patch(`/api/quotations/${id}/status`).send(status).expect(200);
  assert.equal((await buyer.get(`/api/rfqs/${rfqId}/quotations`)).body.quotations.length, 0);
  await buyer.delete(`/api/rfqs/${rfqId}`).send({}).expect(204);
  assert.equal((await supplier.get('/api/rfqs/saved')).body.rfqs.length, 0);
  assert.equal((await other.get('/api/rfqs/saved')).body.rfqs.length, 0);
});
test('database failures produce safe error responses for save, removal, list and withdrawal', async () => {
  const result = await buyer.post('/api/rfqs').send(rfq).expect(201);
  const id = result.body.rfq.id;
  const q = (await supplier.post(`/api/rfqs/${id}/quotations`).send(quote).expect(201)).body
    .quotation;
  const broken = createApp({
    ...db,
    query: (sql, values) => {
      if (sql.includes('saved_rfqs') || sql.startsWith('UPDATE quotations'))
        throw new Error('private database credentials must not appear');
      return db.query(sql, values);
    },
  });
  const login = await request(broken)
    .post('/api/auth/login')
    .send({ email: 'SupplierA@example.test', password: 'Test-password42' })
    .expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  for (const [method, path, body] of [
    ['put', `/api/rfqs/${id}/saved`, {}],
    ['delete', `/api/rfqs/${id}/saved`, {}],
    ['get', '/api/rfqs/saved', null],
    ['patch', `/api/quotations/${q.id}/status`, status],
  ]) {
    let req = request(broken)[method](path).set('Cookie', cookie);
    if (body) req = req.send(body);
    const response = await req.expect(500);
    assert.equal(response.body.error, 'Something went wrong. Please try again.');
  }
});
test('upgrade preserves old quotations, then repeat migration and database restart preserve saved and withdrawn state', async () => {
  const root = resolve('.data');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, 'supplier-upgrade-'));
  let legacy;
  try {
    legacy = await openTestDatabase(directory);
    let schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
    schema = schema.replace(
      /-- Preserve all existing quotations[\s\S]*?(?=CREATE TABLE IF NOT EXISTS sessions)/,
      '',
    );
    await legacy.exec(schema);
    const b = randomUUID(),
      s = randomUUID(),
      r = randomUUID(),
      q = randomUUID();
    await legacy.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES ($1,'Buyer','b@x.test','fixture','BUYER'),($2,'Supplier','s@x.test','fixture','SUPPLIER')",
      [b, s],
    );
    await legacy.query(
      "INSERT INTO rfqs(id,buyer_id,product_name,description,quantity,delivery_location,deadline) VALUES ($1,$2,'Bearings','Steel',5,'Pune',$3)",
      [r, b, future],
    );
    await legacy.query(
      "INSERT INTO quotations(id,rfq_id,supplier_id,price,delivery_time,message) VALUES ($1,$2,$3,850.50,'10 days','Shipping included.')",
      [q, r, s],
    );
    await migrate(legacy);
    assert.equal((await legacy.query('SELECT status FROM quotations')).rows[0].status, 'ACTIVE');
    await legacy.query("UPDATE quotations SET status='WITHDRAWN' WHERE id=$1", [q]);
    await legacy.query('INSERT INTO saved_rfqs(supplier_id,rfq_id) VALUES ($1,$2)', [s, r]);
    await assert.rejects(
      legacy.query("UPDATE quotations SET status='ACCEPTED'"),
      (e) => e.code === '23514',
    );
    await migrate(legacy);
    await legacy.close();
    legacy = null;
    legacy = await openTestDatabase(directory);
    await migrate(legacy);
    const row = (await legacy.query('SELECT status,price::text,message FROM quotations')).rows[0];
    assert.deepEqual(row, { status: 'WITHDRAWN', price: '850.50', message: 'Shipping included.' });
    assert.equal(
      (await legacy.query('SELECT rfq_id FROM saved_rfqs WHERE supplier_id=$1', [s])).rows[0]
        .rfq_id,
      r,
    );
  } finally {
    await legacy?.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  }
});
