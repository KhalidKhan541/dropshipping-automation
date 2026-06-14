-- Seed data for initial products
-- Run: wrangler d1 execute dropshipping-db --file=./migrations/0002_seed.sql

INSERT OR IGNORE INTO products (name, description, markaz_price, selling_price, profit, category, tiktok_hashtags, status) VALUES
  (
    'Hair Dye Comb - Mess Free Grey Coverage',
    'Ghar pe salon jaisa result. 5 minute mein apply. Reusable.',
    550,
    1399,
    849,
    'beauty',
    '["hairdyecomb", "pakistanproducts", "greyhair", "onlineshopping", "cod", "beautyhack"]',
    'active'
  ),
  (
    'Starry Sky Galaxy Projector Lamp',
    '8+ galaxy effects. Remote control. Bluetooth speaker. Timer.',
    650,
    1499,
    849,
    'home',
    '["galaxyprojector", "roommakeover", "pakistan", "aesthetic", "nightlight", "bedroomdecor"]',
    'active'
  ),
  (
    'Smart Posture Corrector with Vibration',
    'Sensor detects slouching. Vibration alert. USB rechargeable.',
    450,
    1299,
    849,
    'health',
    '["posturecorrector", "glowup", "pakistan", "health", "techneckfix", "backpain"]',
    'active'
  );

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('tiktok_post_times', '["19:00", "20:00", "21:00"]'),
  ('whatsapp_greeting', 'Assalam o Alaikum! PkGadgetHub mein khush amdeed. Kya help karoon?'),
  ('order_confirmation_template', 'Order confirm ho gaya! 3-5 din mein delivery ho jayegi. Jab rider aaye, cash payment karein.');
