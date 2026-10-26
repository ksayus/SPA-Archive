import { supabase } from '../supabase.js';
import { state, refreshCatalog, isStaff, isAdmin } from '../store.js';
import {
  clearanceInfo, confirmDialog, escapeHtml, formatDate, openModal,
  setPageTitle, toast,
} from '../ui.js';
const TABS = [
  { key: 'overview', label: '总览', adminOnly: false },
  { key: 'archives', label: '档案管理', adminOnly: false },
  { key: 'users', label: '账号与权限', adminOnly: true },
  { key: 'submissions', label: '待审队列', adminOnly: true },
  { key: 'announcements', label: '公告管理', adminOnly: false },
  { key: 'audit', label: '审计日志', adminOnly: true },
];

const FEEDBACK_KIND_LABELS = {
  correction: '档案纠错',
  addition: '补充材料',
  report: '异常报告',
  other: '其他',
};

function slugFromNo(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function fieldValue(form, name) {
  return form.elements.namedItem(name)?.value ?? '';
}

function fieldChecked(form, name) {
  return Boolean(form.elements.namedItem(name)?.checked);
}

async function fetchStats() {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) throw error;
  return data;
}

async function fetchArchives() {
  const { data, error } = await supabase.from('archives').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchTasksAll() {
  const { data, error } = await supabase.from('tasks').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchPendingTasks() {
  const { data, error } = await supabase.from('task_completions').select('*').eq('status', 'pending').order('completed_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchPendingFeedback() {
  const { data, error } = await supabase.from('archive_feedback').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchAnnouncements() {
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchAudit() {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(120);
  if (error) throw error;
  return data || [];
}

function statCard(value, label) {
  return `<div class="admin-stat"><strong>${Number(value || 0)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function archiveForm(record) {
  const isEdit = Boolean(record);
  const metadata = record?.metadata || {};
  return `
    <form id="archive-form" class="admin-archive-form">
      <div class="form-grid">
        <div class="field">
          <label for="af-no">档案编号</label>
          <input id="af-no" name="archive_no" value="${escapeHtml(record?.archive_no || '')}" placeholder="SPA/XX/XXX-000" required>
        </div>
        <div class="field">
          <label for="af-slug">URL 标识（slug）</label>
          <input id="af-slug" name="slug" value="${escapeHtml(record?.slug || '')}" placeholder="留空则按编号生成" pattern="[a-z0-9-]+">
        </div>
        <div class="field full">
          <label for="af-title">标题</label>
          <input id="af-title" name="title" value="${escapeHtml(record?.title || '')}" required>
        </div>
        <div class="field full">
          <label for="af-subtitle">副标题</label>
          <input id="af-subtitle" name="subtitle" value="${escapeHtml(record?.subtitle || '')}">
        </div>
        <div class="field">
          <label for="af-category">分类</label>
          <select id="af-category" name="category_id">
            ${state.categories.map((category) => `<option value="${escapeHtml(category.id)}" ${record?.category_id === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="af-clearance">密级</label>
          <select id="af-clearance" name="clearance">
            ${[0, 1, 2, 3, 4, 5].map((level) => `<option value="${level}" ${Number(record?.clearance ?? 0) === level ? 'selected' : ''}>${escapeHtml(clearanceInfo(level).code)} · ${escapeHtml(clearanceInfo(level).name)}</option>`).join('')}
          </select>
        </div>
        <div class="field full">
          <label for="af-summary">摘要</label>
          <textarea id="af-summary" name="summary" style="min-height:70px">${escapeHtml(record?.summary || '')}</textarea>
        </div>
        <div class="field full">
          <label for="af-tags">标签（逗号分隔）</label>
          <input id="af-tags" name="tags" value="${escapeHtml((record?.tags || []).join(', '))}">
        </div>
        <div class="field full">
          <label for="af-content">正文（Markdown）</label>
          <textarea id="af-content" name="content" required>${escapeHtml(record?.content || '')}</textarea>
        </div>
        <div class="field">
          <label for="af-cover">封面 URL</label>
          <input id="af-cover" name="cover_url" value="${escapeHtml(record?.cover_url || '')}" placeholder="assets/img/....webp">
        </div>
        <div class="field" style="justify-content:flex-end;gap:8px">
          <label class="checkbox-field"><input type="checkbox" id="af-featured" name="featured" ${record?.featured ? 'checked' : ''}> 首页推荐</label>
          <label class="checkbox-field"><input type="checkbox" id="af-published" name="published" ${record?.published !== false ? 'checked' : ''}> 发布到目录</label>
        </div>
      </div>
      <p class="form-note">${isEdit ? `正在编辑 ${escapeHtml(record.archive_no)}。元数据键值将保留。` : '新档案会以桑瑞思归档口吻补全元数据。正文支持 Markdown。'}</p>
    </form>`;
}

function openArchiveModal(record, onSaved) {
  openModal({
    title: record ? '编辑档案' : '新建档案',
    kicker: 'ARCHIVE EDITOR',
    sub: record ? record.archive_no : '新条目将写入中央档案库',
    wide: true,
    body: archiveForm(record),
    actions: [
      { label: '取消', onClick: (_root, close) => close() },
      {
        label: record ? '保存修改' : '创建档案',
        className: 'btn-primary',
        onClick: async (root, close) => {
          const form = root.querySelector('#archive-form');
          const archiveNo = fieldValue(form, 'archive_no').trim();
          const title = fieldValue(form, 'title').trim();
          const content = fieldValue(form, 'content').trim();
          if (!archiveNo || !title || !content) { toast('档案编号、标题与正文不能为空。', 'error'); return; }
          const slug = fieldValue(form, 'slug').trim() || slugFromNo(archiveNo);
          if (!/^[a-z0-9-]+$/.test(slug)) { toast('slug 只能包含小写字母、数字与连字符。', 'error'); return; }
          const level = Number(fieldValue(form, 'clearance'));
          const tags = fieldValue(form, 'tags').split(',').map((tag) => tag.trim()).filter(Boolean);
          const metadata = {
            ...(record?.metadata || {}),
            档案编号: archiveNo,
            密级: `${level}（${clearanceInfo(level).code}）`,
            归档者: record?.metadata?.['归档者'] || '桑瑞思（Sunrise）',
          };
          const payload = {
            archive_no: archiveNo,
            slug,
            title,
            subtitle: fieldValue(form, 'subtitle').trim() || null,
            summary: fieldValue(form, 'summary').trim() || null,
            content,
            category_id: fieldValue(form, 'category_id'),
            clearance: level,
            tags,
            metadata,
            cover_url: fieldValue(form, 'cover_url').trim() || null,
            featured: fieldChecked(form, 'featured'),
            published: fieldChecked(form, 'published'),
          };
          const query = record
            ? supabase.from('archives').update(payload).eq('id', record.id)
            : supabase.from('archives').insert(payload);
          const { error } = await query;
          if (error) { toast(error.message, 'error'); return; }
          close();
          toast(record ? '档案已更新。' : '档案已创建。', 'success');
          await refreshCatalog();
          await onSaved?.();
        },
      },
    ],
  });
}

function openUserModal(user, onSaved) {
  openModal({
    title: '调整账号权限',
    kicker: 'PERSONNEL CONTROL',
    sub: `${user.display_name} · ${user.email || '无邮箱'}`,
    body: `
      <form id="user-form">
        <div class="form-grid">
          <div class="field">
            <label for="uf-role">角色</label>
            <select id="uf-role" name="role">
              ${['user', 'editor', 'admin'].map((role) => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${({ user: '档案员', editor: '编目主管', admin: '管理员' })[role]}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="uf-clearance">权限等级</label>
            <select id="uf-clearance" name="clearance">
              ${[0, 1, 2, 3, 4, 5].map((level) => `<option value="${level}" ${Number(user.clearance) === level ? 'selected' : ''}>${clearanceInfo(level).code} · ${clearanceInfo(level).name}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="uf-xp">XP</label>
            <input type="number" id="uf-xp" name="xp" min="0" value="${Number(user.xp || 0)}">
          </div>
          <div class="field">
            <label for="uf-points">通用点数</label>
            <input type="number" id="uf-points" name="points" min="0" value="${Number(user.points || 0)}">
          </div>
          <div class="field">
            <label for="uf-status">账号状态</label>
            <select id="uf-status" name="status">
              <option value="active" ${user.status === 'active' ? 'selected' : ''}>正常</option>
              <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>暂停</option>
            </select>
          </div>
        </div>
        <p class="form-note mt-16">手动调整权限会覆盖自动晋升结果。IV 级与 V 级只能在这里授予。</p>
      </form>`,
    actions: [
      { label: '取消', onClick: (_root, close) => close() },
      {
        label: '保存调整',
        className: 'btn-primary',
        onClick: async (root, close) => {
          const form = root.querySelector('#user-form');
          const { data, error } = await supabase.rpc('admin_update_user', {
            p_user_id: user.id,
            p_role: fieldValue(form, 'role'),
            p_clearance: Number(fieldValue(form, 'clearance')),
            p_xp: Number(fieldValue(form, 'xp')),
            p_points: Number(fieldValue(form, 'points')),
            p_status: fieldValue(form, 'status'),
          });
          if (error) { toast(error.message, 'error'); return; }
          if (!data?.ok) { toast(data?.error || '调整失败', 'error'); return; }
          close();
          toast('账号权限已更新。', 'success');
          await onSaved?.();
        },
      },
    ],
  });
}

function openResetPasswordModal(user, onSaved) {
  openModal({
    title: '重置密码',
    kicker: 'CREDENTIAL RESET',
    sub: user.display_name,
    body: `
      <div class="field">
        <label for="reset-password">新密码</label>
        <input type="password" id="reset-password" autocomplete="new-password" placeholder="至少 8 位">
      </div>
      <p class="form-note mt-16">重置后请通过安全渠道通知本人。该操作会写入审计日志。</p>`,
    actions: [
      { label: '取消', onClick: (_root, close) => close() },
      {
        label: '确认重置',
        className: 'btn-danger',
        onClick: async (root, close) => {
          const password = root.querySelector('#reset-password').value;
          if (password.length < 8) { toast('密码至少需要 8 位。', 'error'); return; }
          const { data, error } = await supabase.rpc('admin_reset_password', { p_user_id: user.id, p_password: password });
          if (error) { toast(error.message, 'error'); return; }
          if (!data?.ok) { toast(data?.error || '重置失败', 'error'); return; }
          close();
          toast('密码已重置。', 'success');
          await onSaved?.();
        },
      },
    ],
  });
}

function openReviewModal(kind, row, profiles, tasks, onReviewed) {
  const isTask = kind === 'task';
  const task = isTask ? tasks.find((item) => item.id === row.task_id) : null;
  const profile = profiles.find((item) => item.id === row.user_id);
  const defaultXp = isTask ? Number(row.reward_xp || 0) : 50;
  const defaultPoints = isTask ? Number(row.reward_points || 0) : 10;
  openModal({
    title: isTask ? '审核任务提交' : '审核纠错 / 补充',
    kicker: 'REVIEW QUEUE',
    sub: `${profile?.display_name || row.user_id} · ${formatDate(row.completed_at || row.created_at)}`,
    body: `
      <div class="panel" style="margin-bottom:16px">
        <p style="color:#b7a88d;font-size:12px;margin:0 0 6px"><strong style="color:#e8dcc2">${isTask ? escapeHtml(task?.title || '未知任务') : escapeHtml(FEEDBACK_KIND_LABELS[row.kind] || row.kind)}</strong></p>
        <p style="color:#b7a88d;font-size:12.5px;margin:0">${escapeHtml(isTask ? (row.proof || '（未提交说明）') : row.content)}</p>
      </div>
      <form id="review-form">
        <div class="form-grid">
          <div class="field">
            <label for="rv-note">审核备注</label>
            <input id="rv-note" placeholder="可选，会写回提交记录">
          </div>
          <div class="field">
            <label for="rv-xp">奖励 XP</label>
            <input type="number" id="rv-xp" min="0" value="${defaultXp}">
          </div>
          <div class="field">
            <label for="rv-points">奖励点数</label>
            <input type="number" id="rv-points" min="0" value="${defaultPoints}">
          </div>
        </div>
      </form>`,
    actions: [
      { label: '取消', onClick: (_root, close) => close() },
      {
        label: '驳回',
        className: 'btn-danger',
        onClick: async (root, close) => {
          await review(false);
          close();
        },
      },
      {
        label: '通过并发放',
        className: 'btn-primary',
        onClick: async (root, close) => {
          await review(true);
          close();
        },
      },
    ],
  });

  async function review(approve) {
    const root = document.getElementById('modal-root');
    const note = root.querySelector('#rv-note')?.value.trim() || null;
    const xp = Number(root.querySelector('#rv-xp')?.value || 0);
    const points = Number(root.querySelector('#rv-points')?.value || 0);
    const { data, error } = await supabase.rpc('admin_review_submission', {
      p_kind: kind,
      p_id: row.id,
      p_approve: approve,
      p_note: note,
      p_xp: xp,
      p_points: points,
    });
    if (error) { toast(error.message, 'error'); return; }
    if (!data?.ok) { toast(data?.error || '审核失败', 'error'); return; }
    toast(approve ? '已通过并发放奖励。' : '已驳回。', 'success');
    await onReviewed?.();
  }
}

function openAnnouncementModal(row, onSaved) {
  openModal({
    title: row ? '编辑公告' : '发布公告',
    kicker: 'NOTICE BOARD',
    sub: row ? row.title : '公告会显示在首页与公告栏',
    body: `
      <form id="ann-form">
        <div class="form-grid">
          <div class="field full">
            <label for="an-title">标题</label>
            <input id="an-title" value="${escapeHtml(row?.title || '')}" required>
          </div>
          <div class="field full">
            <label for="an-body">正文</label>
            <textarea id="an-body" style="min-height:140px" required>${escapeHtml(row?.body || '')}</textarea>
          </div>
          <div class="field">
            <label for="an-level">可见密级</label>
            <select id="an-level">
              ${[0, 1, 2, 3, 4, 5].map((level) => `<option value="${level}" ${Number(row?.level ?? 0) === level ? 'selected' : ''}>${clearanceInfo(level).code} · ${clearanceInfo(level).name}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="justify-content:flex-end">
            <label class="checkbox-field"><input type="checkbox" id="an-active" ${row?.active !== false ? 'checked' : ''}> 立即生效</label>
          </div>
        </div>
      </form>`,
    actions: [
      { label: '取消', onClick: (_root, close) => close() },
      {
        label: row ? '保存公告' : '发布公告',
        className: 'btn-primary',
        onClick: async (root, close) => {
          const title = root.querySelector('#an-title').value.trim();
          const body = root.querySelector('#an-body').value.trim();
          if (!title || !body) { toast('标题与正文不能为空。', 'error'); return; }
          const payload = {
            title,
            body,
            level: Number(root.querySelector('#an-level').value),
            active: root.querySelector('#an-active').checked,
          };
          const query = row
            ? supabase.from('announcements').update(payload).eq('id', row.id)
            : supabase.from('announcements').insert(payload);
          const { error } = await query;
          if (error) { toast(error.message, 'error'); return; }
          close();
          toast(row ? '公告已更新。' : '公告已发布。', 'success');
          await onSaved?.();
        },
      },
    ],
  });
}

export const admin = {
  async render({ app, query }) {
    setPageTitle('管理控制台');
    if (!state.session?.user) {
      app.innerHTML = `
        <section class="page-head"><p class="page-kicker">ADMIN CONSOLE · GUEST</p><h1 class="page-title">需要管理权限</h1><p class="page-desc">请先登录管理员或编目主管账号。</p></section>
        <div class="btn-row"><a class="btn btn-primary" href="#/login?next=%2Fadmin">登录终端</a><a class="btn" href="#/">回到首页</a></div>`;
      return;
    }
    if (!isStaff()) {
      app.innerHTML = `
        <section class="page-head"><p class="page-kicker">ADMIN CONSOLE · DENIED</p><h1 class="page-title">权限不足</h1><p class="page-desc">你的账号没有管理权限。该页面的所有数据操作同样受数据库行级安全策略保护。</p></section>
        <div class="btn-row"><a class="btn btn-primary" href="#/profile">查看权限档案</a><a class="btn" href="#/tasks">提升权限</a></div>`;
      return;
    }

    let currentTab = TABS.some((tab) => tab.key === query.get('tab') && (!tab.adminOnly || isAdmin()))
      ? query.get('tab')
      : 'overview';
    let archiveRows = [];
    let userRows = [];
    let taskRows = [];
    let pendingTasks = [];
    let pendingFeedback = [];
    let announcementRows = [];
    let auditRows = [];
    let stats = null;
    let userMap = new Map();

    const panel = () => app.querySelector('#admin-panel');
    const nav = () => app.querySelector('#admin-nav');

    const setTab = (key) => {
      const target = TABS.find((tab) => tab.key === key);
      if (!target || (target.adminOnly && !isAdmin())) return;
      currentTab = key;
      history.replaceState(null, '', `#/admin?tab=${encodeURIComponent(key)}`);
      nav().querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === key));
      renderPanel();
    };

    const refreshAll = async () => {
      if (isAdmin()) {
        stats = await fetchStats().catch(() => null);
        userRows = await fetchUsers().catch(() => []);
        userMap = new Map(userRows.map((user) => [user.id, user]));
      }
      archiveRows = await fetchArchives().catch(() => []);
      taskRows = await fetchTasksAll().catch(() => []);
      pendingTasks = isAdmin() ? await fetchPendingTasks().catch(() => []) : [];
      pendingFeedback = isAdmin() ? await fetchPendingFeedback().catch(() => []) : [];
      announcementRows = await fetchAnnouncements().catch(() => []);
      auditRows = isAdmin() ? await fetchAudit().catch(() => []) : [];
    };

    const overviewHtml = () => {
      const published = archiveRows.filter((row) => row.published).length;
      const sealed = archiveRows.filter((row) => row.clearance >= 4).length;
      const pending = pendingTasks.length + pendingFeedback.length;
      return `
        <div class="admin-stats">
          ${statCard(stats?.users ?? userRows.length, '登记账号')}
          ${statCard(stats?.archives ?? archiveRows.length, '馆藏档案')}
          ${statCard(published, '已发布')}
          ${statCard(sealed, '封存 / 虚空')}
          ${statCard(stats?.reads ?? 0, '累计调阅')}
          ${statCard(stats?.reads_today ?? 0, '今日调阅')}
          ${statCard(pending, '待审队列')}
          ${statCard(stats?.tasks ?? taskRows.filter((task) => task.active).length, '启用任务')}
        </div>
        <div class="admin-subgrid">
          <div class="panel">
            <div class="panel-head"><h3>密级分布</h3></div>
            <table class="label-table">
              <thead><tr><th>标签</th><th>含义</th><th>卷数</th></tr></thead>
              <tbody>${[0, 1, 2, 3, 4, 5].map((level) => {
                const count = archiveRows.filter((row) => Number(row.clearance) === level).length;
                return `<tr><td>${clearanceInfo(level).code}</td><td>${clearanceInfo(level).name}</td><td>${count}</td></tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>快速操作</h3></div>
            <div class="side-actions">
              <button class="btn btn-sm btn-primary" data-action="new-archive">新建档案</button>
              <button class="btn btn-sm" data-tab-jump="submissions">查看待审队列</button>
              <button class="btn btn-sm" data-tab-jump="announcements">管理公告</button>
              ${isAdmin() ? '<button class="btn btn-sm" data-tab-jump="users">账号与权限</button>' : ''}
            </div>
            <p class="form-note mt-16">${isAdmin() ? '管理员视图：可调整账号、审核提交、查看审计日志。' : '编目主管视图：可管理档案与公告，不可调整账号或查看审计日志。'}</p>
          </div>
        </div>`;
    };

    const archivesHtml = () => `
      <div class="admin-toolbar">
        <div class="search-field"><span class="search-icon">⌕</span><input id="admin-archive-search" placeholder="检索编号、标题、slug……"></div>
        <button class="btn btn-sm btn-primary" data-action="new-archive">新建档案</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>档案</th><th>分类</th><th>密级</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody id="admin-archive-rows"></tbody>
        </table>
      </div>`;

    const renderArchiveRows = (keyword = '') => {
      const body = app.querySelector('#admin-archive-rows');
      if (!body) return;
      const q = keyword.trim().toLowerCase();
      const rows = archiveRows.filter((row) => !q || [row.archive_no, row.title, row.slug, ...(row.tags || [])].join(' ').toLowerCase().includes(q));
      body.innerHTML = rows.map((row) => `
        <tr>
          <td><div class="cell-title">${escapeHtml(row.title)}</div><div class="cell-mono">${escapeHtml(row.archive_no)} · ${escapeHtml(row.slug)}</div></td>
          <td>${escapeHtml(state.categoryById.get(row.category_id)?.name || '未分类')}</td>
          <td>${escapeHtml(clearanceInfo(row.clearance).code)}</td>
          <td>${row.published ? '已发布' : '草稿'}${row.featured ? ' · 推荐' : ''}</td>
          <td class="cell-mono">${formatDate(row.updated_at, false)}</td>
          <td><div class="actions">
            <button data-edit-archive="${escapeHtml(row.id)}">编辑</button>
            <a class="btn btn-sm" style="padding:3px 6px;font-size:8px" href="#/archive/${encodeURIComponent(row.slug)}" target="_blank" rel="noopener">查看</a>
            <button class="danger" data-delete-archive="${escapeHtml(row.id)}">删除</button>
          </div></td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="admin-empty">没有匹配的档案。</div></td></tr>';
      body.querySelectorAll('[data-edit-archive]').forEach((button) => {
        button.addEventListener('click', () => {
          const row = archiveRows.find((item) => item.id === button.dataset.editArchive);
          openArchiveModal(row, async () => { await refreshAll(); renderPanel(); });
        });
      });
      body.querySelectorAll('[data-delete-archive]').forEach((button) => {
        button.addEventListener('click', async () => {
          const row = archiveRows.find((item) => item.id === button.dataset.deleteArchive);
          if (!row) return;
          const ok = await confirmDialog(`确定删除「${row.title}」？该操作不可撤销。`, { title: '删除档案', confirmText: '删除', danger: true });
          if (!ok) return;
          const { error } = await supabase.from('archives').delete().eq('id', row.id);
          if (error) { toast(error.message, 'error'); return; }
          toast('档案已删除。', 'success');
          await refreshCatalog();
          await refreshAll();
          renderPanel();
        });
      });
    };

    const usersHtml = () => `
      <div class="admin-toolbar">
        <div class="search-field"><span class="search-icon">⌕</span><input id="admin-user-search" placeholder="检索名称、邮箱、角色……"></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>账号</th><th>角色</th><th>权限</th><th>XP / 点数</th><th>状态</th><th>登记</th><th>操作</th></tr></thead>
          <tbody id="admin-user-rows"></tbody>
        </table>
      </div>`;

    const renderUserRows = (keyword = '') => {
      const body = app.querySelector('#admin-user-rows');
      if (!body) return;
      const q = keyword.trim().toLowerCase();
      const rows = userRows.filter((row) => !q || [row.display_name, row.email, row.role].join(' ').toLowerCase().includes(q));
      body.innerHTML = rows.map((row) => `
        <tr>
          <td><div class="cell-title">${escapeHtml(row.display_name)}</div><div class="cell-mono">${escapeHtml(row.email || '—')}</div></td>
          <td>${({ admin: '管理员', editor: '编目主管', user: '档案员' })[row.role] || row.role}</td>
          <td>${escapeHtml(clearanceInfo(row.clearance).code)}</td>
          <td class="cell-mono">${Number(row.xp || 0)} / ${Number(row.points || 0)}</td>
          <td>${row.status === 'active' ? '正常' : '已暂停'}</td>
          <td class="cell-mono">${formatDate(row.created_at, false)}</td>
          <td><div class="actions">
            <button data-edit-user="${escapeHtml(row.id)}">权限</button>
            <button data-reset-user="${escapeHtml(row.id)}">重置密码</button>
          </div></td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="admin-empty">没有匹配的账号。</div></td></tr>';
      body.querySelectorAll('[data-edit-user]').forEach((button) => {
        button.addEventListener('click', () => {
          const row = userRows.find((item) => item.id === button.dataset.editUser);
          openUserModal(row, async () => { await refreshAll(); renderPanel(); });
        });
      });
      body.querySelectorAll('[data-reset-user]').forEach((button) => {
        button.addEventListener('click', () => {
          const row = userRows.find((item) => item.id === button.dataset.resetUser);
          openResetPasswordModal(row, async () => { await refreshAll(); });
        });
      });
    };

    const submissionsHtml = () => {
      const taskTable = pendingTasks.map((row) => {
        const task = taskRows.find((item) => item.id === row.task_id);
        return `<tr>
          <td><div class="cell-title">${escapeHtml(task?.title || '未知任务')}</div><div class="cell-mono">${escapeHtml(task?.slug || '')}</div></td>
          <td>${escapeHtml(userMap.get(row.user_id)?.display_name || row.user_id)}</td>
          <td style="max-width:280px">${escapeHtml(row.proof || '（未提交说明）')}</td>
          <td class="cell-mono">+${Number(row.reward_xp || 0)} / +${Number(row.reward_points || 0)}</td>
          <td><button class="btn btn-sm" data-review-task="${escapeHtml(row.id)}">审核</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5"><div class="admin-empty">任务待审队列为空。</div></td></tr>';

      const feedbackTable = pendingFeedback.map((row) => {
        const archive = state.catalogById.get(row.archive_id);
        return `<tr>
          <td><div class="cell-title">${escapeHtml(({ correction: '纠错', addition: '补充', report: '异常报告', other: '其他' })[row.kind] || row.kind)}</div><div class="cell-mono">${escapeHtml(archive?.archive_no || '无关联档案')}</div></td>
          <td>${escapeHtml(userMap.get(row.user_id)?.display_name || row.user_id)}</td>
          <td style="max-width:320px">${escapeHtml(row.content)}</td>
          <td><button class="btn btn-sm" data-review-feedback="${escapeHtml(row.id)}">审核</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="4"><div class="admin-empty">纠错 / 补充队列为空。</div></td></tr>';

      return `
        <div class="admin-subgrid">
          <div class="panel">
            <div class="panel-head"><h3>任务提交 · ${pendingTasks.length}</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>任务</th><th>提交人</th><th>材料</th><th>奖励</th><th></th></tr></thead><tbody>${taskTable}</tbody></table></div>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>纠错 / 补充 · ${pendingFeedback.length}</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>类型</th><th>提交人</th><th>内容</th><th></th></tr></thead><tbody>${feedbackTable}</tbody></table></div>
          </div>
        </div>`;
    };

    const announcementsHtml = () => `
      <div class="admin-toolbar"><button class="btn btn-sm btn-primary" data-action="new-announcement">发布公告</button></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>公告</th><th>可见密级</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead>
        <tbody>${announcementRows.map((row) => `
          <tr>
            <td><div class="cell-title">${escapeHtml(row.title)}</div><div class="cell-mono">${escapeHtml(row.body.slice(0, 80))}${row.body.length > 80 ? '…' : ''}</div></td>
            <td>${escapeHtml(clearanceInfo(row.level).code)}</td>
            <td>${row.active ? '生效中' : '已停用'}</td>
            <td class="cell-mono">${formatDate(row.created_at, false)}</td>
            <td><div class="actions">
              <button data-edit-ann="${escapeHtml(row.id)}">编辑</button>
              <button data-toggle-ann="${escapeHtml(row.id)}">${row.active ? '停用' : '启用'}</button>
              <button class="danger" data-delete-ann="${escapeHtml(row.id)}">删除</button>
            </div></td>
          </tr>`).join('') || '<tr><td colspan="5"><div class="admin-empty">暂无公告。</div></td></tr>'}</tbody>
      </table></div>`;

    const auditHtml = () => `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>详情</th></tr></thead>
        <tbody>${auditRows.map((row) => `
          <tr>
            <td class="cell-mono">${formatDate(row.created_at)}</td>
            <td>${escapeHtml(userMap.get(row.actor_id)?.display_name || row.actor_id?.slice(0, 8) || '系统')}</td>
            <td>${escapeHtml(row.action)}</td>
            <td class="cell-mono">${escapeHtml(row.target_type || '—')} ${escapeHtml(row.target_id?.slice(0, 12) || '')}</td>
            <td class="cell-mono" style="max-width:360px;word-break:break-word">${escapeHtml(JSON.stringify(row.details || {}))}</td>
          </tr>`).join('') || '<tr><td colspan="5"><div class="admin-empty">暂无审计记录。</div></td></tr>'}</tbody>
      </table></div>`;

    const renderPanel = async () => {
      const el = panel();
      if (!el) return;
      el.innerHTML = '<div class="admin-empty">正在读取管理数据……</div>';
      try {
        if (currentTab === 'overview') {
          await refreshAll();
          el.innerHTML = `<div class="admin-head"><div><h2>总览</h2><p>桑瑞思管理终端 · ${isAdmin() ? '管理员' : '编目主管'}视图</p></div><span class="mono" style="font-size:8px;color:#8f7d63">${formatDate(new Date().toISOString())}</span></div>${overviewHtml()}`;
          bindCommonActions(el);
        } else if (currentTab === 'archives') {
          archiveRows = await fetchArchives();
          el.innerHTML = `<div class="admin-head"><div><h2>档案管理</h2><p>${archiveRows.length} 卷 · 可直接编辑正文与密级</p></div><button class="btn btn-sm btn-primary" data-action="new-archive">新建档案</button></div>${archivesHtml()}`;
          bindCommonActions(el);
          renderArchiveRows();
          el.querySelector('#admin-archive-search')?.addEventListener('input', (event) => renderArchiveRows(event.target.value));
        } else if (currentTab === 'users') {
          userRows = await fetchUsers();
          userMap = new Map(userRows.map((user) => [user.id, user]));
          el.innerHTML = `<div class="admin-head"><div><h2>账号与权限</h2><p>${userRows.length} 个登记账号 · 权限调整即时生效</p></div></div>${usersHtml()}`;
          renderUserRows();
          el.querySelector('#admin-user-search')?.addEventListener('input', (event) => renderUserRows(event.target.value));
        } else if (currentTab === 'submissions') {
          userRows = await fetchUsers();
          userMap = new Map(userRows.map((user) => [user.id, user]));
          taskRows = await fetchTasksAll();
          pendingTasks = await fetchPendingTasks();
          pendingFeedback = await fetchPendingFeedback();
          el.innerHTML = `<div class="admin-head"><div><h2>待审队列</h2><p>${pendingTasks.length + pendingFeedback.length} 项待处理</p></div></div>${submissionsHtml()}`;
          el.querySelectorAll('[data-review-task]').forEach((button) => {
            button.addEventListener('click', () => {
              const row = pendingTasks.find((item) => item.id === button.dataset.reviewTask);
              openReviewModal('task', row, userRows, taskRows, async () => { await refreshAll(); renderPanel(); });
            });
          });
          el.querySelectorAll('[data-review-feedback]').forEach((button) => {
            button.addEventListener('click', () => {
              const row = pendingFeedback.find((item) => item.id === button.dataset.reviewFeedback);
              openReviewModal('feedback', row, userRows, taskRows, async () => { await refreshAll(); renderPanel(); });
            });
          });
        } else if (currentTab === 'announcements') {
          announcementRows = await fetchAnnouncements();
          el.innerHTML = `<div class="admin-head"><div><h2>公告管理</h2><p>${announcementRows.length} 条公告 · 按密级显示</p></div></div>${announcementsHtml()}`;
          bindCommonActions(el);
          el.querySelectorAll('[data-edit-ann]').forEach((button) => {
            button.addEventListener('click', () => {
              const row = announcementRows.find((item) => item.id === button.dataset.editAnn);
              openAnnouncementModal(row, async () => { announcementRows = await fetchAnnouncements(); renderPanel(); });
            });
          });
          el.querySelectorAll('[data-toggle-ann]').forEach((button) => {
            button.addEventListener('click', async () => {
              const row = announcementRows.find((item) => item.id === button.dataset.toggleAnn);
              const { error } = await supabase.from('announcements').update({ active: !row.active }).eq('id', row.id);
              if (error) { toast(error.message, 'error'); return; }
              toast(row.active ? '公告已停用。' : '公告已启用。', 'success');
              announcementRows = await fetchAnnouncements();
              renderPanel();
            });
          });
          el.querySelectorAll('[data-delete-ann]').forEach((button) => {
            button.addEventListener('click', async () => {
              const row = announcementRows.find((item) => item.id === button.dataset.deleteAnn);
              const ok = await confirmDialog(`确定删除公告「${row.title}」？`, { title: '删除公告', confirmText: '删除', danger: true });
              if (!ok) return;
              const { error } = await supabase.from('announcements').delete().eq('id', row.id);
              if (error) { toast(error.message, 'error'); return; }
              toast('公告已删除。', 'success');
              announcementRows = await fetchAnnouncements();
              renderPanel();
            });
          });
        } else if (currentTab === 'audit') {
          userRows = await fetchUsers();
          userMap = new Map(userRows.map((user) => [user.id, user]));
          auditRows = await fetchAudit();
          el.innerHTML = `<div class="admin-head"><div><h2>审计日志</h2><p>最近 ${auditRows.length} 条系统操作</p></div></div>${auditHtml()}`;
        }
      } catch (error) {
        console.error(error);
        el.innerHTML = `<div class="error-box"><strong>管理数据读取失败：</strong>${escapeHtml(error.message)}</div>`;
      }
    };

    const bindCommonActions = (el) => {
      el.querySelectorAll('[data-action="new-archive"]').forEach((button) => {
        button.addEventListener('click', () => openArchiveModal(null, async () => { await refreshAll(); renderPanel(); }));
      });
      el.querySelectorAll('[data-action="new-announcement"]').forEach((button) => {
        button.addEventListener('click', () => openAnnouncementModal(null, async () => { announcementRows = await fetchAnnouncements(); renderPanel(); }));
      });
      el.querySelectorAll('[data-tab-jump]').forEach((button) => {
        button.addEventListener('click', () => setTab(button.dataset.tabJump));
      });
    };

    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">ADMIN CONSOLE · ${isAdmin() ? 'ADMINISTRATOR' : 'CATALOGUE EDITOR'}</p>
        <h1 class="page-title">管理控制台</h1>
        <p class="page-desc">${escapeHtml(state.profile.display_name)} · ${isAdmin() ? '管理员' : '编目主管'}。所有写操作均受数据库行级安全策略约束；敏感操作会写入审计日志。</p>
      </section>
      <div class="admin-layout">
        <aside class="admin-nav" id="admin-nav">
          <div class="admin-nav-title">CONTROL PANEL</div>
          ${TABS.filter((tab) => !tab.adminOnly || isAdmin()).map((tab) => `<button data-tab="${tab.key}" class="${tab.key === currentTab ? 'active' : ''}">${tab.label}</button>`).join('')}
          <button data-tab-jump="overview" style="margin-top:10px;border-top:1px solid rgba(201,163,92,.16)">← 返回总览</button>
        </aside>
        <section class="admin-panel" id="admin-panel"></section>
      </div>`;

    nav().querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => setTab(button.dataset.tab));
    });
    nav().querySelector('[data-tab-jump="overview"]')?.addEventListener('click', () => setTab('overview'));

    await refreshAll();
    await renderPanel();

    const editId = query.get('edit');
    if (editId) {
      const record = archiveRows.find((row) => row.id === editId);
      if (record) {
        history.replaceState(null, '', `#/admin?tab=${encodeURIComponent(currentTab)}`);
        openArchiveModal(record, async () => { await refreshAll(); await renderPanel(); });
      }
    }
  },
};
