const crypto = require('crypto');

// API_KEYS es un JSON: { "<token>": { "role": "admin" | "customer", "customerId": 123 } }
function loadKeys() {
  try {
    return Object.entries(JSON.parse(process.env.API_KEYS || '{}'));
  } catch (err) {
    console.error('API_KEYS inválido; no se aceptará ningún token');
    return [];
  }
}

const keys = loadKeys();

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const entry = keys.find(([token]) => safeEqual(token, match[1]));
  if (!entry) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { role, customerId } = entry[1];
  req.user = { role, customerId: customerId != null ? String(customerId) : null };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function canAccessCustomer(user, customerId) {
  return user.role === 'admin' || (user.customerId !== null && user.customerId === String(customerId));
}

module.exports = { authenticate, requireAdmin, canAccessCustomer };
