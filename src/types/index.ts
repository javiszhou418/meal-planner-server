export type DishCategory = 'vegetable' | 'protein';
export type ProteinSource = 'egg' | 'chicken' | 'lamb' | 'beef' | 'mutton' | 'tofu' | 'pork';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export interface Ingredient { id: number; dish_id: number; name_en: string; name_zh: string; amount_g: number; note?: string; }
export interface CookingStep { step_no: number; instruction: string; }
export interface Dish { id: number; name_en: string; name_zh: string; category: DishCategory; protein_src?: ProteinSource; image_url: string; description: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; ingredients?: Ingredient[]; steps?: CookingStep[]; }
export interface MealSet { vegetables: [Dish, Dish]; proteins: [Dish, Dish]; }
export interface LogEntry { id: number; logged_at: string; meal_type: MealType; dish: Dish; servings: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; }
export interface ApiResponse<T> { data: T; error?: string; }
