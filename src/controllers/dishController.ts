import { Request, Response } from 'express';
import { getSupabase } from '../db/supabaseClient';

export async function getAllDishes(req: Request, res: Response) {
  try {
    const { data, error } = await getSupabase()
      .from('dishes')
      .select('id, name_en, name_zh, category, protein_src, image_url, thumbnail_url, description, calories, protein_g, carbs_g, fat_g')
      .order('id');
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    console.error('[getAllDishes]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getDishById(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid dish ID' });
  try {
    const { data: dish, error: de } = await getSupabase()
      .from('dishes')
      .select('*')
      .eq('id', id)
      .single();
    if (de || !dish) return res.status(404).json({ error: 'Dish not found' });

    const { data: ingredients } = await getSupabase()
      .from('ingredients')
      .select('*')
      .eq('dish_id', id)
      .order('id');

    const { data: steps } = await getSupabase()
      .from('cooking_steps')
      .select('*')
      .eq('dish_id', id)
      .order('step_no');

    return res.json({ data: { ...dish, ingredients: ingredients ?? [], steps: steps ?? [] } });
  } catch (err) {
    console.error('[getDishById]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
