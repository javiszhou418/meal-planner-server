import sharp from 'sharp';

interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
}

/**
 * Generate a thumbnail Buffer from an image Buffer using Sharp.
 */
export async function generateThumbnailBuffer(
  sourceBuffer: Buffer,
  options: ThumbnailOptions = {}
): Promise<Buffer> {
  const { width = 400, height = 400, quality = 80 } = options;
  return sharp(sourceBuffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer();
}

/**
 * Pre-generate all thumbnails for existing dishes and upload to Supabase Storage.
 * Used by the migration script and admin endpoint.
 */
export async function pregenerateAllThumbnails(): Promise<void> {
  const { pool } = await import('../db/connection');
  const { uploadImageBuffer } = await import('./storageService');
  const https = await import('https');
  const http = await import('http');

  const { rows } = await pool.query(`SELECT id, image_url FROM dishes WHERE image_url IS NOT NULL ORDER BY id`);
  console.log(`[thumbnail] Pre-generating thumbnails for ${rows.length} dishes...`);

  for (const dish of rows) {
    try {
      let buffer: Buffer;

      if (dish.image_url.startsWith('http')) {
        // Download from Supabase Storage or external URL
        buffer = await downloadToBuffer(dish.image_url, https.default, http.default);
      } else {
        // Legacy local path — read from disk
        const { readFile } = await import('fs/promises');
        const path = await import('path');
        const localPath = path.resolve(__dirname, '../../../assets/dishes', `dish_${dish.id}.jpg`);
        buffer = await readFile(localPath);
      }

      const thumbBuffer = await generateThumbnailBuffer(buffer, { width: 400, height: 400, quality: 80 });
      const thumbUrl = await uploadImageBuffer(thumbBuffer, `dish_${dish.id}.jpg`, 'thumbnails');
      await pool.query(`UPDATE dishes SET thumbnail_url = $1 WHERE id = $2`, [thumbUrl, dish.id]);
      console.log(`[thumbnail] ✅ dish ${dish.id}`);
    } catch (err) {
      console.error(`[thumbnail] ❌ dish ${dish.id}:`, err);
    }
  }
  console.log('[thumbnail] ✅ Pre-generation complete');
}

/**
 * Clear thumbnails bucket in Supabase Storage (admin utility).
 */
export async function clearThumbnails(): Promise<void> {
  console.log('[thumbnail] clearThumbnails: not applicable with Supabase Storage (use the dashboard)');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function downloadToBuffer(
  url: string,
  https: typeof import('https'),
  http: typeof import('http')
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadToBuffer(res.headers.location!, https, http).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
