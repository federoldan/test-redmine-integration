const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePagination(query = {}) {
  const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Math.trunc(Number(query.offset)) || 0, 0);
  return { limit, offset };
}

module.exports = { parsePagination };
