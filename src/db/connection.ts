import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
pool.on('error', (err) => { console.error('[pg pool]', err); process.exit(-1); });
export async function testConnection(): Promise<void> { const client = await pool.connect(); await client.query('SELECT 1'); client.release(); console.log('✅ Database connected'); }
