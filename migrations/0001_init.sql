-- Dropshipping Automation Database Schema
-- Run: wrangler d1 execute dropshipping-db --file=./migrations/0001_init.sql

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  markaz_price INTEGER NOT NULL, -- Price in PKR (stored as integer, e.g., 500 = PKR 500)
  selling_price INTEGER NOT NULL,
  profit INTEGER NOT NULL,
  category TEXT,
  image_url TEXT,
  markaz_link TEXT,
  tiktok_hashtags TEXT, -- JSON array of hashtags
  status TEXT DEFAULT 'active', -- active, inactive, out_of_stock
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Scheduled TikTok videos
CREATE TABLE IF NOT EXISTS tiktok_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  video_url TEXT,
  caption TEXT,
  hashtags TEXT, -- JSON array
  scheduled_time TEXT NOT NULL, -- ISO 8601 format
  status TEXT DEFAULT 'pending', -- pending, posted, failed
  tiktok_post_id TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  whatsapp_id TEXT,
  tiktok_username TEXT,
  city TEXT,
  address TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  selling_price INTEGER NOT NULL,
  markaz_price INTEGER NOT NULL,
  profit INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, confirmed, shipped, delivered, cancelled, returned
  markaz_order_id TEXT,
  tracking_number TEXT,
  courier_name TEXT,
  payment_method TEXT DEFAULT 'cod', -- cod, easypaisa, jazzcash
  payment_status TEXT DEFAULT 'pending', -- pending, partial, paid, refunded
  advance_paid INTEGER DEFAULT 0,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- WhatsApp conversations
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  phone_number TEXT NOT NULL,
  message_in TEXT,
  message_out TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, template
  intent TEXT, -- price, order, delivery, complaint, other
  ai_generated INTEGER DEFAULT 1, -- 1 = AI replied, 0 = human replied
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Product research queue
CREATE TABLE IF NOT EXISTS product_research (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT NOT NULL,
  source TEXT, -- tiktok, aliexpress, markaz
  source_url TEXT,
  estimated_cost INTEGER,
  suggested_price INTEGER,
  trend_score INTEGER, -- 1-10
  reason TEXT,
  status TEXT DEFAULT 'new', -- new, reviewed, approved, rejected
  created_at TEXT DEFAULT (datetime('now'))
);

-- Daily analytics
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  total_orders INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0,
  total_profit INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  conversion_rate REAL DEFAULT 0,
  top_product_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Video queue for TikTok posting
CREATE TABLE IF NOT EXISTS video_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT DEFAULT 'queued', -- queued, posting, posted, failed
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES tiktok_videos(id)
);

-- Settings table for business configuration
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('business_name', 'PkGadgetHub'),
  ('currency', 'PKR'),
  ('whatsapp_auto_reply', 'true'),
  ('tiktok_posting_enabled', 'true'),
  ('default_delivery_days', '3-5'),
  ('cod_available', 'true'),
  ('advance_payment_required', '400');
