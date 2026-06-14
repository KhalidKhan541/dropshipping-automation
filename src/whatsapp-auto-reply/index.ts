// WhatsApp AI Auto-Reply Worker
// Handles incoming WhatsApp messages and sends AI-powered responses

import { Hono } from 'hono';
import type { Env, Product, Customer } from '../shared/types';
import {
  jsonResponse,
  errorResponse,
  successResponse,
  detectIntent,
  generateResponse,
  priceListMessage,
  formatPhoneForWhatsApp,
  isValidPakistaniPhone,
} from '../shared/utils';

const app = new Hono<{ Bindings: Env }>();

// WhatsApp webhook verification
app.get('/webhook', (c) => {
  const verifyToken = c.env.WHATSAPP_VERIFY_TOKEN;
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }
  return errorResponse('Forbidden', 403);
});

// WhatsApp webhook for incoming messages
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();

    // Validate webhook payload
    if (body.object !== 'whatsapp_business_account') {
      return new Response('OK', { status: 200 });
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === 'messages') {
          const value = change.value;
          const messages = value.messages || [];
          const contacts = value.contacts || [];

          for (const message of messages) {
            await handleMessage(c.env, message, contacts[0]);
          }
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200 }); // Always return 200 to WhatsApp
  }
});

// Handle incoming WhatsApp message
async function handleMessage(env: Env, message: any, contact: any) {
  const phoneNumber = message.from;
  const messageType = message.type;
  let messageText = '';

  // Extract message text based on type
  if (messageType === 'text') {
    messageText = message.text.body;
  } else if (messageType === 'image') {
    messageText = '[Image received]';
  } else if (messageType === 'button') {
    messageText = message.button.text;
  } else if (messageType === 'interactive') {
    messageText = message.interactive.button_reply?.title || message.interactive.list_reply?.title || '';
  }

  if (!messageText) return;

  // Get or create customer
  let customer = await env.DB.prepare(
    'SELECT * FROM customers WHERE phone_number = ?'
  ).bind(phoneNumber).first<Customer>();

  if (!customer) {
    const result = await env.DB.prepare(
      `INSERT INTO customers (phone_number, name, whatsapp_id) VALUES (?, ?, ?)`
    ).bind(phoneNumber, contact?.profile?.name || null, phoneNumber).run();
    
    customer = {
      id: result.meta.last_row_id as number,
      phone_number: phoneNumber,
      name: contact?.profile?.name || null,
      whatsapp_id: phoneNumber,
      tiktok_username: null,
      city: null,
      address: null,
      total_orders: 0,
      total_spent: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Detect intent
  const intent = detectIntent(messageText);

  // Get active products
  const { results: products } = await env.DB.prepare(
    'SELECT * FROM products WHERE status = 'active' LIMIT 10'
  ).all<Product>();

  // Generate response using AI or rule-based system
  let responseText: string;

  // Check if AI is enabled
  const aiSetting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'whatsapp_auto_reply'"
  ).first<{ value: string }>();

  if (aiSetting?.value === 'true') {
    // Use Cloudflare Workers AI for smart responses
    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: `You are a helpful customer service agent for ${env.BUSINESS_NAME}, a Pakistani online store selling gadgets. 
            Reply in Roman Urdu (Urdu written in English script). Be friendly and concise.
            Products available:
            ${products.map(p => `- ${p.name}: PKR ${p.selling_price}`).join('\n')}
            
            Rules:
            - For price inquiries, list products with prices
            - For orders, ask for name, phone, address
            - For delivery questions, say 3-5 days
            - For complaints, ask for order details
            - Always mention COD is available
            - Keep responses under 100 words`
          },
          {
            role: 'user',
            content: messageText
          }
        ],
        max_tokens: 200,
      });

      responseText = (aiResponse as any).response || generateResponse(intent, products, messageText);
    } catch {
      // Fallback to rule-based response
      responseText = generateResponse(intent, products, messageText);
    }
  } else {
    // Rule-based response
    responseText = generateResponse(intent, products, messageText);
  }

  // Log conversation
  await env.DB.prepare(
    `INSERT INTO whatsapp_conversations (customer_id, phone_number, message_in, message_out, message_type, intent, ai_generated)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).bind(customer.id, phoneNumber, messageText, responseText, messageType, intent).run();

  // Send reply via WhatsApp API
  await sendWhatsAppMessage(env, phoneNumber, responseText);
}

// Send WhatsApp message via Cloud API
async function sendWhatsAppMessage(env: Env, to: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formatPhoneForWhatsApp(to),
          type: 'text',
          text: { body: message },
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    return false;
  }
}

// Get conversation history
app.get('/conversations/:phone', async (c) => {
  const phone = c.req.param('phone');
  const { results } = await env.DB.prepare(
    'SELECT * FROM whatsapp_conversations WHERE phone_number = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(phone).all();
  return successResponse(results);
});

// Get all conversations summary
app.get('/conversations', async (c) => {
  const { results } = await env.DB.prepare(
    `SELECT 
       phone_number,
       MAX(message_in) as last_message,
       MAX(created_at) as last_time,
       COUNT(*) as message_count
     FROM whatsapp_conversations
     GROUP BY phone_number
     ORDER BY last_time DESC
     LIMIT 100`
  ).all();
  return successResponse(results);
});

// Send manual message to customer
app.post('/send', async (c) => {
  const body = await c.req.json();
  const { phone, message } = body;

  if (!phone || !message) {
    return errorResponse('Phone and message are required');
  }

  const sent = await sendWhatsAppMessage(c.env, phone, message);

  if (sent) {
    // Log the message
    await c.env.DB.prepare(
      `INSERT INTO whatsapp_conversations (phone_number, message_out, message_type, ai_generated)
       VALUES (?, ?, 'text', 0)`
    ).bind(phone, message).run();

    return successResponse(null, 'Message sent successfully');
  } else {
    return errorResponse('Failed to send message');
  }
});

// Get AI settings
app.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM settings WHERE key LIKE 'whatsapp_%'"
  ).all();
  return successResponse(results);
});

// Update AI settings
app.put('/settings', async (c) => {
  const body = await c.req.json();
  
  for (const [key, value] of Object.entries(body)) {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))'
    ).bind(key, String(value)).run();
  }

  return successResponse(null, 'Settings updated');
});

export default app;
