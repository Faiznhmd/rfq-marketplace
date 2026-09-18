import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { migrate } from '../server/database.js';
import { openTestDatabase } from './database.js';
import { createApp } from '../server/app.js';

let db, app, buyer, buyer2, supplier, supplier2, rfqId, buyerId, supplierId;
const password = 'Test-only-password-42';
const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const rfq = {
  productName: 'Recycled packaging',
  description: '500 recycled cardboard boxes, size 20 cm.',
  quantity: '500',
  deliveryLocation: 'Bengaluru',
  deadline: future,
};
const quotation = {
  price: '1250.50',
  deliveryTime: '7 business days',
  message: 'Delivery is included.',
};
before(async () => {
  db = await openTestDatabase();
  await migrate(db);
  app = createApp(db);
  buyer = request.agent(app);
  buyer2 = request.agent(app);
  supplier = request.agent(app);
  supplier2 = request.agent(app);
});
after(async () => {
  await db?.close();
});

test('registers both roles, normalizes email, hashes passwords and sets HttpOnly sessions', async () => {
  for (const [agent, email, role, name] of [
    [buyer, 'BUYER@example.test', 'BUYER', 'Asha Buyer'],
    [buyer2, 'other-buyer@example.test', 'BUYER', 'Other Buyer'],
    [supplier, 'supplier@example.test', 'SUPPLIER', 'Dev Supplier'],
    [supplier2, 'other-supplier@example.test', 'SUPPLIER', 'Other Supplier'],
  ]) {
    const response = await agent
      .post('/api/auth/register')
      .set('Origin', 'http://127.0.0.1:5173')
      .send({ name, email, password, role })
      .expect(201);
    assert.equal(response.body.user.email, email.toLowerCase());
    assert.equal(response.body.user.password_hash, undefined);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
    if (agent === buyer) buyerId = response.body.user.id;
    if (agent === supplier) supplierId = response.body.user.id;
  }
  const { rows } = await db.query('SELECT password_hash FROM users');
  assert.ok(rows.every((row) => row.password_hash !== password && row.password_hash.includes(':')));
  assert.notEqual(rows[0].password_hash, rows[1].password_hash);
  const sessions = await db.query('SELECT token_hash FROM sessions');
  assert.equal(sessions.rows.length, 4);
  assert.ok(sessions.rows.every((row) => /^[a-f0-9]{64}$/.test(row.token_hash)));
});
test('rejects invalid registration, duplicate email and incorrect credentials', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ name: '', email: 'bad', password: 'x', role: 'ADMIN' })
    .expect(400);
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Duplicate', email: 'buyer@example.test', password, role: 'BUYER' })
    .expect(409);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'buyer@example.test', password: 'incorrect' })
    .expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'missing@example.test', password })
    .expect(401);
  await request(app).get('/api/auth/me').expect(401);
  await request(app).get('/api/rfqs').expect(401);
});
test('restores session, logs in, logs out and rejects replay of revoked session', async () => {
  assert.equal((await buyer.get('/api/auth/me').expect(200)).body.user.role, 'BUYER');
  const agent = request.agent(app);
  const login = await agent
    .post('/api/auth/login')
    .send({ email: 'BUYER@example.test', password })
    .expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await agent.get('/api/auth/me').expect(200);
  await agent.post('/api/auth/logout').send({}).expect(204);
  await agent.get('/api/auth/me').expect(401);
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
});
test('protects mutations against cross-origin and non-JSON requests', async () => {
  await buyer.post('/api/rfqs').set('Origin', 'https://evil.example').send(rfq).expect(403);
  await buyer.post('/api/rfqs').set('Sec-Fetch-Site', 'cross-site').send(rfq).expect(403);
  await buyer.post('/api/rfqs').type('form').send(rfq).expect(415);
});
test('creates and lists buyer RFQs with all required fields', async () => {
  const response = await buyer.post('/api/rfqs').send(rfq).expect(201);
  rfqId = response.body.rfq.id;
  assert.equal(response.body.rfq.buyerId, buyerId);
  assert.equal(response.body.rfq.productName, rfq.productName);
  assert.equal(response.body.rfq.deadline, future);
  assert.equal(response.body.rfq.isOpen, true);
  assert.equal((await buyer.get('/api/rfqs/my').expect(200)).body.rfqs.length, 1);
  assert.equal((await buyer2.get('/api/rfqs/my').expect(200)).body.rfqs.length, 0);
});
test('rejects wrong-role actions and protects every buyer-owned resource', async () => {
  await supplier.post('/api/rfqs').send(rfq).expect(403);
  await supplier.get('/api/rfqs/my').expect(403);
  await supplier.put(`/api/rfqs/${rfqId}`).send(rfq).expect(403);
  await supplier.delete(`/api/rfqs/${rfqId}`).send({}).expect(403);
  await supplier.get(`/api/rfqs/${rfqId}/quotations`).expect(403);
  await buyer.get('/api/rfqs').expect(403);
  await buyer.get('/api/quotations/my').expect(403);
  await buyer.post(`/api/rfqs/${rfqId}/quotations`).send(quotation).expect(403);
  await buyer2.get(`/api/rfqs/${rfqId}`).expect(403);
  await buyer2.put(`/api/rfqs/${rfqId}`).send(rfq).expect(403);
  await buyer2.delete(`/api/rfqs/${rfqId}`).send({}).expect(403);
  await buyer2.get(`/api/rfqs/${rfqId}/quotations`).expect(403);
});
test('validates RFQ fields, calendar dates, decimal precision and untrusted ownership input', async () => {
  for (const invalid of [
    { productName: ' ' },
    { description: '' },
    { quantity: 0 },
    { quantity: -3 },
    { quantity: 'Infinity' },
    { quantity: '0.0001' },
    { quantity: null },
    { deliveryLocation: '' },
    { deadline: '2000-01-01' },
    { deadline: '2099-02-31' },
    { deadline: 'invalid' },
    { buyerId },
    { unexpected: true },
  ]) {
    await buyer
      .post('/api/rfqs')
      .send({ ...rfq, ...invalid })
      .expect(400);
  }
  await buyer.get('/api/rfqs/invalid').expect(400);
  await buyer.get(`/api/rfqs/${randomUUID()}`).expect(404);
});
test('edits RFQs and searches by keyword and location with literal SQL wildcard handling', async () => {
  await buyer
    .put(`/api/rfqs/${rfqId}`)
    .send({ ...rfq, quantity: '650' })
    .expect(200);
  const detail = (await supplier.get(`/api/rfqs/${rfqId}`).expect(200)).body.rfq;
  assert.equal(Number(detail.quantity), 650);
  assert.equal(detail.buyerName, 'Asha Buyer');
  assert.equal(detail.description, rfq.description);
  for (const query of [
    'q=PACKAGING',
    'q=cardboard',
    'location=bengaluru',
    'q=packaging&location=BENG',
  ])
    assert.equal((await supplier.get(`/api/rfqs?${query}`).expect(200)).body.rfqs.length, 1);
  for (const query of ['q=missing', 'location=London', 'q=%25', 'q=%27%20OR%201%3D1--'])
    assert.equal((await supplier.get(`/api/rfqs?${query}`).expect(200)).body.rfqs.length, 0);
  await supplier.get('/api/rfqs?q[]=bad').expect(400);
  await supplier.get('/api/rfqs?location=' + 'x'.repeat(201)).expect(400);
});
test('validates quotation fields and rejects invalid numeric input', async () => {
  for (const invalid of [
    { price: 0 },
    { price: -1 },
    { price: '3.001' },
    { price: '1e5' },
    { deliveryTime: ' ' },
    { message: 'x'.repeat(3001) },
    { supplierId: buyerId },
  ]) {
    await supplier
      .post(`/api/rfqs/${rfqId}/quotations`)
      .send({ ...quotation, ...invalid })
      .expect(400);
  }
});
test('saves one quotation under concurrent submission, visible only to owner and submitting supplier', async () => {
  const responses = await Promise.all([
    supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quotation),
    supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quotation),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const own = (await supplier.get('/api/quotations/my').expect(200)).body.quotations;
  assert.equal(own.length, 1);
  assert.equal(own[0].price, quotation.price);
  assert.equal(own[0].productName, rfq.productName);
  assert.equal(own[0].supplierId, supplierId);
  assert.ok(own[0].createdAt);
  assert.equal((await supplier2.get('/api/quotations/my').expect(200)).body.quotations.length, 0);
  assert.equal((await supplier2.get(`/api/rfqs/${rfqId}`).expect(200)).body.quotation, null);
  assert.equal(
    (await supplier.get(`/api/rfqs/${rfqId}`).expect(200)).body.quotation.price,
    quotation.price,
  );
  const received = (await buyer.get(`/api/rfqs/${rfqId}/quotations`).expect(200)).body.quotations;
  assert.equal(received.length, 1);
  assert.equal(received[0].supplierName, 'Dev Supplier');
  assert.equal(received[0].deliveryTime, quotation.deliveryTime);
  assert.equal(received[0].message, quotation.message);
});
test('allows optional notes and returns all supplier quotations to the RFQ owner', async () => {
  await supplier2
    .post(`/api/rfqs/${rfqId}/quotations`)
    .send({ price: 1450, deliveryTime: '5 days' })
    .expect(201);
  const received = (await buyer.get(`/api/rfqs/${rfqId}/quotations`).expect(200)).body.quotations;
  assert.equal(received.length, 2);
  assert.equal(received.find((q) => q.price === '1450.00').message, '');
});
test('excludes expired requests, rejects expired submissions and preserves quotation history', async () => {
  await db.query("UPDATE rfqs SET deadline='2000-01-01' WHERE id=$1", [rfqId]);
  assert.equal((await supplier.get('/api/rfqs').expect(200)).body.rfqs.length, 0);
  assert.equal((await supplier.get(`/api/rfqs/${rfqId}`).expect(200)).body.rfq.isOpen, false);
  await supplier.post(`/api/rfqs/${rfqId}/quotations`).send(quotation).expect(409);
  assert.equal((await supplier.get('/api/quotations/my').expect(200)).body.quotations.length, 1);
  assert.equal((await buyer.get('/api/rfqs/my').expect(200)).body.rfqs.length, 1);
});
test('deletes owned RFQ and cascades quotations', async () => {
  await buyer.delete(`/api/rfqs/${rfqId}`).send({}).expect(204);
  await buyer.get(`/api/rfqs/${rfqId}`).expect(404);
  assert.equal((await supplier.get('/api/quotations/my').expect(200)).body.quotations.length, 0);
  assert.equal((await db.query('SELECT * FROM quotations')).rows.length, 0);
});
test('handles malformed JSON, unknown endpoints and sanitized database errors', async () => {
  await buyer.post('/api/rfqs').set('Content-Type', 'application/json').send('{bad').expect(400);
  await buyer.get('/api/unknown').expect(404);
  const failedApp = createApp({
    query: async () => {
      throw new Error('secret database connection string');
    },
  });
  const response = await request(failedApp).get('/api/health').expect(500);
  assert.equal(response.body.error, 'Something went wrong. Please try again.');
  assert.ok(!JSON.stringify(response.body).includes('secret'));
});
test('production session cookies are Secure and host-scoped', async () => {
  const productionApp = createApp(db, { production: true, appOrigin: 'https://example.com' });
  const response = await request(productionApp)
    .post('/api/auth/login')
    .set('Origin', 'https://example.com')
    .send({ email: 'buyer@example.test', password })
    .expect(200);
  assert.match(response.headers['set-cookie'][0], /^__Host-rfq_session=/);
  assert.match(response.headers['set-cookie'][0], /; Secure/);
  assert.ok(response.headers['strict-transport-security']);
});
test('database foreign keys and unique constraints are enforced', async () => {
  await assert.rejects(
    db.query(
      'INSERT INTO quotations (id,rfq_id,supplier_id,price,delivery_time) VALUES ($1,$2,$3,1,$4)',
      [randomUUID(), randomUUID(), supplierId, '1 day'],
    ),
    (error) => error.code === '23503',
  );
});
test('file-backed PostgreSQL data and sessions survive a database restart', async () => {
  const root = resolve('.data');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, 'persistence-test-'));
  let disk;
  try {
    disk = await openTestDatabase(directory);
    await migrate(disk);
    const firstApp = createApp(disk);
    const response = await request(firstApp)
      .post('/api/auth/register')
      .send({ name: 'Persisted', email: 'persist@example.test', password, role: 'BUYER' })
      .expect(201);
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    await request(firstApp).post('/api/rfqs').set('Cookie', cookie).send(rfq).expect(201);
    await disk.close();
    disk = null;
    disk = await openTestDatabase(directory);
    await migrate(disk);
    const restarted = createApp(disk);
    await request(restarted).get('/api/auth/me').set('Cookie', cookie).expect(200);
    assert.equal(
      (await request(restarted).get('/api/rfqs/my').set('Cookie', cookie).expect(200)).body.rfqs[0]
        .productName,
      rfq.productName,
    );
  } finally {
    await disk?.close();
    // directory is created by mkdtemp under the workspace's .data folder only.
    assert.ok(
      resolve(directory).startsWith(root + '\\') || resolve(directory).startsWith(root + '/'),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test('development accepts loopback aliases only on the configured port', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173']) {
    // Invalid login data reaches validation (400), proving the origin check passed.
    await request(app).post('/api/auth/login').set('Origin', origin).send({}).expect(400);
  }
  for (const origin of [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'https://evil.example',
    'http://localhost.evil.example:5173',
    'null',
  ]) {
    await request(app).post('/api/auth/login').set('Origin', origin).send({}).expect(403);
  }
  await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://127.0.0.1:5173')
    .set('Sec-Fetch-Site', 'cross-site')
    .send({})
    .expect(403);
});

test('production accepts only the configured origin without development aliases', async () => {
  const productionApp = createApp(db, { production: true, appOrigin: 'https://example.com' });
  await request(productionApp)
    .post('/api/auth/login')
    .set('Origin', 'https://example.com')
    .send({})
    .expect(400);
  for (const origin of [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://other.example',
  ]) {
    await request(productionApp).post('/api/auth/login').set('Origin', origin).send({}).expect(403);
  }
});
