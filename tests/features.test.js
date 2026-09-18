import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { migrate } from '../server/database.js';
import { openTestDatabase } from './database.js';

let db, app, buyer, otherBuyer, supplier, otherSupplier, rfqId, otherRfqId, expiredId;
const password = 'Feature-test-password42';
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
const rfq = {
  productName: 'Industrial bearings',
  description: 'Sealed bearings, quantity in pieces.',
  quantity: 50,
  deliveryLocation: 'Pune',
  deadline: future,
};
const quote = { price: '850.00', deliveryTime: '10 days', message: 'Delivery included.' };
const summary = async (agent) =>
  (await agent.get('/api/dashboard/summary').expect(200)).body.summary;
before(async () => {
  db = await openTestDatabase();
  await migrate(db);
  app = createApp(db);
  [buyer, otherBuyer, supplier, otherSupplier] = Array.from({ length: 4 }, () =>
    request.agent(app),
  );
  for (const [agent, name, role] of [
    [buyer, 'Buyer A', 'BUYER'],
    [otherBuyer, 'Buyer B', 'BUYER'],
    [supplier, 'Supplier A', 'SUPPLIER'],
    [otherSupplier, 'Supplier B', 'SUPPLIER'],
  ]) {
    await agent
      .post('/api/auth/register')
      .send({ name, email: name.replace(' ', '') + '@example.test', password, role })
      .expect(201);
  }
});
after(async () => {
  await db?.close();
});

test('dashboard requires authentication and empty counts are real zeroes', async () => {
  await request(app).get('/api/dashboard/summary').expect(401);
  assert.deepEqual(await summary(buyer), { totalRfqs: 0, totalQuotations: 0 });
  assert.deepEqual(await summary(supplier), { availableRfqs: 0, myQuotations: 0 });
});

test('new RFQs persist OPEN; available counts exclude expired records and ignore search filters', async () => {
  const created = await buyer.post('/api/rfqs').send(rfq).expect(201);
  rfqId = created.body.rfq.id;
  assert.equal(created.body.rfq.status, 'OPEN');
  assert.equal(created.body.rfq.isOpen, true);
  assert.equal(
    (await db.query('SELECT status FROM rfqs WHERE id=$1', [rfqId])).rows[0].status,
    'OPEN',
  );
  otherRfqId = (
    await otherBuyer
      .post('/api/rfqs')
      .send({ ...rfq, productName: 'Other buyer request' })
      .expect(201)
  ).body.rfq.id;
  expiredId = (
    await buyer
      .post('/api/rfqs')
      .send({ ...rfq, productName: 'Expired request' })
      .expect(201)
  ).body.rfq.id;
  await db.query("UPDATE rfqs SET deadline='2000-01-01' WHERE id=$1", [expiredId]);
  assert.deepEqual(await summary(buyer), { totalRfqs: 2, totalQuotations: 0 });
  assert.deepEqual(await summary(otherBuyer), { totalRfqs: 1, totalQuotations: 0 });
  assert.deepEqual(await summary(supplier), { availableRfqs: 2, myQuotations: 0 });
  assert.equal((await supplier.get('/api/rfqs?q=missing').expect(200)).body.rfqs.length, 0);
  assert.equal((await summary(supplier)).availableRfqs, 2);
});

test('summary counts include all received quotations without counting RFQs twice or exposing others quotes', async () => {
  await supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quote).expect(201);
  await otherSupplier
    .post(`/api/rfqs/${rfqId}/quotations`)
    .send({ price: '820.00', deliveryTime: '14 days' })
    .expect(201);
  await supplier.post(`/api/rfqs/${otherRfqId}/quotations`).send(quote).expect(201);
  assert.deepEqual(await summary(buyer), { totalRfqs: 2, totalQuotations: 2 });
  assert.deepEqual(await summary(otherBuyer), { totalRfqs: 1, totalQuotations: 1 });
  assert.deepEqual(await summary(supplier), { availableRfqs: 2, myQuotations: 2 });
  assert.deepEqual(await summary(otherSupplier), { availableRfqs: 2, myQuotations: 1 });
  const comparison = (await buyer.get(`/api/rfqs/${rfqId}/quotations`).expect(200)).body.quotations;
  assert.equal(comparison.length, 2);
  assert.ok(
    comparison.some(
      (q) =>
        q.supplierName === 'Supplier A' &&
        q.price === '850.00' &&
        q.deliveryTime === '10 days' &&
        q.message === quote.message,
    ),
  );
  assert.ok(
    comparison.some(
      (q) =>
        q.supplierName === 'Supplier B' &&
        q.price === '820.00' &&
        q.deliveryTime === '14 days' &&
        q.message === '',
    ),
  );
});

test('close endpoint enforces login, role, ownership, identifier and allowed status', async () => {
  const path = `/api/rfqs/${rfqId}/status`;
  await request(app).patch(path).send({ status: 'CLOSED' }).expect(401);
  await supplier.patch(path).send({ status: 'CLOSED' }).expect(403);
  await otherBuyer.patch(path).send({ status: 'CLOSED' }).expect(403);
  await buyer.patch('/api/rfqs/not-an-id/status').send({ status: 'CLOSED' }).expect(400);
  await buyer.patch(`/api/rfqs/${randomUUID()}/status`).send({ status: 'CLOSED' }).expect(404);
  for (const body of [
    {},
    { status: 'OPEN' },
    { status: 'AWARDED' },
    { status: 'CLOSED', buyerId: randomUUID() },
  ]) {
    await buyer.patch(path).send(body).expect(400);
  }
  assert.equal((await buyer.get(`/api/rfqs/${rfqId}`).expect(200)).body.rfq.status, 'OPEN');
});

test('owner closing persists CLOSED, excludes browsing, prevents quotes and retains existing comparison/history', async () => {
  const closed = await buyer
    .patch(`/api/rfqs/${rfqId}/status`)
    .send({ status: 'CLOSED' })
    .expect(200);
  assert.equal(closed.body.rfq.status, 'CLOSED');
  assert.equal(closed.body.rfq.isOpen, false);
  assert.equal(
    (await db.query('SELECT status FROM rfqs WHERE id=$1', [rfqId])).rows[0].status,
    'CLOSED',
  );
  const detail = (await supplier.get(`/api/rfqs/${rfqId}`).expect(200)).body;
  assert.equal(detail.rfq.status, 'CLOSED');
  assert.equal(detail.quotation.price, quote.price);
  assert.ok(!(await supplier.get('/api/rfqs').expect(200)).body.rfqs.some((r) => r.id === rfqId));
  await supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quote).expect(409);
  assert.equal(
    (await buyer.get(`/api/rfqs/${rfqId}/quotations`).expect(200)).body.quotations.length,
    2,
  );
  assert.deepEqual(await summary(buyer), { totalRfqs: 2, totalQuotations: 2 });
  assert.deepEqual(await summary(supplier), { availableRfqs: 1, myQuotations: 2 });
  await buyer.patch(`/api/rfqs/${rfqId}/status`).send({ status: 'CLOSED' }).expect(200);
});

test('close rejects a new supplier and subsequent edits do not reopen the RFQ', async () => {
  await otherBuyer.patch(`/api/rfqs/${otherRfqId}/status`).send({ status: 'CLOSED' }).expect(200);
  await otherSupplier.post(`/api/rfqs/${otherRfqId}/quotations`).send(quote).expect(409);
  await buyer
    .put(`/api/rfqs/${rfqId}`)
    .send({ ...rfq, quantity: 60 })
    .expect(200);
  assert.equal((await supplier.get(`/api/rfqs/${rfqId}`).expect(200)).body.rfq.status, 'CLOSED');
  await buyer
    .put(`/api/rfqs/${rfqId}`)
    .send({ ...rfq, status: 'OPEN' })
    .expect(400);
  assert.equal((await summary(supplier)).availableRfqs, 0);
});

test('expiry continues to restrict availability and changing an unclosed RFQ deadline preserves existing behavior', async () => {
  await supplier.post(`/api/rfqs/${expiredId}/quotations`).send(quote).expect(409);
  const renewed = await buyer
    .put(`/api/rfqs/${expiredId}`)
    .send({ ...rfq, productName: 'Updated deadline' })
    .expect(200);
  assert.equal(renewed.body.rfq.status, 'OPEN');
  assert.equal(renewed.body.rfq.isOpen, true);
  assert.equal((await summary(supplier)).availableRfqs, 1);
});

test('deleting requests updates buyer and supplier summaries without deleting unrelated data', async () => {
  await buyer.delete(`/api/rfqs/${rfqId}`).send({}).expect(204);
  assert.deepEqual(await summary(buyer), { totalRfqs: 1, totalQuotations: 0 });
  assert.deepEqual(await summary(supplier), { availableRfqs: 1, myQuotations: 1 });
  assert.deepEqual(await summary(otherSupplier), { availableRfqs: 1, myQuotations: 0 });
  assert.deepEqual(await summary(otherBuyer), { totalRfqs: 1, totalQuotations: 1 });
  await buyer.delete(`/api/rfqs/${expiredId}`).send({}).expect(204);
  assert.equal((await summary(supplier)).availableRfqs, 0);
});

test('status constraint rejects extra lifecycle states', async () => {
  await assert.rejects(
    db.query("UPDATE rfqs SET status='OTHER' WHERE id=$1", [otherRfqId]),
    (error) => error.code === '23514',
  );
});

test('existing-schema upgrade preserves data, is repeatable and closed status survives reopening the database', async () => {
  const root = resolve('.data');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, 'status-upgrade-'));
  let legacy;
  try {
    legacy = await openTestDatabase(directory);
    // Frozen pre-feature schema: status does not exist yet.
    await legacy.exec(`CREATE TABLE users (id UUID PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, role VARCHAR(8) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE rfqs (id UUID PRIMARY KEY, buyer_id UUID NOT NULL REFERENCES users(id), product_name VARCHAR(160) NOT NULL, description TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL, delivery_location VARCHAR(200) NOT NULL, deadline DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE quotations (id UUID PRIMARY KEY, rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE, supplier_id UUID NOT NULL REFERENCES users(id), price NUMERIC(14,2) NOT NULL, delivery_time VARCHAR(200) NOT NULL, message TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(rfq_id,supplier_id));`);
    const userId = randomUUID(),
      supplierId = randomUUID(),
      oldRfq = randomUUID(),
      oldQuote = randomUUID();
    await legacy.query(
      "INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,'Legacy buyer','legacy@example.test','fixture','BUYER'),($2,'Legacy supplier','supplier@example.test','fixture','SUPPLIER')",
      [userId, supplierId],
    );
    await legacy.query(
      'INSERT INTO rfqs (id,buyer_id,product_name,description,quantity,delivery_location,deadline) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [oldRfq, userId, rfq.productName, rfq.description, 50, 'Pune', future],
    );
    await legacy.query(
      'INSERT INTO quotations (id,rfq_id,supplier_id,price,delivery_time,message) VALUES ($1,$2,$3,$4,$5,$6)',
      [oldQuote, oldRfq, supplierId, quote.price, quote.deliveryTime, quote.message],
    );
    await migrate(legacy);
    await migrate(legacy);
    assert.equal(
      (await legacy.query('SELECT status FROM rfqs WHERE id=$1', [oldRfq])).rows[0].status,
      'OPEN',
    );
    assert.equal(
      (await legacy.query('SELECT message FROM quotations WHERE id=$1', [oldQuote])).rows[0]
        .message,
      quote.message,
    );
    await legacy.query("UPDATE rfqs SET status='CLOSED' WHERE id=$1", [oldRfq]);
    await legacy.close();
    legacy = null;
    legacy = await openTestDatabase(directory);
    await migrate(legacy);
    assert.equal(
      (await legacy.query('SELECT status FROM rfqs WHERE id=$1', [oldRfq])).rows[0].status,
      'CLOSED',
    );
    assert.equal(
      (await legacy.query('SELECT COUNT(*)::int AS count FROM quotations')).rows[0].count,
      1,
    );
  } finally {
    await legacy?.close();
    assert.ok(
      resolve(directory).startsWith(root + '\\') || resolve(directory).startsWith(root + '/'),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
