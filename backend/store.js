// Optional Postgres persistence. Set DATABASE_URL to enable; otherwise nodes live in memory only.
let pool = null;
async function init(nodes) {
  if (!process.env.DATABASE_URL) return console.log('Storage: in-memory (set DATABASE_URL for Postgres)');
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('CREATE TABLE IF NOT EXISTS nodes (node_id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
  const { rows } = await pool.query('SELECT data FROM nodes');
  rows.forEach(r => nodes.set(r.data.node_id, r.data));
  console.log(`Storage: Postgres, ${rows.length} nodes loaded`);
}
const save = n => pool && pool.query(
  'INSERT INTO nodes(node_id, data) VALUES ($1, $2) ON CONFLICT (node_id) DO UPDATE SET data = $2, updated_at = now()',
  [n.node_id, n]).catch(e => console.error('save failed:', e.message));
module.exports = { init, save };
