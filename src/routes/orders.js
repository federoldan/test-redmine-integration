const express = require('express');
const db = require('../db');
const { canAccessCustomer } = require('../auth');
const { parsePagination } = require('../pagination');

const router = express.Router();

const MAX_ITEMS = 100;
const MAX_QUANTITY = 10000;

class BadRequestError extends Error {}

router.get('/customer/:customerId', async (req, res, next) => {
  try {
    if (!canAccessCustomer(req.user, req.params.customerId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { limit, offset } = parsePagination(req.query);

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

function isValidCustomerId(value) {
  return (
    (Number.isInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9]\d*$/.test(value))
  );
}

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

// Convierte un numeric de Postgres (string) a centavos enteros para evitar errores de float.
function toCents(price) {
  return Math.round(Number(price) * 100);
}

router.post('/', async (req, res, next) => {
  let client;
  try {
    const { customerId, items } = req.body || {};

    if (!isValidCustomerId(customerId)) {
      return res.status(400).json({ error: 'customerId must be a positive integer' });
    }
    const itemsError = validateItems(items);
    if (itemsError) {
      return res.status(400).json({ error: itemsError });
    }
    if (!canAccessCustomer(req.user, customerId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    client = await db.pool.connect();
    await client.query('BEGIN');

    // El precio sale de la base, nunca del cliente.
    const productIds = [...new Set(items.map((i) => i.productId))];
    const { rows: products } = await client.query(
      'SELECT id, price FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );
    const centsById = new Map(products.map((p) => [p.id, toCents(p.price)]));
    const missing = productIds.filter((id) => !centsById.has(id));
    if (missing.length > 0) {
      // El ROLLBACK lo hace el catch, protegido.
      throw new BadRequestError(`unknown products: ${missing.join(', ')}`);
    }

    const lines = items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      cents: centsById.get(i.productId),
    }));
    const totalCents = lines.reduce((sum, l) => sum + l.cents * l.quantity, 0);
    const total = (totalCents / 100).toFixed(2);

    const { rows } = await client.query(
      'INSERT INTO orders (customer_id, total, status) VALUES ($1, $2::numeric, $3) RETURNING id',
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
        lines.map((l) => (l.cents / 100).toFixed(2)),
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
    if (err instanceof BadRequestError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
