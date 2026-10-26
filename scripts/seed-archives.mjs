import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { newArchives } from '../content/new/index.js';

const root = path.resolve(process.cwd());
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const clearanceLabels = {
  0: 'Vel（公开）',
  1: 'Vel+（内部）',
  2: 'Nim（限制）',
  3: 'Nim+（机密）',
  4: 'Ton（封存）',
  5: 'Nun（虚空）',
};

const clearanceNames = {
  0: 'Vel',
  1: 'Vel+',
  2: 'Nim',
  3: 'Nim+',
  4: 'Ton',
  5: 'Nun',
};

const covers = {
  'oath-hall-foundation': 'assets/img/1792649248743.webp',
  'mirror-lake': 'assets/img/1792649248771.webp',
  'old-city-level-4-door-gap': 'assets/img/1792649248785.webp',
  'loang-mountain-cave': 'assets/img/1792649248797.webp',
  'digrawenger-central-tower': 'assets/img/1792649248804.webp',
  'outpost-14': 'assets/img/1792649248809.webp',
  'fuxiao-last-mission-raw-comms': 'assets/img/1792649248814.webp',
  'lan-eve-of-succession': 'assets/img/1792649248821.webp',
  'minas-consecration-day': 'assets/img/1792649248827.webp',
  'canteen-wednesday-sweet-ration': 'assets/img/1792649248832.webp',
  'wind-chain-well-audio-transcript': 'assets/img/1792649248837.webp',
  'zusa-south-canal': 'assets/img/1792681250283.webp',
  'tobal-light-herb-valley': 'assets/img/1792691907772.webp',
  'elings-first-snow': 'assets/img/1792691907784.webp',
  'sotern-port-fish-market': 'assets/img/1792691907794.webp',
  'jirjis-forest-temple-outskirts': 'assets/img/1792691907800.webp',
  'lelefos-bamilen-entrance': 'assets/img/1792691907805.webp',
  'central-hospital-waiting-room': 'assets/img/1792691907810.webp',
};

const existing = JSON.parse(fs.readFileSync(path.join(root, 'content/existing.json'), 'utf8'));

const all = [
  ...existing.map((item) => ({ ...item, source: item.source || 'existing' })),
  ...newArchives.map((item) => ({
    ...item,
    source: 'new',
  })),
];

const seenNo = new Set();
const seenSlug = new Set();
for (const item of all) {
  if (seenNo.has(item.archive_no || item.no)) {
    throw new Error(`duplicate archive number: ${item.archive_no || item.no}`);
  }
  if (seenSlug.has(item.slug)) {
    throw new Error(`duplicate slug: ${item.slug}`);
  }
  seenNo.add(item.archive_no || item.no);
  seenSlug.add(item.slug);
}

const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const categoryRows = await client.query('select id, slug from public.categories');
const categoryMap = new Map(categoryRows.rows.map((row) => [row.slug, row.id]));

const missing = [...new Set(all.map((item) => item.category))].filter((slug) => !categoryMap.has(slug));
if (missing.length) throw new Error(`missing categories: ${missing.join(', ')}`);

const admin = await client.query("select id from public.profiles where role = 'admin' order by created_at limit 1");
const adminId = admin.rows[0]?.id || null;

let inserted = 0;
let updated = 0;

await client.query('begin');
try {
  for (const item of all) {
    const archiveNo = item.archive_no || item.no;
    const isExisting = item.source === 'existing';
    const metadata = {
      ...(item.metadata || item.meta || {}),
      档案编号: archiveNo,
      归档标签: isExisting ? (item.metadata?.['归档标签'] || clearanceLabels[item.clearance]) : clearanceLabels[item.clearance],
      密级: isExisting ? (item.metadata?.['密级'] || `${item.clearance}（${clearanceNames[item.clearance]}）`) : `${item.clearance}（${clearanceNames[item.clearance]}）`,
      归档者: isExisting ? (item.metadata?.['归档者'] || '桑瑞思（Sunrise）') : '桑瑞思（Sunrise）',
    };

    const existed = await client.query('select 1 from public.archives where archive_no = $1', [archiveNo]);
    await client.query(
      `insert into public.archives
        (archive_no, slug, title, subtitle, summary, content, category_id, clearance, tags, metadata, cover_url, featured, published, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (archive_no) do update set
         slug = excluded.slug,
         title = excluded.title,
         subtitle = excluded.subtitle,
         summary = excluded.summary,
         content = excluded.content,
         category_id = excluded.category_id,
         clearance = excluded.clearance,
         tags = excluded.tags,
         metadata = excluded.metadata,
         cover_url = excluded.cover_url,
         featured = excluded.featured,
         published = excluded.published`,
      [
        archiveNo,
        item.slug,
        item.title,
        item.subtitle || null,
        item.summary || null,
        item.content,
        categoryMap.get(item.category),
        item.clearance,
        item.tags || [],
        metadata,
        item.cover_url || covers[item.slug] || null,
        Boolean(item.featured),
        item.published !== false,
        adminId,
      ]
    );
    if (existed.rowCount) updated += 1;
    else inserted += 1;
  }
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  await client.end();
  throw error;
}

const stats = await client.query(
  `select c.slug, count(*)::int as n,
          count(*) filter (where a.clearance >= 4)::int as sealed
     from public.archives a join public.categories c on c.id = a.category_id
    group by c.slug order by c.slug`
);
const total = await client.query('select count(*)::int as n from public.archives');
const byClearance = await client.query('select clearance, count(*)::int as n from public.archives group by clearance order by clearance');

console.log(`archives seeded: ${inserted} inserted, ${updated} updated, ${total.rows[0].n} total`);
console.table(stats.rows);
console.table(byClearance.rows);

await client.end();
