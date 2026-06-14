// Order Processor Worker
// Handles order creation, tracking, and management

import { Hono } from 'hono';
import type { Env, Order, Product, Customer, OrderCreateRequest } from '../shared/types';
import {
  jsonResponse,
  errorResponse,
  successResponse,
  formatPrice,
  orderConfirmationMessage,
  isValidPakistaniPhone,
  formatPhoneForWhatsApp,
} from '../shared/utils';

const app = new Hono<{ Bindings: Env }>();

// Get all orders with filters
app.get('/orders', async (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let query = `
    SELECT o.*, p.name as product_name, c.name as customer_name, c.phone_number
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    LEFT JOIN customers c ON o.customer_id = c.id
  `;
  const params: any[] = [];

  if (status) {
    query += ' WHERE o.status = ?';
    params.push(status);
  }

  query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return successResponse(results);
});

// Get single order by ID
app.get('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const order = await c.env.DB.prepare(
    `SELECT o.*, p.name as product_name, c.name as customer_name, c.phone_number
     FROM orders o
     LEFT JOIN products p ON o.product_id = p.id
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = ?`
  ).bind(id).first();

  if (!order) return errorResponse('Order not found');
  return successResponse(order);
});

// Create new order from customer request
app.post('/orders', async (c) => {
  const body = await c.req.json() as OrderCreateRequest;
  const { customer_name, customer_phone, customer_address, product_id, quantity = 1, payment_method = 'cod', advance_paid = 0 } = body;

  // Validate required fields
  if (!customer_name || !customer_phone || !customer_address || !product_id) {
    return errorResponse('Missing required fields: customer_name, customer_phone, customer_address, product_id');
  }

  if (!isValidPakistaniPhone(customer_phone)) {
    return errorResponse('Invalid Pakistani phone number');
  }

  // Get product details
  const product = await c.env.DB.prepare(
    'SELECT * FROM products WHERE id = ? AND status = 'active''
  ).bind(product_id).first<Product>();

  if (!product) return errorResponse('Product not found or inactive');

  // Calculate totals
  const selling_price = product.selling_price * quantity;
  const markaz_price = product.markaz_price * quantity;
  const profit = product.profit * quantity;

  // Get or create customer
  let customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE phone_number = ?'
  ).bind(customer_phone).first<Customer>();

  if (!customer) {
    const result = await c.env.DB.prepare(
      `INSERT INTO customers (phone_number, name, address) VALUES (?, ?, ?)`
    ).bind(customer_phone, customer_name, customer_address).run();

    customer = {
      id: result.meta.last_row_id as number,
      phone_number: customer_phone,
      name: customer_name,
      whatsapp_id: null,
      tiktok_username: null,
      city: null,
      address: customer_address,
      total_orders: 0,
      total_spent: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Create order
  const result = await c.env.DB.prepare(
    `INSERT INTO orders (
      customer_id, product_id, quantity, selling_price, markaz_price, profit,
      status, payment_method, payment_status, advance_paid,
      customer_name, customer_phone, customer_address
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
  ).bind(
    customer.id, product_id, quantity, selling_price, markaz_price, profit,
    payment_method, advance_paid > 0 ? 'partial' : 'pending', advance_paid,
    customer_name, customer_phone, customer_address
  ).run();

  const orderId = result.meta.last_row_id;

  // Update customer order count
  await c.env.DB.prepare(
    `UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?`
  ).bind(selling_price, customer.id).run();

  // Send order confirmation via WhatsApp
  try {
    const confirmationMsg = orderConfirmationMessage(orderId as number, product.name);
    await fetch(
      `https://graph.facebook.com/v18.0/${c.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formatPhoneForWhatsApp(customer_phone),
          type: 'text',
          text: { body: confirmationMsg },
        }),
      }
    );
  } catch (error) {
    console.error('Failed to send confirmation:', error);
  }

  return successResponse({
    order_id: orderId,
    selling_price,
    markaz_price,
    profit,
    status: 'pending'
  }, 'Order created successfully');
});

// Update order status
app.put('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status, tracking_number, courier_name, markaz_order_id, notes } = body;

  const updates: string[] = ['updated_at = datetime('now')'];
  const values: any[] = [];

  if (status) { updates.push('status = ?'); values.push(status); }
  if (tracking_number) { updates.push('tracking_number = ?'); values.push(tracking_number); }
  if (courier_name) { updates.push('courier_name = ?'); values.push(courier_name); }
  if (markaz_order_id) { updates.push('markaz_order_id = ?'); values.push(markaz_order_id); }
  if (notes) { updates.push('notes = ?'); values.push(notes); }

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  // Get order for notification
  const order = await c.env.DB.prepare(
    'SELECT * FROM orders WHERE id = ?'
  ).bind(id).first<Order>();

  if (order) {
    // Send status update to customer
    let statusMessage = '';
    switch (status) {
      case 'confirmed':
        statusMessage = `Aapka order #${id} confirm ho gaya! Abhi process ho raha hai.`;
        break;
      case 'shipped':
        statusMessage = `Aapka order #${id} ship ho gaya! Tracking: ${tracking_number || 'Coming soon'}. Courier: ${courier_name || 'TBD'}`;
        break;
      case 'delivered':
        statusMessage = `Aapka order #${id} deliver ho gaya! Payment: ${formatPrice(order.selling_price)}. Shukriya!`;
        break;
      case 'cancelled':
        statusMessage = `Aapka order #${id} cancel kar diya gaya hai.`;
        break;
    }

    if (statusMessage && order.customer_phone) {
      try {
        await fetch(
          `https://graph.facebook.com/v18.0/${c.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${c.env.WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: formatPhoneForWhatsApp(order.customer_phone),
              type: 'text',
              text: { body: statusMessage },
            }),
          }
        );
      } catch (error) {
        console.error('Failed to send status update:', error);
      }
    }
  }

  return successResponse(null, 'Order updated successfully');
});

// Cancel order
app.post('/orders/:id/cancel', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();
  return successResponse(null, 'Order cancelled');
});

// Get order statistics
app.get('/stats', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT 
       COUNT(*) as total_orders,
       SUM(CASE WHEN status = 'delivered' THEN selling_price ELSE 0 END) as total_revenue,
       SUM(CASE WHEN status = 'delivered' THEN profit ELSE 0 END) as total_profit,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
       SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
       AVG(CASE WHEN status = 'delivered' THEN selling_price ELSE NULL END) as avg_order_value
     FROM orders`
  ).all();
  return successResponse(results[0]);
});

// Get today's orders
app.get('/today', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.*, p.name as product_name
     FROM orders o
     LEFT JOIN products p ON o.product_id = p.id
     WHERE DATE(o.created_at) = DATE('now')
     ORDER BY o.created_at DESC`
  ).all();
  return successResponse(results);
});

// Get orders by status for dashboard
app.get('/by-status', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT 
       status,
       COUNT(*) as count,
       SUM(selling_price) as total_value
     FROM orders
     GROUP BY status`
  ).all();
  return successResponse(results);
});

// Place order on Markaz (manual trigger)
app.post('/orders/:id/place-markaz', async (c) => {
  const id = c.req.param('id');
  
  const order = await c.env.DB.prepare(
    `SELECT o.*, p.name as product_name, p.markaz_link
     FROM orders o
     LEFT JOIN products p ON o.product_id = p.id
     WHERE o.id = ?`
  ).bind(id).first();

  if (!order) return errorResponse('Order not found');

  // In production, this would call Markaz API
  // For now, we'll mark it as confirmed and provide instructions
  await c.env.DB.prepare(
    "UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  return successResponse({
    order_id: id,
    product_name: order.product_name,
    markaz_link: order.markaz_link,
    customer_name: order.customer_name,
    customer_address: order.customer_address,
    instructions: 'Manually place this order on Markaz app using the link above'
  }, 'Order marked for Markaz placement');
});

// Get daily sales report
app.get('/report/daily', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT 
       DATE(created_at) as date,
       COUNT(*) as orders,
       SUM(selling_price) as revenue,
       SUM(profit) as profit
     FROM orders
     WHERE status != 'cancelled'
     GROUP BY DATE(created_at)
     ORDER BY date DESC
     LIMIT 30`
  ).all();
  return successResponse(results);
});

export default app;
