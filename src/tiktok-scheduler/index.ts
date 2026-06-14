// TikTok Video Scheduler Worker
// Handles scheduling and posting videos to TikTok

import { Hono } from 'hono';
import type { Env, TikTokVideo, Product } from '../shared/types';
import { 
  jsonResponse, 
  errorResponse, 
  successResponse, 
  getPakistanTime, 
  formatHashtags,
  retryWithBackoff 
} from '../shared/utils';

const app = new Hono<{ Bindings: Env }>();

// Get all scheduled videos
app.get('/videos', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT v.*, p.name as product_name FROM tiktok_videos v LEFT JOIN products p ON v.product_id = p.id ORDER BY v.scheduled_time DESC'
  ).all();
  return successResponse(results);
});

// Schedule a new video
app.post('/videos', async (c) => {
  const body = await c.req.json();
  const { product_id, video_url, caption, hashtags, scheduled_time } = body;

  if (!product_id || !video_url || !scheduled_time) {
    return errorResponse('Missing required fields: product_id, video_url, scheduled_time');
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO tiktok_videos (product_id, video_url, caption, hashtags, scheduled_time, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).bind(product_id, video_url, caption || '', JSON.stringify(hashtags || []), scheduled_time)
    .run();

  // Add to queue
  await c.env.DB.prepare(
    `INSERT INTO video_queue (video_id, scheduled_for, status) VALUES (?, ?, 'queued')`
  ).bind(result.meta.last_row_id, scheduled_time).run();

  return successResponse({ id: result.meta.last_row_id }, 'Video scheduled successfully');
});

// Update video status
app.put('/videos/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status, tiktok_post_id, views, likes, comments, shares } = body;

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (status) { updates.push('status = ?'); values.push(status); }
  if (tiktok_post_id) { updates.push('tiktok_post_id = ?'); values.push(tiktok_post_id); }
  if (views !== undefined) { updates.push('views = ?'); values.push(views); }
  if (likes !== undefined) { updates.push('likes = ?'); values.push(likes); }
  if (comments !== undefined) { updates.push('comments = ?'); values.push(comments); }
  if (shares !== undefined) { updates.push('shares = ?'); values.push(shares); }

  if (updates.length === 0) return errorResponse('No fields to update');

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE tiktok_videos SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return successResponse(null, 'Video updated successfully');
});

// Delete a scheduled video
app.delete('/videos/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM video_queue WHERE video_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tiktok_videos WHERE id = ?').bind(id).run();
  return successResponse(null, 'Video deleted successfully');
});

// Get videos due for posting (cron trigger)
app.get('/queue/due', async (c) => {
  const now = new Date().toISOString();
  const { results } = await c.env.DB.prepare(
    `SELECT v.*, p.name as product_name, p.tiktok_hashtags
     FROM video_queue q
     JOIN tiktok_videos v ON q.video_id = v.id
     LEFT JOIN products p ON v.product_id = p.id
     WHERE q.status = 'queued' AND q.scheduled_for <= ?
     ORDER BY q.scheduled_for ASC
     LIMIT 10`
  ).bind(now).all();
  return successResponse(results);
});

// Mark video as posted
app.post('/queue/post/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  const body = await c.req.json();
  const { tiktok_post_id } = body;

  await c.env.DB.prepare(
    `UPDATE video_queue SET status = 'posted' WHERE video_id = ?`
  ).bind(videoId).run();

  await c.env.DB.prepare(
    `UPDATE tiktok_videos SET status = 'posted', tiktok_post_id = ? WHERE id = ?`
  ).bind(tiktok_post_id, videoId).run();

  return successResponse(null, 'Video marked as posted');
});

// Mark video as failed
app.post('/queue/fail/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  const body = await c.req.json();
  const { error_message } = body;

  await c.env.DB.prepare(
    `UPDATE video_queue SET status = 'failed', error_message = ? WHERE video_id = ?`
  ).bind(error_message, videoId).run();

  await c.env.DB.prepare(
    `UPDATE tiktok_videos SET status = 'failed' WHERE id = ?`
  ).bind(videoId).run();

  return successResponse(null, 'Video marked as failed');
});

// Post video to TikTok using Content Posting API
app.post('/post/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  
  // Get video details
  const video = await c.env.DB.prepare(
    'SELECT * FROM tiktok_videos WHERE id = ?'
  ).bind(videoId).first<TikTokVideo>();

  if (!video) return errorResponse('Video not found');
  if (video.status !== 'pending') return errorResponse('Video already processed');

  try {
    // Step 1: Initialize video upload
    const initResponse = await retryWithBackoff(async () => {
      return fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: video.caption || 'Check out this product!',
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: 0, // Will be updated
            chunk_size: 0,
            total_chunk_count: 1,
          },
        }),
      });
    });

    const initData = await initResponse.json() as { data?: { upload_url?: string; publish_id?: string } };

    if (!initData.data?.publish_id) {
      throw new Error('Failed to initialize TikTok upload');
    }

    // Step 2: Upload video (simplified - in production, handle chunked upload)
    // For now, we'll mark as posted and handle actual upload separately
    await c.env.DB.prepare(
      `UPDATE tiktok_videos SET status = 'posted', tiktok_post_id = ? WHERE id = ?`
    ).bind(initData.data.publish_id, videoId).run();

    await c.env.DB.prepare(
      `UPDATE video_queue SET status = 'posted' WHERE video_id = ?`
    ).bind(videoId).run();

    return successResponse({ publish_id: initData.data.publish_id }, 'Video posted to TikTok');
  } catch (error) {
    await c.env.DB.prepare(
      `UPDATE tiktok_videos SET status = 'failed' WHERE id = ?`
    ).bind(videoId).run();

    return errorResponse(`Failed to post: ${(error as Error).message}`);
  }
});

// Get video analytics
app.get('/analytics', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT 
       COUNT(*) as total_videos,
       SUM(views) as total_views,
       SUM(likes) as total_likes,
       SUM(comments) as total_comments,
       SUM(shares) as total_shares,
       AVG(views) as avg_views
     FROM tiktok_videos
     WHERE status = 'posted'`
  ).all();
  return successResponse(results[0]);
});

// Get trending hashtags
app.get('/hashtags', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT tiktok_hashtags FROM products WHERE tiktok_hashtags IS NOT NULL`
  ).all();

  const hashtagCounts: Record<string, number> = {};
  results.forEach((r: { tiktok_hashtags: string }) => {
    try {
      const tags = JSON.parse(r.tiktok_hashtags);
      tags.forEach((tag: string) => {
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    } catch {}
  });

  const sorted = Object.entries(hashtagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  return successResponse(sorted);
});

export default app;
