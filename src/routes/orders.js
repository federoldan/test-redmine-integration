const express = require('express');
const db = require('../db');
const { canAccessCustomer } = require('../auth');

const router = express.Router();

const MAX_ITEMS = 100;
const MAX_QUANTITY = 10000;

router.get('/customer/:customerId', async (req, res, next) => {
  try {
    if (!canAccessCustomer(req.user, req.params.customerId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await db.query(
      `SELECT o.id, o.total, o.status, o.created_at
         FROM orders o
        WHERE o.customer_id = $1
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.params.customerId, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'items must be a non-empty array';
  }
  if (items.length > MAX_ITEMS) {
    return `items cannot exceed ${MAX_ITEMS}`;
  }
  for (const item of items) {
    if (item === null || typeof item !== 'object') {
      return 'each item must be an object';
    }
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      return 'productId must be a positive integer';
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_QUANTITY) {
      return `quantity must be an integer between 1 and ${MAX_QUANTITY}`;
    }
  }
  return null;
}

router.post('/', async (req, res, next) => {
  const { customerId, items } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required' });
  }
  const itemsError = validateItems(items);
  if (itemsError) {
    return res.status(400).json({ error: itemsError });
  }
  if (!canAccessCustomer(req.user, customerId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    // El precio sale de la base, nunca del cliente.
    const productIds = [...new Set(items.map((i) => i.productId))];
    const { rows: products } = await client.query(
      'SELECT id, price FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );
    const priceById = new Map(products.map((p) => [p.id, Number(p.price)]));
    const missing = productIds.filter((id) => !priceById.has(id));
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `unknown products: ${missing.join(', ')}` });
    }

    const lines = items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      price: priceById.get(i.productId),
    }));
    const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

    const { rows } = await client.query(
      'INSERT INTO orders (customer_id, total, status) VALUES ($1, $2, $3) RETURNING id',
      [customerId, total, 'pending']
    );
    const orderId = rows[0].id;

    // Un solo INSERT multi-fila en lugar de uno por ítem.
    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, price)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::numeric[])`,
      [
        orderId,
        lines.map((l) => l.productId),
        lines.map((l) => l.quantity),
        lines.map((l) => l.price),
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: orderId, total });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('ROLLBACK failed', rollbackErr);
      }
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
