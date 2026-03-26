import { Request, Response } from 'express';
import { getSupabase } from '../db/supabaseClient';
import { resolveAndPersistImage } from '../services/imageService';

const DISH_FIELDS = 'id, name_en, name_zh, category, protein_src, image_url, thumbnail_url, description, calories, protein_g, carbs_g, fat_g';

function pickRandom<T>(arr: T[], n: number, exclude: number[] = []): T[] {
  const p = arr.filter((d: any) => !exclude.includes(d.id));
  return [...(p.length >= n ? p : arr)].sort(() => Math.random() - 0.5).slice(0, n);
}

async function ensureImages(dishes: any[]): Promise<any[]> {
  return Promise.all(dishes.map(async (dish) => {
    if (!dish.image_url) {
      try {
        const url = await resolveAndPersistImage(dish.id, dish.name_en, dish.name_zh);
        return { ...dish, image_url: url };
      } catch { return dish; }
    }
    return dish;
  }));
}

export async function generateMeals(req: Request, res: Response) {
  const exclude: number[] = req.body?.exclude ?? [];
  try {
    const { data: vegRows } = await getSupabase().from('dishes').select(DISH_FIELDS).eq('category', 'vegetable');
    const { data: proRows } = await getSupabase().from('dishes').select(DISH_FIELDS).eq('category', 'protein');

    const vegetables = pickRandom(vegRows ?? [], 2, exclude);
    const proteins   = pickRandom(proRows ?? [], 2, exclude);

    const [veg, pro] = await Promise.all([ensureImages(vegetables), ensureImages(proteins)]);
    return res.json({ data: { vegetables: veg as [any, any], proteins: pro as [any, any] } });
  } catch (err) {
    console.error('[generateMeals]', err);
    return res.status(500).json({ error: 'Failed to generate meal set' });
  }
}
