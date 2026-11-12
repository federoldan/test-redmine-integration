const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/customer/:customerId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT o.id, o.total, o.status, o.created_at
         FROM orders o
        WHERE o.customer_id = $1
        ORDER BY o.created_at DESC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { customerId, items } = req.body;

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'customerId and items are required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const { rows } = await client.query(
      'INSERT INTO orders (customer_id, total, status) VALUES ($1, $2, $3) RETURNING id',
      [customerId, total, 'pending']
    );
    const orderId = rows[0].id;

    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [orderId, item.productId, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: orderId, total });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
