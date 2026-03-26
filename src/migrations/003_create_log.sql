CREATE TABLE IF NOT EXISTS meal_log (
  id SERIAL PRIMARY KEY, logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type VARCHAR(10) CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  dish_id INTEGER REFERENCES dishes(id), servings DECIMAL(4,2) DEFAULT 1.0,
  calories INTEGER NOT NULL, protein_g DECIMAL(6,2) NOT NULL,
  carbs_g DECIMAL(6,2) NOT NULL, fat_g DECIMAL(6,2) NOT NULL
);
CREATE OR REPLACE VIEW daily_nutrition AS
SELECT logged_at, SUM(calories) AS total_calories, SUM(protein_g) AS total_protein_g,
  SUM(carbs_g) AS total_carbs_g, SUM(fat_g) AS total_fat_g, COUNT(*) AS dishes_eaten
FROM meal_log GROUP BY logged_at ORDER BY logged_at DESC;
