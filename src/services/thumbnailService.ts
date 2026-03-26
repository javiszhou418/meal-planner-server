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
  const { getSupabase } = await import('../db/supabaseClient');
  const { uploadImageBuffer } = await import('./storageService');
  const https = await import('https');
  const http = await import('http');

  const { data: rows } = await getSupabase().from('dishes').select('id, image_url').not('image_url', 'is', null).order('id');
  console.log(`[thumbnail] Pre-generating thumbnails for ${(rows ?? []).length} dishes...`);

  for (const dish of (rows ?? [])) {
    try {
      const buffer = await downloadToBuffer(dish.image_url, https.default, http.default);
      const thumbBuffer = await generateThumbnailBuffer(buffer, { width: 400, height: 400, quality: 80 });
      const thumbUrl = await uploadImageBuffer(thumbBuffer, `dish_${dish.id}.jpg`, 'thumbnails');
      await getSupabase().from('dishes').update({ thumbnail_url: thumbUrl }).eq('id', dish.id);
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
