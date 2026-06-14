// Analytics Dashboard Worker
// Provides analytics, reports, and dashboard data

import { Hono } from 'hono';
import { html } from 'hono/html';
import type { Env, Order, Product, TikTokVideo } from '../shared/types';
import { successResponse, formatPrice } from '../shared/utils';

const app = new Hono<{ Bindings: Env }>();

// Get dashboard stats
app.get('/stats', async (c) => {
  const [
    orders,
    products,
    videos,
    customers,
  ] = await Promise.all([
    c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'delivered' THEN selling_price ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'delivered' THEN profit ELSE 0 END) as profit
      FROM orders
    `).first(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM products WHERE status = 'active'').first(),
    c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(views) as total_views,
        SUM(likes) as total_likes
      FROM tiktok_videos WHERE status = 'posted'
    `).first(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM customers').first(),
  ]);

  return successResponse({
    orders,
    products,
    videos,
    customers,
  });
});

// Get revenue chart data (last 30 days)
app.get('/revenue-chart', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      DATE(created_at) as date,
      SUM(selling_price) as revenue,
      SUM(profit) as profit,
      COUNT(*) as orders
    FROM orders
    WHERE status = 'delivered'
      AND created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all();
  return successResponse(results);
});

// Get top products
app.get('/top-products', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      p.id,
      p.name,
      p.selling_price,
      COUNT(o.id) as order_count,
      SUM(o.selling_price) as total_revenue,
      SUM(o.profit) as total_profit
    FROM products p
    LEFT JOIN orders o ON p.id = o.product_id AND o.status = 'delivered'
    GROUP BY p.id
    ORDER BY total_revenue DESC
    LIMIT 10
  `).all();
  return successResponse(results);
});

// Get recent orders
app.get('/recent-orders', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const { results } = await c.env.DB.prepare(`
    SELECT o.*, p.name as product_name
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    ORDER BY o.created_at DESC
    LIMIT ?
  `).bind(limit).all();
  return successResponse(results);
});

// Get TikTok performance
app.get('/tiktok-performance', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      DATE(scheduled_time) as date,
      COUNT(*) as videos_posted,
      SUM(views) as total_views,
      SUM(likes) as total_likes,
      SUM(comments) as total_comments,
      SUM(shares) as total_shares
    FROM tiktok_videos
    WHERE status = 'posted'
    GROUP BY DATE(scheduled_time)
    ORDER BY date DESC
    LIMIT 30
  `).all();
  return successResponse(results);
});

// Get WhatsApp stats
app.get('/whatsapp-stats', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      intent,
      COUNT(*) as count,
      AVG(CASE WHEN ai_generated = 1 THEN 1 ELSE 0 END) * 100 as ai_response_rate
    FROM whatsapp_conversations
    WHERE DATE(created_at) = DATE('now')
    GROUP BY intent
  `).all();
  return successResponse(results);
});

// HTML Dashboard page
app.get('/', async (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dropshipping Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .card { @apply bg-white rounded-lg shadow-md p-6; }
        .stat-card { @apply bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-lg p-6; }
      </style>
    </head>
    <body class="bg-gray-100 min-h-screen">
      <div class="container mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-8 text-gray-800">Dropshipping Dashboard</h1>
        
        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div class="stat-card">
            <h3 class="text-lg opacity-90">Total Orders</h3>
            <p class="text-4xl font-bold" id="total-orders">-</p>
          </div>
          <div class="stat-card">
            <h3 class="text-lg opacity-90">Revenue</h3>
            <p class="text-4xl font-bold" id="total-revenue">-</p>
          </div>
          <div class="stat-card">
            <h3 class="text-lg opacity-90">Profit</h3>
            <p class="text-4xl font-bold" id="total-profit">-</p>
          </div>
          <div class="stat-card">
            <h3 class="text-lg opacity-90">Active Products</h3>
            <p class="text-4xl font-bold" id="active-products">-</p>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div class="card">
            <h2 class="text-xl font-semibold mb-4">Revenue (Last 30 Days)</h2>
            <canvas id="revenue-chart"></canvas>
          </div>
          <div class="card">
            <h2 class="text-xl font-semibold mb-4">Order Status</h2>
            <canvas id="status-chart"></canvas>
          </div>
        </div>

        <!-- Recent Orders & Top Products -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card">
            <h2 class="text-xl font-semibold mb-4">Recent Orders</h2>
            <div id="recent-orders" class="space-y-3">
              Loading...
            </div>
          </div>
          <div class="card">
            <h2 class="text-xl font-semibold mb-4">Top Products</h2>
            <div id="top-products" class="space-y-3">
              Loading...
            </div>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>
        // Load dashboard data
        async function loadDashboard() {
          try {
            const [stats, revenue, orders, products] = await Promise.all([
              fetch('/api/stats').then(r => r.json()),
              fetch('/api/revenue-chart').then(r => r.json()),
              fetch('/api/recent-orders').then(r => r.json()),
              fetch('/api/top-products').then(r => r.json()),
            ]);

            // Update stats
            document.getElementById('total-orders').textContent = stats.data?.orders?.total || 0;
            document.getElementById('total-revenue').textContent = 'PKR ' + (stats.data?.orders?.revenue || 0).toLocaleString();
            document.getElementById('total-profit').textContent = 'PKR ' + (stats.data?.orders?.profit || 0).toLocaleString();
            document.getElementById('active-products').textContent = stats.data?.products?.total || 0;

            // Revenue chart
            const revenueData = revenue.data || [];
            new Chart(document.getElementById('revenue-chart'), {
              type: 'line',
              data: {
                labels: revenueData.map(d => d.date),
                datasets: [{
                  label: 'Revenue',
                  data: revenueData.map(d => d.revenue),
                  borderColor: 'rgb(99, 102, 241)',
                  tension: 0.1
                }, {
                  label: 'Profit',
                  data: revenueData.map(d => d.profit),
                  borderColor: 'rgb(34, 197, 94)',
                  tension: 0.1
                }]
              }
            });

            // Recent orders
            const ordersHtml = (orders.data || []).map(o => 
              '<div class="flex justify-between items-center p-3 bg-gray-50 rounded">' +
              '<div><span class="font-medium">#' + o.id + '</span> - ' + (o.product_name || 'N/A') + '</div>' +
              '<div class="text-right"><span class="font-bold">PKR ' + o.selling_price + '</span><br><span class="text-sm text-gray-500">' + o.status + '</span></div></div>'
            ).join('');
            document.getElementById('recent-orders').innerHTML = ordersHtml || 'No orders yet';

            // Top products
            const productsHtml = (products.data || []).map(p =>
              '<div class="flex justify-between items-center p-3 bg-gray-50 rounded">' +
              '<div><span class="font-medium">' + p.name + '</span></div>' +
              '<div class="text-right"><span class="font-bold">PKR ' + (p.total_revenue || 0) + '</span><br><span class="text-sm text-gray-500">' + (p.order_count || 0) + ' orders</span></div></div>'
            ).join('');
            document.getElementById('top-products').innerHTML = productsHtml || 'No products yet';

          } catch (error) {
            console.error('Dashboard error:', error);
          }
        }

        loadDashboard();
        setInterval(loadDashboard, 60000); // Refresh every minute
      </script>
    </body>
    </html>
  `);
});

export default app;
