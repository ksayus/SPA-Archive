import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const root = path.resolve(process.cwd());
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
});

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/db-push.mjs <sql-file> [more.sql ...]');
  process.exit(1);
}

await client.connect();
for (const file of files) {
  const full = path.resolve(root, file);
  const sql = fs.readFileSync(full, 'utf8');
  process.stdout.write(`→ ${path.relative(root, full)} ... `);
  try {
    await client.query(sql);
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.error(error);
    await client.end();
    process.exit(1);
  }
}
await client.end();
console.log('done');
