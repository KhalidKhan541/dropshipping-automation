// Product Research Bot Worker
// Automatically finds trending products and suggests them for your store

import { Hono } from 'hono';
import type { Env, ProductResearch, Product } from '../shared/types';
import {
  jsonResponse,
  errorResponse,
  successResponse,
  formatPrice,
} from '../shared/utils';

const app = new Hono<{ Bindings: Env }>();

// Predefined product categories and search terms for Pakistan market
const TRENDING_CATEGORIES = [
  {
    category: 'beauty',
    searchTerms: ['hair dye comb', 'auto curler', 'hair removal', 'face roller'],
    hashtags: ['beautyhack', 'haircare', 'skincare'],
  },
  {
    category: 'home',
    searchTerms: ['galaxy projector', 'led strip', 'smart lamp', 'mini vacuum'],
    hashtags: ['homedecor', 'roommakeover', 'aesthetic'],
  },
  {
    category: 'health',
    searchTerms: ['posture corrector', 'back support', 'massage gun', 'ice roller'],
    hashtags: ['health', 'wellness', 'glowup'],
  },
  {
    category: 'gadgets',
    searchTerms: ['phone holder', 'bluetooth speaker', 'smart watch', 'wireless charger'],
    hashtags: ['gadgets', 'tech', 'coolstuff'],
  },
  {
    category: 'fashion',
    searchTerms: ['jewelry set', 'sunglasses', 'watch', 'bag'],
    hashtags: ['fashion', 'style', 'accessories'],
  },
];

// Get all researched products
app.get('/products', async (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');

  let query = 'SELECT * FROM product_research';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return successResponse(results);
});

// Add a product to research queue
app.post('/products', async (c) => {
  const body = await c.req.json();
  const { product_name, source, source_url, estimated_cost, suggested_price, trend_score, reason } = body;

  if (!product_name) {
    return errorResponse('Product name is required');
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO product_research (product_name, source, source_url, estimated_cost, suggested_price, trend_score, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    product_name,
    source || 'manual',
    source_url || null,
    estimated_cost || null,
    suggested_price || null,
    trend_score || 5,
    reason || null
  ).run();

  return successResponse({ id: result.meta.last_row_id }, 'Product added to research');
});

// Update product research status
app.put('/products/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status, notes } = body;

  if (!status) return errorResponse('Status is required');

  await c.env.DB.prepare(
    'UPDATE product_research SET status = ? WHERE id = ?'
  ).bind(status, id).run();

  return successResponse(null, 'Product updated');
});

// Approve product and add to store
app.post('/products/:id/approve', async (c) => {
  const id = c.req.param('id');
  
  const research = await c.env.DB.prepare(
    'SELECT * FROM product_research WHERE id = ?'
  ).bind(id).first<ProductResearch>();

  if (!research) return errorResponse('Product not found');

  // Add to products table
  const result = await c.env.DB.prepare(
    `INSERT INTO products (name, description, markaz_price, selling_price, profit, category, tiktok_hashtags, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).bind(
    research.product_name,
    research.reason || '',
    research.estimated_cost || 0,
    research.suggested_price || 0,
    (research.suggested_price || 0) - (research.estimated_cost || 0),
    'general',
    JSON.stringify(TRENDING_CATEGORIES.find(c => c.category === 'general')?.hashtags || ['trending', 'viral'])
  ).run();

  // Update research status
  await c.env.DB.prepare(
    "UPDATE product_research SET status = 'approved' WHERE id = ?"
  ).bind(id).run();

  return successResponse({ product_id: result.meta.last_row_id }, 'Product added to store');
});

// Reject product
app.post('/products/:id/reject', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE product_research SET status = 'rejected' WHERE id = ?"
  ).bind(id).run();
  return successResponse(null, 'Product rejected');
});

// Auto-research: Use AI to find trending products
app.post('/auto-research', async (c) => {
  const body = await c.req.json();
  const { category, budget } = body;

  // Select categories to research
  const categoriesToResearch = category
    ? TRENDING_CATEGORIES.filter(c => c.category === category)
    : TRENDING_CATEGORIES;

  const suggestions: any[] = [];

  for (const cat of categoriesToResearch) {
    try {
      // Use AI to generate product suggestions
      const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: `You are a product research expert for Pakistani dropshipping market. 
            Suggest 3 trending products for the "${cat.category}" category that would sell well on TikTok in Pakistan.
            
            For each product, provide:
            - Product name (in English)
            - Why it's trending (1-2 sentences)
            - Estimated cost in PKR (wholesale)
            - Suggested selling price in PKR
            - Trend score (1-10)
            - Best hashtags for TikTok
            
            Budget constraint: Under PKR ${budget || 1000} cost price.
            
            Format as JSON array.`
          },
          {
            role: 'user',
            content: `Find trending ${cat.category} products for Pakistan TikTok market`
          }
        ],
        max_tokens: 1000,
      });

      const responseText = (aiResponse as any).response || '';
      
      // Try to parse JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const products = JSON.parse(jsonMatch[0]);
        suggestions.push(...products.map((p: any) => ({
          ...p,
          category: cat.category,
          source: 'ai_research',
          hashtags: cat.hashtags,
        })));
      }
    } catch (error) {
      console.error(`AI research failed for ${cat.category}:`, error);
    }
  }

  // Store suggestions in database
  for (const suggestion of suggestions) {
    await c.env.DB.prepare(
      `INSERT INTO product_research (product_name, source, estimated_cost, suggested_price, trend_score, reason, status)
       VALUES (?, 'ai_research', ?, ?, ?, ?, 'new')`
    ).bind(
      suggestion.name || suggestion.product_name,
      suggestion.estimated_cost || suggestion.cost || 0,
      suggestion.suggested_price || suggestion.price || 0,
      suggestion.trend_score || suggestion.score || 5,
      suggestion.why_trending || suggestion.reason || ''
    ).run();
  }

  return successResponse({ count: suggestions.length, suggestions });
});

// Get trending hashtags for TikTok
app.get('/hashtags', async (c) => {
  const hashtags = TRENDING_CATEGORIES.flatMap(cat => 
    cat.hashtags.map(tag => ({ tag, category: cat.category }))
  );
  return successResponse(hashtags);
});

// Get product suggestions for video creation
app.get('/suggestions', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, pr.reason as trend_reason
     FROM products p
     LEFT JOIN product_research pr ON p.name = pr.product_name
     WHERE p.status = 'active'
     ORDER BY RANDOM()
     LIMIT 5`
  ).all();
  return successResponse(results);
});

// Generate video script for a product
app.post('/generate-script', async (c) => {
  const body = await c.req.json();
  const { product_id } = body;

  const product = await c.env.DB.prepare(
    'SELECT * FROM products WHERE id = ?'
  ).bind(product_id).first<Product>();

  if (!product) return errorResponse('Product not found');

  try {
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are a TikTok video script writer for Pakistani dropshipping.
          Create a 15-30 second video script for this product.
          
          Rules:
          - Start with a strong hook (first 3 seconds)
          - Use Roman Urdu (Urdu in English script)
          - Include before/after or problem/solution format
          - End with clear CTA (Call to Action)
          - Mention price and COD availability
          
          Format:
          HOOK: [First 3 seconds text]
          PROBLEM: [What problem does this solve]
          SOLUTION: [How the product solves it]
          CTA: [Call to action]
          CAPTION: [TikTok caption]
          HASHTAGS: [5-7 relevant hashtags]`
        },
        {
          role: 'user',
          content: `Create a video script for: ${product.name}\nPrice: ${formatPrice(product.selling_price)}\nDescription: ${product.description}`
        }
      ],
      max_tokens: 500,
    });

    return successResponse({ script: (aiResponse as any).response });
  } catch (error) {
    return errorResponse('Failed to generate script');
  }
});

// Daily research summary
app.get('/daily-summary', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT 
       status,
       COUNT(*) as count,
       AVG(trend_score) as avg_trend_score
     FROM product_research
     WHERE DATE(created_at) = DATE('now')
     GROUP BY status`
  ).all();

  const topProducts = await c.env.DB.prepare(
    `SELECT * FROM product_research 
     WHERE status = 'new'
     ORDER BY trend_score DESC
     LIMIT 5`
  ).all();

  return successResponse({
    summary: results,
    top_products: topProducts,
  });
});

export default app;
