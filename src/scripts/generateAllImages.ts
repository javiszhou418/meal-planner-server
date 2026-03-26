#!/usr/bin/env ts-node
/**
 * 批量生成所有菜品的图片（使用阿里通义万相）
 * 运行: npx ts-node src/scripts/generateAllImages.ts
 */

import { pool } from '../db/connection';
import { resolveAndPersistImage } from '../services/imageService';

async function generateAllImages() {
  console.log('🚀 开始为所有菜品生成图片...\n');
  
  const { rows } = await pool.query(`SELECT id, name_en, name_zh FROM dishes ORDER BY id`);
  console.log(`共有 ${rows.length} 道菜品需要生成图片\n`);
  
  for (let i = 0; i < rows.length; i++) {
    const dish = rows[i];
    console.log(`[${i + 1}/${rows.length}] 生成: ${dish.name_zh} (${dish.name_en})`);
    
    try {
      await resolveAndPersistImage(dish.id, dish.name_en, dish.name_zh);
      // 延迟 1.5 秒，避免 API 限流
      await new Promise(r => setTimeout(r, 1500));
    } catch (err: any) {
      console.error(`  ❌ 失败: ${err.message}`);
    }
  }
  
  console.log('\n✅ 全部完成！');
  process.exit(0);
}

generateAllImages().catch(err => {
  console.error('发生错误:', err);
  process.exit(1);
});
