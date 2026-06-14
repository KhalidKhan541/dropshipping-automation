// Main Entry Point - Dropshipping Automation System
// Cloudflare Workers + D1 + KV + R2 + Workers AI

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './shared/types';
import tiktokScheduler from './tiktok-scheduler';
import whatsappAutoReply from './whatsapp-auto-reply';
import orderProcessor from './order-processor';
import productResearch from './product-research';
import analyticsDashboard from './analytics-dashboard';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors());

// API Routes
app.route('/api/tiktok', tiktokScheduler);
app.route('/api/whatsapp', whatsappAutoReply);
app.route('/api/orders', orderProcessor);
app.route('/api/research', productResearch);
app.route('/api/analytics', analyticsDashboard);
app.route('/api/dashboard', analyticsDashboard);

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cron handler for scheduled tasks
async function handleCron(env: Env, cron: string): Promise<void> {
  const pakistanTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const hour = pakistanTime.getHours();

  switch (cron) {
    // TikTok posting: 7 PM PKT daily
    case '0 19 * * *':
      await handleTikTokPosting(env);
      break;

    // Product research: 8 AM PKT daily
    case '0 8 * * *':
      await handleDailyProductResearch(env);
      break;

    // Order status check: every 6 hours
    case '0 */6 * * *':
      await handleOrderStatusCheck(env);
      break;
  }
}

// Handle TikTok video posting
async function handleTikTokPosting(env: Env): Promise<void> {
  console.log('Running TikTok posting cron...');

  // Get videos due for posting
  const { results: dueVideos } = await env.DB.prepare(
    `SELECT v.*, p.name as product_name, p.tiktok_hashtags
     FROM video_queue q
     JOIN tiktok_videos v ON q.video_id = v.id
     LEFT JOIN products p ON v.product_id = p.id
     WHERE q.status = 'queued' AND q.scheduled_for <= datetime('now')
     LIMIT 5`
  ).all();

  for (const video of dueVideos) {
    try {
      // Mark as posting
      await env.DB.prepare(
        "UPDATE video_queue SET status = 'posting' WHERE video_id = ?"
      ).bind(video.video_id).run();

      // Post to TikTok (API call would go here)
      // For now, mark as posted
      await env.DB.prepare(
        "UPDATE tiktok_videos SET status = 'posted' WHERE id = ?"
      ).bind(video.video_id).run();

      await env.DB.prepare(
        "UPDATE video_queue SET status = 'posted' WHERE video_id = ?"
      ).bind(video.video_id).run();

      console.log(`Posted video ${video.video_id}`);
    } catch (error) {
      console.error(`Failed to post video ${video.video_id}:`, error);
      await env.DB.prepare(
        "UPDATE video_queue SET status = 'failed', error_message = ? WHERE video_id = ?"
      ).bind((error as Error).message, video.video_id).run();
    }
  }
}

// Handle daily product research
async function handleDailyProductResearch(env: Env): Promise<void> {
  console.log('Running daily product research...');

  // Use AI to find trending products
  const categories = ['beauty', 'home', 'health', 'gadgets'];

  for (const category of categories) {
    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: `You are a product research expert for Pakistani dropshipping. 
            Suggest 2 trending products for the "${category}" category.
            Budget: Under PKR 1000 cost.
            Return JSON array with: name, estimated_cost, suggested_price, trend_score (1-10), reason`
          },
          {
            role: 'user',
            content: `Find trending ${category} products for Pakistan`
          }
        ],
        max_tokens: 500,
      });

      const responseText = (aiResponse as any).response || '';
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);

      if (jsonMatch) {
        const products = JSON.parse(jsonMatch[0]);
        for (const product of products) {
          await env.DB.prepare(
            `INSERT INTO product_research (product_name, source, estimated_cost, suggested_price, trend_score, reason, status)
             VALUES (?, 'ai_daily', ?, ?, ?, ?, 'new')`
          ).bind(
            product.name,
            product.estimated_cost || 500,
            product.suggested_price || 1200,
            product.trend_score || 5,
            product.reason || ''
          ).run();
        }
      }
    } catch (error) {
      console.error(`Research failed for ${category}:`, error);
    }
  }
}

// Handle order status checks
async function handleOrderStatusCheck(env: Env): Promise<void> {
  console.log('Running order status check...');

  // Check for orders that need attention
  const { results: pendingOrders } = await env.DB.prepare(
    `SELECT * FROM orders 
     WHERE status = 'pending' 
     AND created_at < datetime('now', '-24 hours')`
  ).all();

  console.log(`Found ${pendingOrders.length} orders pending for 24+ hours`);

  // Could send notifications or auto-cancel stale orders
}

// Export D1 migration for setup
export { handleCron };

// Main request handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env, controller.cron));
  },
};
