import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { authentication, authorize } from './auth.js';
import { parse, HttpError } from './errors.js';
import {
  idSchema,
  rfqSchema,
  quotationSchema,
  searchSchema,
  closeRfqSchema,
  withdrawQuotationSchema,
  emptyBodySchema,
} from '../shared/validation.js';

const rfqColumns = `r.id, r.buyer_id AS "buyerId", r.product_name AS "productName", r.description,
  r.quantity::text AS quantity, r.delivery_location AS "deliveryLocation", r.deadline::text AS deadline,
  r.created_at AS "createdAt", r.status, (r.status = 'OPEN' AND r.deadline > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) AS "isOpen"`;
const quoteColumns = `q.id, q.rfq_id AS "rfqId", q.supplier_id AS "supplierId", q.price::text AS price,
  q.delivery_time AS "deliveryTime", q.message, q.status, q.created_at AS "createdAt"`;
const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function marketplaceRoutes(db, production) {
  const router = Router();
  router.use(authentication(db, production));
  const buyer = authorize('BUYER');
  const supplier = authorize('SUPPLIER');
  router.param('id', (req, res, next, id) => {
    if (!idSchema.safeParse(id).success) throw new HttpError(400, 'Invalid RFQ identifier.');
    next();
  });
  router.param('quotationId', (req, res, next, id) => {
    if (!idSchema.safeParse(id).success) throw new HttpError(400, 'Invalid quotation identifier.');
    next();
  });
  async function getRfq(id, user) {
    const { rows } = await db.query(
      `SELECT ${rfqColumns}, u.name AS "buyerName" FROM rfqs r JOIN users u ON u.id=r.buyer_id WHERE r.id=$1`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'This RFQ could not be found.');
    if (user.role === 'BUYER' && rows[0].buyerId !== user.id)
      throw new HttpError(403, 'You can only access your own RFQs.');
    return rows[0];
  }
  router.get('/dashboard/summary', async (req, res) => {
    if (req.user.role === 'BUYER') {
      const { rows } = await db.query(
        `SELECT
          (SELECT COUNT(*)::int FROM rfqs WHERE buyer_id=$1) AS "totalRfqs",
          (SELECT COUNT(*)::int FROM quotations q JOIN rfqs r ON r.id=q.rfq_id WHERE r.buyer_id=$1 AND q.status='ACTIVE') AS "totalQuotations"`,
        [req.user.id],
      );
      return res.json({ summary: rows[0] });
    }
    const { rows } = await db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM rfqs WHERE status='OPEN' AND deadline > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) AS "availableRfqs",
        (SELECT COUNT(*)::int FROM quotations WHERE supplier_id=$1) AS "myQuotations"`,
      [req.user.id],
    );
    res.json({ summary: rows[0] });
  });
  router.get('/rfqs/my', buyer, async (req, res) => {
    const { rows } = await db.query(`SELECT ${rfqColumns} FROM rfqs r WHERE r.buyer_id=$1`, [
      req.user.id,
    ]);
    res.json({ rfqs: rows });
  });
  router.get('/rfqs', supplier, async (req, res) => {
    const { q, location } = parse(searchSchema, req.query);
    const { rows } = await db.query(
      `SELECT ${rfqColumns}, EXISTS (SELECT 1 FROM saved_rfqs s WHERE s.rfq_id=r.id AND s.supplier_id=$3) AS "isSaved" FROM rfqs r
      WHERE r.status = 'OPEN' AND r.deadline > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      AND (r.product_name ILIKE $1 OR r.description ILIKE $1) AND r.delivery_location ILIKE $2`,
      [`%${escapeLike(q)}%`, `%${escapeLike(location)}%`, req.user.id],
    );
    res.json({ rfqs: rows });
  });
  router.get('/rfqs/saved', supplier, async (req, res) => {
    const { rows } = await db.query(
      `SELECT ${rfqColumns}, true AS "isSaved" FROM saved_rfqs s JOIN rfqs r ON r.id=s.rfq_id
       WHERE s.supplier_id=$1 ORDER BY s.created_at DESC, r.id`,
      [req.user.id],
    );
    res.json({ rfqs: rows });
  });
  router.put('/rfqs/:id/saved', supplier, async (req, res) => {
    parse(emptyBodySchema, req.body);
    await getRfq(req.params.id, req.user);
    await db.query(
      'INSERT INTO saved_rfqs (supplier_id,rfq_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.id],
    );
    res.json({ isSaved: true });
  });
  router.delete('/rfqs/:id/saved', supplier, async (req, res) => {
    parse(emptyBodySchema, req.body);
    await getRfq(req.params.id, req.user);
    await db.query('DELETE FROM saved_rfqs WHERE supplier_id=$1 AND rfq_id=$2', [
      req.user.id,
      req.params.id,
    ]);
    res.status(204).end();
  });
  router.post('/rfqs', buyer, async (req, res) => {
    const data = parse(rfqSchema, req.body);
    const id = randomUUID();
    await db.query(
      `INSERT INTO rfqs (id,buyer_id,product_name,description,quantity,delivery_location,deadline)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        req.user.id,
        data.productName,
        data.description,
        data.quantity,
        data.deliveryLocation,
        data.deadline,
      ],
    );
    res.status(201).json({ rfq: await getRfq(id, req.user) });
  });
  router.get('/rfqs/:id', async (req, res) => {
    const rfq = await getRfq(req.params.id, req.user);
    let quotation = null;
    if (req.user.role === 'SUPPLIER') {
      const { rows } = await db.query(
        `SELECT ${quoteColumns} FROM quotations q WHERE q.rfq_id=$1 AND q.supplier_id=$2`,
        [rfq.id, req.user.id],
      );
      quotation = rows[0] || null;
    }
    res.json({ rfq, quotation });
  });
  router.put('/rfqs/:id', buyer, async (req, res) => {
    await getRfq(req.params.id, req.user);
    const data = parse(rfqSchema, req.body);
    const result = await db.query(
      `UPDATE rfqs SET product_name=$1,description=$2,quantity=$3,delivery_location=$4,deadline=$5
      WHERE id=$6 AND buyer_id=$7 RETURNING id`,
      [
        data.productName,
        data.description,
        data.quantity,
        data.deliveryLocation,
        data.deadline,
        req.params.id,
        req.user.id,
      ],
    );
    if (!result.rows.length) throw new HttpError(404, 'This RFQ no longer exists.');
    res.json({ rfq: await getRfq(req.params.id, req.user) });
  });
  router.patch('/rfqs/:id/status', buyer, async (req, res) => {
    await getRfq(req.params.id, req.user);
    const { status } = parse(closeRfqSchema, req.body);
    const result = await db.query(
      'UPDATE rfqs SET status=$1 WHERE id=$2 AND buyer_id=$3 RETURNING id',
      [status, req.params.id, req.user.id],
    );
    if (!result.rows.length) throw new HttpError(404, 'This RFQ no longer exists.');
    res.json({ rfq: await getRfq(req.params.id, req.user) });
  });
  router.delete('/rfqs/:id', buyer, async (req, res) => {
    await getRfq(req.params.id, req.user);
    await db.query('DELETE FROM rfqs WHERE id=$1 AND buyer_id=$2', [req.params.id, req.user.id]);
    res.status(204).end();
  });
  router.get('/rfqs/:id/quotations', buyer, async (req, res) => {
    await getRfq(req.params.id, req.user);
    const { rows } = await db.query(
      `SELECT ${quoteColumns}, u.name AS "supplierName" FROM quotations q
      JOIN users u ON u.id=q.supplier_id WHERE q.rfq_id=$1 AND q.status='ACTIVE'`,
      [req.params.id],
    );
    res.json({ quotations: rows });
  });
  router.post('/rfqs/:id/quotations', supplier, async (req, res) => {
    const rfq = await getRfq(req.params.id, req.user);
    if (!rfq.isOpen)
      throw new HttpError(
        409,
        'This RFQ is closed or its deadline has passed. It no longer accepts quotations.',
      );
    const data = parse(quotationSchema, req.body);
    try {
      // Lock the RFQ while inserting, so closing and quotation submission have a consistent order.
      const { rows } = await db.query(
        `INSERT INTO quotations (id,rfq_id,supplier_id,price,delivery_time,message)
        SELECT $1,r.id,$3,$4,$5,$6 FROM rfqs r WHERE r.id=$2 AND r.status='OPEN' AND r.deadline > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date FOR UPDATE
        RETURNING id, rfq_id AS "rfqId", supplier_id AS "supplierId", price::text AS price, delivery_time AS "deliveryTime", message, status, created_at AS "createdAt"`,
        [randomUUID(), rfq.id, req.user.id, data.price, data.deliveryTime, data.message],
      );
      if (!rows[0]) throw new HttpError(409, 'This RFQ is no longer available for quotations.');
      res.status(201).json({ quotation: rows[0] });
    } catch (error) {
      if (error.code === '23505')
        throw new HttpError(409, 'You have already submitted a quotation for this RFQ.');
      throw error;
    }
  });
  router.patch('/quotations/:quotationId/status', supplier, async (req, res) => {
    const { status } = parse(withdrawQuotationSchema, req.body);
    const { rows } = await db.query('SELECT supplier_id FROM quotations WHERE id=$1', [
      req.params.quotationId,
    ]);
    if (!rows[0]) throw new HttpError(404, 'This quotation could not be found.');
    if (rows[0].supplier_id !== req.user.id)
      throw new HttpError(403, 'You can only withdraw your own quotations.');
    // Idempotent, ownership-scoped update also handles concurrent duplicate requests.
    const result = await db.query(
      `UPDATE quotations SET status=$1 WHERE id=$2 AND supplier_id=$3
      RETURNING id, status`,
      [status, req.params.quotationId, req.user.id],
    );
    if (!result.rows.length) throw new HttpError(404, 'This quotation no longer exists.');
    res.json({ quotation: result.rows[0] });
  });
  router.get('/quotations/my', supplier, async (req, res) => {
    const { rows } = await db.query(
      `SELECT ${quoteColumns}, r.product_name AS "productName", r.delivery_location AS "deliveryLocation"
      FROM quotations q JOIN rfqs r ON r.id=q.rfq_id WHERE q.supplier_id=$1`,
      [req.user.id],
    );
    res.json({ quotations: rows });
  });
  return router;
}
