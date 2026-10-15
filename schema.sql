CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  spec TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT 'New',
  image TEXT NOT NULL DEFAULT '',
  backImage TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_active_created ON products(is_active, created_at DESC);
