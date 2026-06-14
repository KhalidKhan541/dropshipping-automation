// Shared types for the dropshipping automation system

export interface Env {
  // Bindings
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  AI: Ai;

  // Environment variables
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  TIKTOK_ACCESS_TOKEN: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_VERIFY_TOKEN: string;
  MARKAZ_API_KEY: string;
  BUSINESS_NAME: string;
  CURRENCY: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  markaz_price: number;
  selling_price: number;
  profit: number;
  category: string;
  image_url: string | null;
  markaz_link: string | null;
  tiktok_hashtags: string; // JSON array
  status: 'active' | 'inactive' | 'out_of_stock';
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  phone_number: string;
  name: string | null;
  whatsapp_id: string | null;
  tiktok_username: string | null;
  city: string | null;
  address: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  customer_id: number;
  product_id: number;
  quantity: number;
  selling_price: number;
  markaz_price: number;
  profit: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  markaz_order_id: string | null;
  tracking_number: string | null;
  courier_name: string | null;
  payment_method: 'cod' | 'easypaisa' | 'jazzcash';
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded';
  advance_paid: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TikTokVideo {
  id: number;
  product_id: number | null;
  video_url: string | null;
  caption: string | null;
  hashtags: string | null; // JSON array
  scheduled_time: string;
  status: 'pending' | 'posted' | 'failed';
  tiktok_post_id: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  created_at: string;
}

export interface WhatsAppConversation {
  id: number;
  customer_id: number | null;
  phone_number: string;
  message_in: string | null;
  message_out: string | null;
  message_type: 'text' | 'image' | 'template';
  intent: 'price' | 'order' | 'delivery' | 'complaint' | 'other' | null;
  ai_generated: number;
  created_at: string;
}

export interface ProductResearch {
  id: number;
  product_name: string;
  source: string;
  source_url: string | null;
  estimated_cost: number | null;
  suggested_price: number | null;
  trend_score: number | null;
  reason: string | null;
  status: 'new' | 'reviewed' | 'approved' | 'rejected';
  created_at: string;
}

export interface Analytics {
  id: number;
  date: string;
  total_orders: number;
  total_revenue: number;
  total_profit: number;
  total_views: number;
  total_leads: number;
  conversion_rate: number;
  top_product_id: number | null;
  created_at: string;
}

export interface VideoQueue {
  id: number;
  video_id: number;
  scheduled_for: string;
  status: 'queued' | 'posting' | 'posted' | 'failed';
  error_message: string | null;
  created_at: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface OrderCreateRequest {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  product_id: number;
  quantity?: number;
  payment_method?: 'cod' | 'easypaisa' | 'jazzcash';
  advance_paid?: number;
}

export interface WhatsAppMessage {
  messaging_product: string;
  to: string;
  type: string;
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
  };
}

export interface TikTokVideoRequest {
  post_info: {
    title: string;
    privacy_level: string;
    disable_duet: boolean;
    disable_comment: boolean;
    disable_stitch: boolean;
  };
  source_info: {
    source: string;
    video_size: number;
    chunk_size: number;
    total_chunk_count: number;
  };
}
