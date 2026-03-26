import fs from 'fs';
import path from 'path';
import { pool, testConnection } from './connection';
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
async function migrate() {
  await testConnection();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (id SERIAL PRIMARY KEY, filename VARCHAR(255) UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT NOW())`);
    const { rows } = await client.query(`SELECT filename FROM _migrations ORDER BY filename`);
    const applied = new Set(rows.map((r: any) => r.filename));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) { console.log(`  ⏩ Skip: ${file}`); continue; }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query('BEGIN');
      try { await client.query(sql); await client.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [file]); await client.query('COMMIT'); console.log(`  ✅ Applied: ${file}`); }
      catch (err) { await client.query('ROLLBACK'); throw err; }
    }
    console.log('\n🎉 Migrations complete.');
  } finally { client.release(); await pool.end(); }
}
migrate();
