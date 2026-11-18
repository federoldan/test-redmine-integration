const express = require('express');
const db = require('../db');
const { parsePagination } = require('../pagination');

const router = express.Router();

const ALLOWED_SORT = ['name', 'created_at', 'email'];

router.get('/', async (req, res, next) => {
  try {
    const sort = ALLOWED_SORT.includes(req.query.sort) ? req.query.sort : 'created_at';
    const { limit } = parsePagination(req.query);

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

    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'name is required (min 2 characters)' });
    }
    if (status !== undefined && typeof status !== 'string') {
      return res.status(400).json({ error: 'status must be a string' });
    }

    const { limit, offset } = parsePagination(req.query);

    // Escapar comodines de LIKE para que el usuario no los controle.
    // El índice trigram (migrations/001_customers_name_trgm.sql) evita el seq scan.
    const pattern = `%${name.trim().replace(/[\\%_]/g, '\\$&')}%`;
    let sql = `SELECT id, name, email, status FROM customers WHERE name ILIKE $1`;
    const params = [pattern];
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    params.push(limit, offset);
    sql += ` ORDER BY name LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await db.query(sql, params);
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
