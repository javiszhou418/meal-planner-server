import https from 'https';
import http from 'http';
import { pool } from '../db/connection';
import { uploadImageBuffer } from './storageService';
import { generateThumbnailBuffer } from './thumbnailService';
// Note: dishImageScraper (Playwright) intentionally not imported — not used in production

const SPOON_KEY  = process.env.SPOONACULAR_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;

export async function resolveAndPersistImage(dishId: number, nameEn: string, nameZh: string): Promise<string> {
  let imageUrl: string | null = null;
  // 优先使用阿里通义万相 AI 生成
  imageUrl ??= await wanxiangImageUrl(nameEn, nameZh);
  // 兜底：免费图片库
  imageUrl ??= await wikipediaImageUrl(nameEn);
  imageUrl ??= await mealDbImageUrl(nameEn);
  imageUrl ??= SPOON_KEY ? await spoonacularImageUrl(nameEn) : null;
  imageUrl ??= PEXELS_KEY ? await pexelsImageUrl(nameEn, nameZh) : null;
  if (!imageUrl) throw new Error(`No image found for "${nameEn}"`);

  const filename = `dish_${dishId}.jpg`;
  const buffer = await downloadToBuffer(imageUrl);
  const storageUrl = await uploadImageBuffer(buffer, filename, 'dishes');

  // Generate and upload thumbnail
  let thumbUrl: string | null = null;
  try {
    const thumbBuffer = await generateThumbnailBuffer(buffer, { width: 400, height: 400, quality: 80 });
    thumbUrl = await uploadImageBuffer(thumbBuffer, filename, 'thumbnails');
  } catch (err) {
    console.warn(`[image] Thumbnail generation failed for dish ${dishId}:`, err);
  }

  await pool.query(
    `UPDATE dishes SET image_url = $1, thumbnail_url = $2 WHERE id = $3`,
    [storageUrl, thumbUrl ?? storageUrl, dishId]
  );
  console.log(`[image] ✅ "${nameEn}" → ${storageUrl}`);
  return storageUrl;
}

export async function regenerateAllImages(): Promise<void> {
  const { rows } = await pool.query(`SELECT id, name_en, name_zh FROM dishes ORDER BY id`);
  console.log(`[regen] Regenerating ${rows.length} dish images...`);
  for (const dish of rows) {
    try { await resolveAndPersistImage(dish.id, dish.name_en, dish.name_zh); }
    catch (err) { console.error(`[regen] ❌ ${dish.name_en}:`, err); }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('[regen] Done.');
}

async function wikipediaImageUrl(nameEn: string): Promise<string | null> {
  try {
    const slug = encodeURIComponent(nameEn.replace(/ /g, '_'));
    const data = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (data?.type === 'disambiguation' || data?.type === 'no-extract') return null;
    const url = data?.originalimage?.source ?? data?.thumbnail?.source ?? null;
    if (url) console.log(`[image] ✅ Wikipedia found image for "${nameEn}"`);
    return url ?? null;
  } catch { return null; }
}

async function pexelsImageUrl(nameEn: string, nameZh: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${nameEn} chinese food dish`);
    const data = await fetchJson(`https://api.pexels.com/v1/search?query=${query}&per_page=3&orientation=landscape`, { 'Authorization': PEXELS_KEY! });
    const url = data?.photos?.[0]?.src?.large2x ?? data?.photos?.[0]?.src?.large;
    if (!url) return null;
    console.log(`[image] ✅ Pexels found image for "${nameEn}"`);
    return url;
  } catch (err) { console.error(`[image] Pexels error:`, err); return null; }
}

async function spoonacularImageUrl(nameEn: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(nameEn);
    const url   = `https://api.spoonacular.com/recipes/complexSearch?query=${query}&number=1&apiKey=${SPOON_KEY}`;
    const data  = await fetchJson(url);
    const imageUrl = data?.results?.[0]?.image;
    if (!imageUrl) return null;
    console.log(`[image] ✅ Spoonacular found image for "${nameEn}"`);
    return imageUrl;
  } catch (err) { console.error(`[image] Spoonacular error:`, err); return null; }
}

async function mealDbImageUrl(nameEn: string): Promise<string | null> {
  try {
    // Try full name first, then individual significant words
    const candidates = [nameEn, ...nameEn.split(' ').filter(w => w.length >= 4)];
    for (const term of candidates) {
      const data = await fetchJson(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
      const url = data?.meals?.[0]?.strMealThumb;
      if (url) { console.log(`[image] ✅ MealDB found image for "${nameEn}" (term: "${term}")`); return url; }
    }
    return null;
  } catch { return null; }
}

function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadToBuffer(res.headers.location!).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchJson(url: string, extraHeaders: Record<string, string> = {}, body?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search,
      method: body ? 'POST' : 'GET',
      headers: { 'Accept': 'application/json', ...extraHeaders, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function wanxiangImageUrl(nameEn: string, nameZh: string): Promise<string | null> {
  if (!process.env.DASHSCOPE_API_KEY) return null;
  try {
    const prompt = `Professional food photography of ${nameEn} (${nameZh}), authentic Chinese cuisine. Beautifully plated in a traditional Chinese ceramic bowl or plate. Vibrant appetizing colors, steam rising, restaurant quality presentation, 45-degree angle, sharp focus, natural warm lighting, clean neutral background. No text, no people.`;
    // Submit task
    const submitRes = await fetchJson('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
      'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'X-DashScope-Async': 'enable',
      'Content-Type': 'application/json',
    }, JSON.stringify({ model: 'wanx2.1-t2i-turbo', input: { prompt }, parameters: { size: '1024*1024', n: 1 } }));
    const taskId = submitRes?.output?.task_id;
    if (!taskId) return null;
    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const result = await fetchJson(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      });
      const status = result?.output?.task_status;
      if (status === 'SUCCEEDED') {
        const url = result?.output?.results?.[0]?.url;
        if (url) { console.log(`[image] ✅ Wanxiang generated image for "${nameEn}"`); return url; }
        return null;
      }
      if (status === 'FAILED') { console.error(`[image] Wanxiang task failed for "${nameEn}"`); return null; }
    }
    return null;
  } catch (err) { console.error(`[image] Wanxiang error for "${nameEn}":`, err); return null; }
}

export async function regenerateAllWithDalle(): Promise<void> {
  const { rows } = await pool.query(`SELECT id, name_en, name_zh FROM dishes ORDER BY id`);
  console.log(`[wanxiang] Regenerating ${rows.length} dish images with Wanxiang...`);
  for (const dish of rows) {
    try {
      const url = await wanxiangImageUrl(dish.name_en, dish.name_zh);
      if (!url) { console.warn(`[wanxiang] No image generated for "${dish.name_en}"`); continue; }
      const buffer = await downloadToBuffer(url);
      const storageUrl = await uploadImageBuffer(buffer, `dish_${dish.id}.jpg`, 'dishes');
      await pool.query(`UPDATE dishes SET image_url = $1 WHERE id = $2`, [storageUrl, dish.id]);
      console.log(`[wanxiang] ✅ ${dish.name_en} → ${storageUrl}`);
    } catch (err) { console.error(`[wanxiang] ❌ ${dish.name_en}:`, err); }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('[wanxiang] Done regenerating all images.');
}

export async function backfillMissingImages(): Promise<void> {
  const { rows } = await pool.query(`SELECT id, name_en, name_zh FROM dishes WHERE image_url IS NULL`);
  console.log(`[backfill] ${rows.length} dishes need images`);
  for (const dish of rows) {
    try { await resolveAndPersistImage(dish.id, dish.name_en, dish.name_zh); }
    catch (err) { console.error(`[backfill] ❌ dish ${dish.id}:`, err); }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('[backfill] Done.');
}
