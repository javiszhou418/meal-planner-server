/**
 * One-time migration: uploads local dish images to Supabase Storage
 * and updates image_url / thumbnail_url via the Supabase REST API.
 *
 * Run ONCE from your local Mac:
 *   ts-node src/scripts/migrateToCloud.ts
 */
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { uploadImageBuffer } from '../services/storageService';
import { generateThumbnailBuffer } from '../services/thumbnailService';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const ASSETS_DIR = path.resolve(__dirname, '../../../assets/dishes');

async function run() {
  const { data: dishes, error } = await supabase
    .from('dishes')
    .select('id, name_en, image_url')
    .order('id');

  if (error) throw new Error(`Failed to fetch dishes: ${error.message}`);

  console.log(`\n🚀 Migrating ${dishes!.length} dishes to Supabase Storage...\n`);

  let success = 0, skipped = 0, failed = 0;

  for (const dish of dishes!) {
    const filename = `dish_${dish.id}.jpg`;
    const localPath = path.join(ASSETS_DIR, filename);

    // Skip if already on Supabase Storage
    if (dish.image_url?.startsWith('https://') && dish.image_url.includes('supabase')) {
      console.log(`  ⏩ Skip dish ${dish.id} (${dish.name_en}) — already migrated`);
      skipped++;
      continue;
    }

    try {
      await fs.access(localPath);
    } catch {
      console.warn(`  ⚠️  dish ${dish.id} (${dish.name_en}) — no local file, skipping`);
      skipped++;
      continue;
    }

    try {
      const buffer = await fs.readFile(localPath);

      const imageUrl = await uploadImageBuffer(buffer, filename, 'dishes');

      const thumbBuffer = await generateThumbnailBuffer(buffer, { width: 400, height: 400, quality: 80 });
      const thumbUrl = await uploadImageBuffer(thumbBuffer, filename, 'thumbnails');

      await supabase
        .from('dishes')
        .update({ image_url: imageUrl, thumbnail_url: thumbUrl })
        .eq('id', dish.id);

      console.log(`  ✅ dish ${dish.id} (${dish.name_en})`);
      success++;
    } catch (err: any) {
      console.error(`  ❌ dish ${dish.id} (${dish.name_en}):`, err.message);
      failed++;
    }
  }

  console.log(`\n🎉 Done — ${success} migrated, ${skipped} skipped, ${failed} failed`);
}

run().catch(err => { console.error(err); process.exit(1); });
