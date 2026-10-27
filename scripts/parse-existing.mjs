import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const contentDir = path.join(root, 'content');
fs.mkdirSync(contentDir, { recursive: true });

const sourceFiles = [
  {
    file: 'D:/小说世界观/曙光档案_桑瑞思归档选辑.md',
    collection: 'public',
    categories: ['research','daily','personnel','incident','organization','daily','reference','daily','minas','research','incident','personnel','organization','personnel','research','location','research'],
  },
  {
    file: 'D:/小说世界观/曙光密卷_桑瑞思机密档案.md',
    collection: 'secret',
    categories: ['incident','personnel','personnel','research','research','location','incident','organization','personnel','organization','personnel','classified'],
  },
];

const clearances = { '0': 0, 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5 };
const tagLevels = { Vel: 0, Nim: 2, Ton: 4, Nun: 5 };
const tagLabels = {
  0: 'Vel（公开）',
  1: 'Nim（内部）',
  2: 'Nim（限制）',
  3: 'Ton（机密）',
  4: 'Ton（绝密）',
  5: 'Nun（虚空）',
};

function parseTable(lines) {
  if (!lines.length) return {};
  const cells = lines.map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (cells.length < 2) return {};
  const headers = cells[0];
  const out = {};
  const isKeyValue = headers.length === 2 && (
    headers[0] === '字段' || headers[0] === '项目' || headers[1] === '内容' || headers[1] === '说明'
  );
  if (isKeyValue) {
    for (let i = 2; i < cells.length; i++) {
      const row = cells[i];
      if (!row.length || row.every(c => /^:?-+:?$/.test(c))) continue;
      if (row[0] && row[1] !== undefined) out[row[0]] = row.slice(1).join(' | ');
    }
    return out;
  }
  for (let i = 2; i < cells.length; i++) {
    const row = cells[i];
    if (!row.length || row.every(c => /^:?-+:?$/.test(c))) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    out[`row_${i}`] = obj;
  }
  return out;
}

function extractTable(bodyLines) {
  let i = 0;
  while (i < bodyLines.length && bodyLines[i].trim() === '') i++;
  if (!bodyLines[i] || !bodyLines[i].trim().startsWith('|')) return { metadata: {}, rest: bodyLines };
  const tableLines = [];
  while (i < bodyLines.length && bodyLines[i].trim().startsWith('|')) {
    tableLines.push(bodyLines[i]);
    i++;
  }
  return { metadata: parseTable(tableLines), rest: bodyLines.slice(i) };
}

function stripMarkdown(s) {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSummary(body, fallback) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p && !p.startsWith('|') && !p.startsWith('---') && !p.startsWith('**归档附注') && !p.startsWith('>'));
  const candidates = paragraphs.filter(p => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return false;
    if (/^#+\s/.test(p)) return false;
    return stripMarkdown(p).length >= 12;
  });
  const first = candidates[0] || paragraphs.find(p => !p.startsWith('- ')) || paragraphs[0] || fallback;
  const text = stripMarkdown(first);
  return text.length > 150 ? text.slice(0, 150) + '…' : text;
}

function makeTags(title, body, category) {
  const candidates = [
    ['米钠凘', '米钠凘'], ['桑瑞思', '桑瑞思'], ['浮晓', '浮晓'], ['兰霡霂', '兰霡霂'], ['橘', '橘'],
    ['卡莎雨纱', '卡莎雨纱'], ['十三使徒', '十三使徒'], ['旧城', '旧城'], ['D-17', 'D-17'],
    ['Bamilen', 'Bamilen'], ['XHA', 'XHA'], ['维奇纳瑞', '维奇纳瑞'], ['修斯纳', '修斯纳'],
    ['Veltak', 'Veltak'], ['风灵族', '风灵族'], ['托巴勒', '托巴勒'], ['艾灵斯', '艾灵斯'],
    ['勒勒弗斯', '勒勒弗斯'], ['委托系统', '委托系统'], ['卫生部', '卫生部'], ['警卫部', '警卫部'],
    ['科研部', '科研部'], ['市政厅', '市政厅'], ['人民公园', '人民公园'], ['密卷', '密卷'],
    ['炉心', '炉心'], ['温尔络', '温尔络'], ['桑索托纳', '桑索托纳'], ['智能管家', '智能管家'],
  ];
  const tags = [];
  for (const [needle, tag] of candidates) {
    if ((title + '\n' + body).includes(needle) && !tags.includes(tag)) tags.push(tag);
  }
  const catTag = {
    personnel: '人物', incident: '事件', organization: '组织', location: '地点',
    research: '科研', daily: '日常', classified: '密卷', minas: '米钠凘', reference: '编目',
  }[category];
  if (catTag && !tags.includes(catTag)) tags.unshift(catTag);
  return tags.slice(0, 6);
}

const featured = new Set(['SPA/RD/V-001', 'SPA/EM/NUNZUS-A-017', 'SPA/AP/HUS-008', 'SPA/AR/TON-HANDOVER-02', 'SPA/AR/TON-LAST-01', 'SPA/AR/NUN-12']);
const covers = {
  'SPA/AP/HUS-008': 'assets/img/米钠凘_两处字迹.webp',
  'SPA/AR/TON-LAST-01': 'assets/img/1792649248743.webp',
  'SPA/AR/VELTAKSA-LOW-04': 'assets/img/1792649248827.webp',
};

const archives = [];
for (const source of sourceFiles) {
  const text = fs.readFileSync(source.file, 'utf8').replace(/\r\n/g, '\n');
  const headingRe = /^## (档案|密卷) (\d+) · (.+)$/gm;
  const matches = [...text.matchAll(headingRe)];
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    let section = text.slice(start, end).trim();
    section = section.replace(/\n---\s*$/, '').trim();
    section = section.split(/\n## (查询结束|调阅结束)/)[0].trim();
    const lines = section.split('\n');
    const { metadata, rest } = extractTable(lines);
    const body = rest.join('\n').trim().replace(/\n---\s*$/, '').trim();
    const title = match[3].trim();
    const cleanMeta = {};
    for (const [k, v] of Object.entries(metadata)) cleanMeta[k] = v.replace(/`/g, '').trim();
    const no = (cleanMeta['档案编号'] || '').trim() || `SPA/AR/${source.collection.toUpperCase()}-${match[2]}`;
    let clearance = 0;
    if (cleanMeta['密级']) {
      const m = cleanMeta['密级'].match(/\b(V|IV|III|II|I|0)\b/);
      if (m) clearance = clearances[m[1]] ?? 0;
    } else if (cleanMeta['归档标签']) {
      const m = cleanMeta['归档标签'].match(/(Vel|Nim|Ton|Nun)/);
      if (m) clearance = tagLevels[m[1]] ?? 0;
    }
    const category = source.categories[index] || 'reference';
    const tags = makeTags(title, body, category);
    const meta = { ...cleanMeta };
    if (!meta['密级']) meta['密级'] = `${clearance === 0 ? '0（公开）' : ['I（内部）','II（限制）','III（机密）','IV（绝密）','V（虚空）'][clearance - 1]}`;
    if (!meta['归档标签']) meta['归档标签'] = tagLabels[clearance];
    if (!meta['归档者']) meta['归档者'] = '桑瑞思（Sunrise）';
    if (!meta['可见范围']) {
      meta['可见范围'] = {
        0: '全体', 1: '正式成员', 2: '部门主管', 3: '会长与指定部门', 4: '会长单独', 5: '不存在',
      }[clearance];
    }
    archives.push({
      archive_no: no,
      slug: no.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title,
      subtitle: meta['文件类型'] || (source.collection === 'secret' ? '密卷' : '归档选辑'),
      summary: makeSummary(body, title),
      content: body,
      category,
      clearance,
      tags,
      metadata: meta,
      featured: featured.has(no),
      cover_url: covers[no] || null,
      source: source.collection,
      published: true,
    });
  });
}

fs.writeFileSync(path.join(contentDir, 'existing.json'), JSON.stringify(archives, null, 2), 'utf8');
console.log(`parsed ${archives.length} archives`);
for (const a of archives) console.log(`${a.archive_no}\t${a.clearance}\t${a.category}\t${a.title}`);
