const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_OFFSET = 100000;

// Devuelve un entero en [min, max]. Ausente, vacío, 0 o no finito (NaN, Infinity) usa el default.
function clampInt(value, def, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return def;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n === 0) return def;
  return Math.min(Math.max(n, min), max);
}

function parsePagination(query = {}) {
  const limit = clampInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(query.offset, 0, 0, MAX_OFFSET);
  return { limit, offset };
}

module.exports = { parsePagination };
