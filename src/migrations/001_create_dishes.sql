DO $$ BEGIN CREATE TYPE dish_category AS ENUM ('vegetable','protein'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE protein_source AS ENUM ('egg','chicken','lamb','beef','mutton','tofu','pork'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS dishes (
  id SERIAL PRIMARY KEY, name_en VARCHAR(100) NOT NULL, name_zh VARCHAR(100) NOT NULL,
  category dish_category NOT NULL, protein_src protein_source, image_url TEXT,
  description TEXT, calories INTEGER NOT NULL, protein_g DECIMAL(6,2) NOT NULL,
  carbs_g DECIMAL(6,2) NOT NULL, fat_g DECIMAL(6,2) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
);
