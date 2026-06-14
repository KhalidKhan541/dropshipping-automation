# Dropshipping Automation System

A complete Cloudflare Workers-based automation system for Pakistan dropshipping business.

## Features

- **TikTok Video Scheduler** - Schedule and auto-post videos to TikTok
- **WhatsApp AI Auto-Reply** - AI-powered customer service bot
- **Order Processor** - Manage orders, tracking, and customer notifications
- **Product Research Bot** - AI finds trending products daily
- **Analytics Dashboard** - Real-time business metrics

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare KV + R2
- **AI:** Cloudflare Workers AI (Llama 3)
- **Framework:** Hono.js

## Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- TikTok Developer account
- WhatsApp Business API access

## Quick Start

### 1. Clone and Install

```bash
cd C:\Webs\dropshipping-automation
npm install
```

### 2. Deploy to Cloudflare

```bash
# Run the deploy script
bash scripts/deploy.sh
```

Or manually:

```bash
# Create D1 database
wrangler d1 create dropshipping-db

# Create KV namespace
wrangler kv namespace create KV

# Update wrangler.toml with the IDs from output

# Run migrations
wrangler d1 execute dropshipping-db --file=./migrations/0001_init.sql
wrangler d1 execute dropshipping-db --file=./migrations/0002_seed.sql

# Deploy
wrangler deploy
```

### 3. Configure API Keys

Update `wrangler.toml` with your credentials:

```toml
[vars]
TIKTOK_CLIENT_KEY = "your_tiktok_key"
TIKTOK_CLIENT_SECRET = "your_tiktok_secret"
TIKTOK_ACCESS_TOKEN = "your_tiktok_token"
WHATSAPP_ACCESS_TOKEN = "your_whatsapp_token"
WHATSAPP_PHONE_NUMBER_ID = "your_phone_id"
WHATSAPP_VERIFY_TOKEN = "your_verify_token"
```

### 4. Set Up Webhooks

**WhatsApp Webhook:**
1. Go to Facebook Developer Portal
2. Set webhook URL to: `https://your-worker.workers.dev/api/whatsapp/webhook`
3. Set verify token to match your `WHATSAPP_VERIFY_TOKEN`

**TikTok:**
1. Create TikTok Developer app
2. Enable Content Posting API
3. Get access token

## API Endpoints

### TikTok Scheduler
- `GET /api/tiktok/videos` - List all videos
- `POST /api/tiktok/videos` - Schedule new video
- `PUT /api/tiktok/videos/:id` - Update video
- `DELETE /api/tiktok/videos/:id` - Delete video
- `POST /api/tiktok/post/:videoId` - Post to TikTok
- `GET /api/tiktok/analytics` - Video analytics

### WhatsApp Auto-Reply
- `GET /api/whatsapp/webhook` - Webhook verification
- `POST /api/whatsapp/webhook` - Incoming messages
- `GET /api/whatsapp/conversations` - Conversation history
- `POST /api/whatsapp/send` - Send manual message

### Orders
- `GET /api/orders/orders` - List orders
- `POST /api/orders/orders` - Create order
- `PUT /api/orders/orders/:id` - Update order
- `POST /api/orders/orders/:id/cancel` - Cancel order
- `GET /api/orders/stats` - Order statistics
- `GET /api/orders/today` - Today's orders

### Product Research
- `GET /api/research/products` - List researched products
- `POST /api/research/products` - Add product
- `POST /api/research/auto-research` - AI product discovery
- `POST /api/research/generate-script` - Generate video script

### Dashboard
- `GET /api/dashboard` - HTML dashboard
- `GET /api/analytics/stats` - Dashboard stats
- `GET /api/analytics/revenue-chart` - Revenue chart data
- `GET /api/analytics/top-products` - Top products

## Cron Jobs

The system runs these automatic tasks:

| Cron | Time (PKT) | Task |
|------|------------|------|
| `0 19 * * *` | 7:00 PM | Post scheduled TikTok videos |
| `0 8 * * *` | 8:00 AM | Daily product research |
| `0 */6 * * *` | Every 6 hours | Check order statuses |

## Database Schema

### Tables

- **products** - Your product catalog
- **orders** - Customer orders
- **customers** - Customer information
- **tiktok_videos** - Scheduled videos
- **whatsapp_conversations** - Chat history
- **product_research** - AI product suggestions
- **video_queue** - Video posting queue
- **analytics** - Daily metrics
- **settings** - Business configuration

## Development

### Local Development

```bash
# Start local dev server
npm run dev

# Access locally
# http://localhost:8787/api/dashboard
```

### Deploy Updates

```bash
wrangler deploy
```

### View Logs

```bash
wrangler tail
```

## Cost

**Free Tier Limits:**

| Service | Free Allowance | Your Usage |
|---------|---------------|------------|
| Workers | 100,000 req/day | ~500 req/day |
| D1 | 5GB storage | ~100MB |
| KV | 100,000 reads/day | ~1,000 reads |
| Workers AI | 10,000 neurons/day | ~1,000 neurons |

**Total Cost: $0/month** (within free tier)

## Troubleshooting

### Common Issues

**503 Error:**
- Check Cloudflare Tunnel configuration
- Ensure n8n/Worker is running
- Verify environment variables

**WhatsApp not responding:**
- Verify webhook URL is correct
- Check access token is valid
- Ensure phone number ID matches

**TikTok posting fails:**
- Verify access token hasn't expired
- Check video format requirements
- Ensure API permissions are granted

### Support

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- Hono.js Docs: https://hono.dev/
- D1 Docs: https://developers.cloudflare.com/d1/

## License

MIT
