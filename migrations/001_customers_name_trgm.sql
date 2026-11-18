-- Índice trigram para búsquedas ILIKE '%texto%' sobre customers.name
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);
