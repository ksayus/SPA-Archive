const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const terms = ['药谷', '轻芸', '止芸谷'];
const out = [];

function scanFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (terms.some((t) => line.includes(t))) {
      out.push(`FILE ${file}:${i + 1}`);
      out.push(line.trim());
    }
  });
}

function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) walk(path.join(p, e));
  } else if (/\.(js|json)$/i.test(p)) {
    scanFile(p);
  }
}

for (const r of ['content']) walk(r);

(async () => {
  const client = new Client({
    host: process.env.SUPABASE_DB_HOST,
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const rows = await client.query(
    `select archive_no, title, subtitle, summary, content, tags, metadata
       from public.archives
      where title like '%药谷%' or subtitle like '%药谷%' or summary like '%药谷%'
         or content like '%药谷%' or array_to_string(tags, ' ') like '%药谷%' or metadata::text like '%药谷%'
         or title like '%轻芸%' or subtitle like '%轻芸%' or summary like '%轻芸%'
         or content like '%轻芸%' or array_to_string(tags, ' ') like '%轻芸%' or metadata::text like '%轻芸%'
         or title like '%止芸谷%' or subtitle like '%止芸谷%' or summary like '%止芸谷%'
         or content like '%止芸谷%' or array_to_string(tags, ' ') like '%止芸谷%' or metadata::text like '%止芸谷%'
      order by archive_no`
  );
  for (const row of rows.rows) {
    out.push(`\nDB ${row.archive_no} | ${row.title}`);
    for (const field of ['subtitle', 'summary', 'content', 'tags', 'metadata']) {
      const value = typeof row[field] === 'string' ? row[field] : JSON.stringify(row[field]);
      if (!value) continue;
      for (const line of value.split(/\r?\n/)) {
        if (terms.some((t) => line.includes(t))) out.push(`  [${field}] ${line.trim()}`);
      }
    }
  }
  out.push(`\nDB rows: ${rows.rowCount}`);
  await client.end();
  fs.writeFileSync('lore-search.txt', out.join('\n'), 'utf8');
  console.log('wrote lore-search.txt');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
