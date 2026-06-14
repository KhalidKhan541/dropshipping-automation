// Shared utility functions

import type { Env } from './types';

// Format price in PKR
export function formatPrice(amount: number): string {
  return `PKR ${amount.toLocaleString('en-PK')}`;
}

// Generate order confirmation message
export function orderConfirmationMessage(orderId: number, productName: string): string {
  return `Order #${orderId} confirm ho gaya!\n\nProduct: ${productName}\nDelivery: 3-5 din\nPayment: Cash on Delivery\n\nJab rider aaye, ${formatPrice(0)} cash dena.\n\nShukriya! - ${'PkGadgetHub'}`;
}

// Generate price list message
export function priceListMessage(products: Array<{ name: string; selling_price: number }>): string {
  let msg = 'Hamare best products:\n\n';
  products.forEach((p, i) => {
    msg += `${i + 1}. ${p.name} - ${formatPrice(p.selling_price)}\n`;
  });
  msg += '\nCOD available hai!\nOrder ke liye naam, phone, address bhejein.';
  return msg;
}

// Detect customer intent from message
export function detectIntent(message: string): 'price' | 'order' | 'delivery' | 'complaint' | 'other' {
  const lower = message.toLowerCase();
  
  if (lower.match(/price|kitne|rate|cost|kitna|mahenga|sasta/)) {
    return 'price';
  }
  if (lower.match(/order|lena|khareedna|buy|purchase|chahiye/)) {
    return 'order';
  }
  if (lower.match(/delivery|kab|time|din|shipping|deliver/)) {
    return 'delivery';
  }
  if (lower.match(/problem|issue|complaint|refund|return|kharab|damage/)) {
    return 'complaint';
  }
  return 'other';
}

// Generate AI response based on intent
export function generateResponse(
  intent: 'price' | 'order' | 'delivery' | 'complaint' | 'other',
  products: Array<{ name: string; selling_price: number; description: string }>,
  customerMessage: string
): string {
  switch (intent) {
    case 'price':
      return priceListMessage(products);
    
    case 'order':
      return 'Order placed!\n\nApna naam, poora address, aur phone number bhejein.\n\nCOD available hai - delivery pe cash pay karein.';
    
    case 'delivery':
      return 'Delivery 3-5 working days mein ho jayegi.\n\nJab order ship hoga, aapko tracking number milega.\n\nKoi aur sawal?';
    
    case 'complaint':
      return 'Sorry for the inconvenience!\n\nApna order number bhejein aur issue describe karein.\nHum jaldi solve karenge.';
    
    default:
      return 'Assalam o Alaikum!\n\nKya help karoon?\n\n1. Price dekhne ke liye "price" likhein\n2. Order ke liye "order" likhein\n3. Delivery info ke liye "delivery" likhein';
  }
}

// Parse TikTok hashtags from JSON string
export function parseHashtags(hashtagsJson: string | null): string[] {
  if (!hashtagsJson) return [];
  try {
    return JSON.parse(hashtagsJson);
  } catch {
    return [];
  }
}

// Format hashtags for TikTok caption
export function formatHashtags(hashtags: string[]): string {
  return hashtags.map(h => `#${h}`).join(' ');
}

// Get current time in Pakistan (UTC+5)
export function getPakistanTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 5 * 3600000);
}

// Format time for display
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// Validate Pakistani phone number
export function isValidPakistaniPhone(phone: string): boolean {
  // Matches: 03XXXXXXXXX, +923XXXXXXXXX, 923XXXXXXXXX
  const regex = /^(?:\+92|92|0)?3[0-9]{9}$/;
  return regex.test(phone.replace(/[\s-]/g, ''));
}

// Format phone number for WhatsApp API
export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('92')) {
    cleaned = '92' + cleaned;
  }
  return cleaned;
}

// Calculate profit margin
export function calculateMargin(sellingPrice: number, costPrice: number): number {
  return ((sellingPrice - costPrice) / sellingPrice) * 100;
}

// Generate random order ID
export function generateOrderId(): string {
  return 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }
  throw lastError;
}

// Create standardized JSON response
export function jsonResponse<T>(
  data: T,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

// Create error response
export function errorResponse(
  message: string,
  status: number = 400
): Response {
  return jsonResponse({ success: false, error: message }, status);
}

// Create success response
export function successResponse<T>(
  data: T,
  message?: string
): Response {
  return jsonResponse({ success: true, data, message });
}
