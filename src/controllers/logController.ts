import { Request, Response } from 'express';
import { getSupabase } from '../db/supabaseClient';

export async function getLog(req: Request, res: Response) {
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];
  try {
    const { data, error } = await getSupabase()
      .from('meal_log')
      .select('id, logged_at, meal_type, servings, calories, protein_g, carbs_g, fat_g, dish:dishes(*)')
      .eq('logged_at', date)
      .order('id');
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch log' });
  }
}

export async function getDailySummary(req: Request, res: Response) {
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];
  try {
    const { data } = await getSupabase()
      .from('daily_nutrition')
      .select('*')
      .eq('logged_at', date)
      .maybeSingle();
    return res.json({ data: data ?? { logged_at: date, total_calories: 0, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0, dishes_eaten: 0 } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
}

export async function addLogEntry(req: Request, res: Response) {
  const { dish_id, meal_type, servings, calories, protein_g, carbs_g, fat_g } = req.body;
  if (!dish_id || !meal_type) return res.status(400).json({ error: 'dish_id and meal_type are required' });
  try {
    const { data, error } = await getSupabase()
      .from('meal_log')
      .insert({ dish_id, meal_type, servings: servings ?? 1, calories, protein_g, carbs_g, fat_g })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add log entry' });
  }
}

export async function deleteLogEntry(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const { error, count } = await getSupabase()
      .from('meal_log')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw error;
    if (!count) return res.status(404).json({ error: 'Log entry not found' });
    return res.json({ data: { deleted: id } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete' });
  }
}
