import https from 'https';
import { pool } from '../db/connection';

const SPOON_KEY = process.env.SPOONACULAR_API_KEY;

// Chinese cuisine tags to search on Spoonacular
const SEARCH_QUERIES = [
  'chinese stir fry chicken',
  'chinese pork braised',
  'chinese beef noodles',
  'chinese vegetable tofu',
  'cantonese steamed fish',
  'sichuan spicy lamb',
];

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** Determine category based on recipe title and ingredient list. */
function classifyDish(title: string, ingredients: string[]): { category: 'vegetable' | 'protein'; protein_src: string | null } {
  const proteinKeywords: Record<string, string> = {
    chicken: 'chicken',
    pork: 'pork',
    beef: 'beef',
    lamb: 'lamb',
    mutton: 'mutton',
    egg: 'egg',
    shrimp: 'chicken', // map shrimp/fish loosely to chicken for DB enum
    fish: 'chicken',
    duck: 'chicken',
    turkey: 'chicken',
  };

  const combined = (title + ' ' + ingredients.join(' ')).toLowerCase();
  for (const [keyword, src] of Object.entries(proteinKeywords)) {
    if (combined.includes(keyword)) {
      return { category: 'protein', protein_src: src };
    }
  }
  return { category: 'vegetable', protein_src: null };
}

/** Fetch recipe details (ingredients + steps) from Spoonacular. */
async function fetchRecipeDetails(id: number): Promise<any> {
  const url = `https://api.spoonacular.com/recipes/${id}/information?includeNutrition=true&apiKey=${SPOON_KEY}`;
  return fetchJson(url);
}

/** Derive a simple Chinese name from an English title (placeholder prefix). */
function deriveChinese(nameEn: string): string {
  return `新菜·${nameEn.slice(0, 6)}`;
}

/** Save a single discovered dish to the database (skip if name_en already exists). */
async function saveDish(dish: {
  name_en: string;
  name_zh: string;
  category: 'vegetable' | 'protein';
  protein_src: string | null;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: { name_en: string; name_zh: string; amount_g: number; note: string | null }[];
  steps: string[];
}): Promise<void> {
  const client = await pool.connect();
  try {
    // Check duplicate
    const exists = await client.query('SELECT id FROM dishes WHERE name_en = $1', [dish.name_en]);
    if (exists.rows.length > 0) {
      console.log(`[discovery] Skipping duplicate: ${dish.name_en}`);
      return;
    }

    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO dishes (name_en, name_zh, category, protein_src, description, calories, protein_g, carbs_g, fat_g)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        dish.name_en,
        dish.name_zh,
        dish.category,
        dish.protein_src,
        dish.description,
        dish.calories,
        dish.protein_g,
        dish.carbs_g,
        dish.fat_g,
      ]
    );
    const dishId = res.rows[0].id;

    for (const ing of dish.ingredients) {
      await client.query(
        `INSERT INTO ingredients (dish_id, name_en, name_zh, amount_g, note) VALUES ($1,$2,$3,$4,$5)`,
        [dishId, ing.name_en, ing.name_zh, ing.amount_g, ing.note]
      );
    }

    for (let i = 0; i < dish.steps.length; i++) {
      await client.query(
        `INSERT INTO cooking_steps (dish_id, step_no, instruction) VALUES ($1,$2,$3)`,
        [dishId, i + 1, dish.steps[i]]
      );
    }

    await client.query('COMMIT');
    console.log(`[discovery] Saved new dish: ${dish.name_en}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[discovery] Failed to save dish "${dish.name_en}":`, err);
  } finally {
    client.release();
  }
}

/** Run one discovery cycle: search Spoonacular, classify and persist new dishes. */
export async function runDiscovery(): Promise<void> {
  if (!SPOON_KEY) {
    console.warn('[discovery] SPOONACULAR_API_KEY not set — skipping discovery.');
    return;
  }

  console.log('[discovery] Starting dish discovery cycle...');

  for (const query of SEARCH_QUERIES) {
    try {
      const searchUrl = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(
        query
      )}&number=3&cuisine=Chinese&apiKey=${SPOON_KEY}`;
      const searchData = await fetchJson(searchUrl);
      const results: any[] = searchData?.results ?? [];

      for (const result of results) {
        try {
          const detail = await fetchRecipeDetails(result.id);

          // Extract nutrition
          const nutrients: any[] = detail?.nutrition?.nutrients ?? [];
          const getNutrient = (name: string) =>
            Math.round(nutrients.find((n: any) => n.name === name)?.amount ?? 0);

          const calories = getNutrient('Calories');
          const protein_g = getNutrient('Protein');
          const carbs_g = getNutrient('Carbohydrates');
          const fat_g = getNutrient('Fat');

          // Extract ingredients
          const rawIngredients: any[] = detail?.extendedIngredients ?? [];
          const ingredientNames = rawIngredients.map((i: any) => i.name ?? '');
          const ingredients = rawIngredients.slice(0, 12).map((i: any) => ({
            name_en: i.name ?? 'ingredient',
            name_zh: i.name ?? 'ingredient',
            amount_g: Math.round((i.measures?.metric?.amount ?? i.amount ?? 50)),
            note: i.consistency ?? null,
          }));

          // Extract steps
          const analyzedSteps: any[] =
            detail?.analyzedInstructions?.[0]?.steps ?? [];
          const steps: string[] =
            analyzedSteps.length > 0
              ? analyzedSteps.map((s: any) => s.step as string)
              : ['Prepare all ingredients.', 'Cook according to the recipe.', 'Serve hot.'];

          const { category, protein_src } = classifyDish(detail.title ?? result.title, ingredientNames);

          await saveDish({
            name_en: detail.title ?? result.title,
            name_zh: deriveChinese(detail.title ?? result.title),
            category,
            protein_src,
            description: detail.summary
              ? detail.summary.replace(/<[^>]*>/g, '').slice(0, 200)
              : `A delicious Chinese dish: ${detail.title}.`,
            calories,
            protein_g,
            carbs_g,
            fat_g,
            ingredients,
            steps,
          });

          // Respect Spoonacular rate limit
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          console.error(`[discovery] Error processing recipe ${result.id}:`, err);
        }
      }

      // Brief pause between queries
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[discovery] Error searching for "${query}":`, err);
    }
  }

  console.log('[discovery] Discovery cycle complete.');
}

/** Schedule runDiscovery() to execute every 24 hours. */
export function scheduleDailyDiscovery(): void {
  // Run once shortly after startup
  setTimeout(() => {
    runDiscovery().catch((err) => console.error('[discovery] Startup run error:', err));
  }, 10_000);

  // Then repeat every 24 hours
  setInterval(() => {
    runDiscovery().catch((err) => console.error('[discovery] Scheduled run error:', err));
  }, 24 * 60 * 60 * 1000);

  console.log('[discovery] Daily discovery scheduler registered.');
}
