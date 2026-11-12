const express = require('express');
const db = require('../db');

const router = express.Router();

const ALLOWED_SORT = ['name', 'created_at', 'email'];

router.get('/', async (req, res, next) => {
  try {
    const sort = ALLOWED_SORT.includes(req.query.sort) ? req.query.sort : 'created_at';
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const { rows } = await db.query(
      `SELECT id, name, email, created_at FROM customers ORDER BY ${sort} DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { name, status } = req.query;

    let sql = `SELECT id, name, email, status FROM customers WHERE name ILIKE '%${name}%'`;
    if (status) {
      sql += ` AND status = '${status}'`;
    }

    const { rows } = await db.query(sql);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, status, created_at FROM customers WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
