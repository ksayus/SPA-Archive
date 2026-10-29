export const SUPABASE_URL = 'https://zolbibcrxnvqmyxkkyun.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Fz6BNL6LnAw_tZHDc9ajvw_GKVjfSKG';

export const SITE = {
  name: 'Sunrise 中央档案库',
  shortName: 'SPA Central Archive',
  version: '2.9.2',
  inviteCode: 'SPA-ENLIST-2026',
};

export const CLEARANCE_LEVELS = [
  { level: 0, code: 'VEL', name: '公开', desc: '任何访客可调阅', cls: 'clearance-0' },
  { level: 1, code: 'VEL+', name: '内部', desc: '100 XP 自动授予', cls: 'clearance-1' },
  { level: 2, code: 'NIM', name: '限制', desc: '350 XP 自动授予', cls: 'clearance-2' },
  { level: 3, code: 'NIM+', name: '机密', desc: '900 XP 自动授予', cls: 'clearance-3' },
  { level: 4, code: 'TON', name: '封存', desc: '仅管理员授予', cls: 'clearance-4' },
  { level: 5, code: 'NUN', name: '虚空', desc: '仅管理员授予', cls: 'clearance-5' },
];
