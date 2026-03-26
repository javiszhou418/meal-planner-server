import { Request, Response } from 'express';
import { pool } from '../db/connection';

export async function getAllDishes(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT id, name_en, name_zh, category, protein_src, image_url, thumbnail_url,
              description, calories, protein_g, carbs_g, fat_g
       FROM dishes ORDER BY id`
    );
    return res.json({ data: result.rows });
  } catch (err) {
    console.error('[getAllDishes]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getDishById(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid dish ID' });
  try {
    const d = await pool.query(`SELECT * FROM dishes WHERE id=$1`, [id]);
    if (!d.rowCount) return res.status(404).json({ error: 'Dish not found' });

    const ing = await pool.query(`SELECT * FROM ingredients WHERE dish_id=$1 ORDER BY id`, [id]);
    const steps = await pool.query(`SELECT * FROM cooking_steps WHERE dish_id=$1 ORDER BY step_no`, [id]);

    return res.json({
      data: { ...d.rows[0], ingredients: ing.rows, steps: steps.rows },
    });
  } catch (err) {
    console.error('[getDishById]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
