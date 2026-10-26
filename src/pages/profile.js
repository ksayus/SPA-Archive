import { supabase } from '../supabase.js';
import { state, refreshProfile, signOut, isStaff } from '../store.js';
import {
  clearanceInfo, emptyState, escapeHtml, formatDate, setPageTitle, toast,
} from '../ui.js';
import { navigate } from '../router.js';

function statBox(value, label) {
  return `<div class="stat-box"><strong>${Number(value || 0)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function historyRow(item) {
  const archive = state.catalogById.get(item.archive_id);
  if (!archive) return '';
  return `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title"><a href="#/archive/${encodeURIComponent(archive.slug)}">${escapeHtml(archive.title)}</a></div>
        <div class="list-meta">${escapeHtml(archive.archive_no)} · 调阅 ${Number(item.read_count || 1)} 次</div>
      </div>
      <span class="list-side">${formatDate(item.last_read_at, false)}</span>
    </div>`;
}

function bookmarkRow(item) {
  const archive = state.catalogById.get(item.archive_id);
  if (!archive) return '';
  return `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title"><a href="#/archive/${encodeURIComponent(archive.slug)}">${escapeHtml(archive.title)}</a></div>
        <div class="list-meta">${escapeHtml(archive.archive_no)} · ${escapeHtml(clearanceInfo(archive.clearance).code)}</div>
      </div>
      <button class="btn btn-sm" data-remove-bookmark="${escapeHtml(archive.id)}">移除</button>
    </div>`;
}

export const profile = {
  async render({ app }) {
    setPageTitle('权限档案');
    if (!state.session?.user) {
      app.innerHTML = `
        <section class="page-head">
          <p class="page-kicker">ACCESS DENIED · GUEST</p>
          <h1 class="page-title">尚未接入权限档案</h1>
          <p class="page-desc">登录后可查看个人权限、XP、调阅记录与个人索引。访客仍可浏览公开目录。</p>
        </section>
        <div class="btn-row"><a class="btn btn-primary" href="#/login?next=%2Fprofile">登录终端</a><a class="btn" href="#/register">登记新账号</a><a class="btn" href="#/archives">浏览公开目录</a></div>`;
      return;
    }

    if (!state.profile) {
      app.innerHTML = `<div class="error-box">未能载入权限档案。请重新登录，或联系管理员检查账号状态。</div>`;
      return;
    }

    const user = state.session.user;
    const p = state.profile;
    const level = clearanceInfo(p.clearance);

    const [readCount, bookmarkCount, taskCount, historyResult, bookmarkResult] = await Promise.all([
      supabase.from('reading_history').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('task_completions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['completed', 'approved']),
      supabase.from('reading_history').select('*').eq('user_id', user.id).order('last_read_at', { ascending: false }).limit(12),
      supabase.from('bookmarks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
    ]);

    const history = historyResult.data || [];
    const bookmarks = bookmarkResult.data || [];
    const nextThreshold = [100, 350, 900].find((threshold) => Number(p.xp) < threshold);
    const previous = Number(p.xp) < 100 ? 0 : Number(p.xp) < 350 ? 100 : Number(p.xp) < 900 ? 350 : 900;
    const pct = nextThreshold ? Math.min(100, Math.round(((Number(p.xp) - previous) / (nextThreshold - previous)) * 100)) : 100;

    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">PERSONNEL FILE · ${escapeHtml(p.id.slice(0, 8).toUpperCase())}</p>
        <h1 class="page-title">权限档案</h1>
        <p class="page-desc">这是桑瑞思为你的终端身份维护的档案。权限、XP 与调阅记录由任务系统和阅读行为共同更新。</p>
      </section>

      <div class="profile-layout">
        <aside class="id-card">
          <div class="id-photo">
            <span class="initial">${escapeHtml(p.display_name?.slice(0, 1) || '档')}</span>
            <span class="id-stamp">SPA<br>ARCHIVE</span>
          </div>
          <h2 class="id-name">${escapeHtml(p.display_name)}</h2>
          <div class="id-role">${escapeHtml(({ admin: 'ADMINISTRATOR', editor: 'CATALOGUE EDITOR', user: 'ARCHIVIST' })[p.role] || 'ARCHIVIST')} · ${escapeHtml(level.code)}</div>
          <div class="id-rows">
            <div class="id-row"><span>登记邮箱</span><span>${escapeHtml(p.email || user.email || '—')}</span></div>
            <div class="id-row"><span>权限等级</span><span>${escapeHtml(level.code)} · ${escapeHtml(level.name)}</span></div>
            <div class="id-row"><span>账号状态</span><span>${p.status === 'active' ? '正常' : '已暂停'}</span></div>
            <div class="id-row"><span>XP / 点数</span><span>${Number(p.xp || 0)} / ${Number(p.points || 0)}</span></div>
            <div class="id-row"><span>登记时间</span><span>${formatDate(p.created_at, false)}</span></div>
          </div>
          <div class="btn-row mt-16">
            ${isStaff() ? '<a class="btn btn-sm btn-primary" href="#/admin">管理控制台</a>' : ''}
            <button class="btn btn-sm btn-danger" id="logout-btn">退出终端</button>
          </div>
        </aside>

        <div class="stack">
          <div class="stat-grid">
            ${statBox(readCount.count || 0, '调阅档案')}
            ${statBox(bookmarkCount.count || 0, '个人索引')}
            ${statBox(taskCount.count || 0, '完成任务')}
            ${statBox(p.points || 0, '通用点数')}
          </div>

          <div class="panel">
            <div class="panel-head"><h2>权限进度</h2><span class="mono" style="font-size:9px;color:#c9a35c">${Number(p.xp || 0)} XP</span></div>
            <div class="progress-bar"><span style="width:${pct}%"></span></div>
            <div class="progress-label">
              <span>当前 ${escapeHtml(level.code)} · ${escapeHtml(level.name)}</span>
              <span>${nextThreshold ? `下一级 ${nextThreshold} XP · 还差 ${Math.max(0, nextThreshold - Number(p.xp))} XP` : '已获管理员核定权限'}</span>
            </div>
            <p class="form-note mt-16">0 级公开 · 100 XP 内部 · 350 XP 限制 · 900 XP 机密。IV 级（Ton）与 V 级（Nun）仅由管理员核定。</p>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>个人资料</h2><span class="mono" style="font-size:8px;color:#8f7d63">PUBLIC PROFILE</span></div>
            <form id="profile-form">
              <div class="form-grid">
                <div class="field">
                  <label for="profile-name">显示名称</label>
                  <input id="profile-name" name="display_name" maxlength="40" value="${escapeHtml(p.display_name || '')}" required>
                </div>
                <div class="field">
                  <label>登记邮箱</label>
                  <input value="${escapeHtml(p.email || user.email || '')}" disabled>
                </div>
                <div class="field full">
                  <label for="profile-bio">简介</label>
                  <textarea id="profile-bio" name="bio" maxlength="500" placeholder="写一点关于你的档案员身份。至少 8 个字符可完成“完善个人档案”任务。">${escapeHtml(p.bio || '')}</textarea>
                </div>
              </div>
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" id="profile-save">保存资料</button>
                <span class="form-note" style="margin:0">角色、权限、XP 与点数不可自行修改。</span>
              </div>
            </form>
          </div>

          <div class="grid-2">
            <div class="panel">
              <div class="panel-head"><h2>最近调阅</h2><span class="mono" style="font-size:8px;color:#8f7d63">READING HISTORY</span></div>
              ${history.length ? history.map(historyRow).join('') : emptyState('暂无调阅记录', '打开任意公开档案后，记录会出现在这里。')}
            </div>
            <div class="panel">
              <div class="panel-head"><h2>个人索引</h2><span class="mono" style="font-size:8px;color:#8f7d63">BOOKMARKS</span></div>
              <div id="bookmark-list">${bookmarks.length ? bookmarks.map(bookmarkRow).join('') : emptyState('个人索引为空', '在档案页点击“加入个人索引”即可收藏。')}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    app.querySelector('#logout-btn')?.addEventListener('click', async () => {
      await signOut();
      toast('已退出终端。', 'success');
      navigate('/');
    });

    app.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const save = app.querySelector('#profile-save');
      const displayName = app.querySelector('#profile-name').value.trim();
      const bio = app.querySelector('#profile-bio').value.trim();
      if (displayName.length < 2) { toast('显示名称至少需要 2 个字符。', 'error'); return; }
      save.disabled = true;
      save.textContent = '保存中……';
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: displayName, bio })
          .eq('id', user.id);
        if (error) { toast(error.message, 'error'); return; }
        await refreshProfile();
        app.querySelector('.id-name').textContent = displayName;
        toast('个人资料已更新。', 'success');
      } finally {
        save.disabled = false;
        save.textContent = '保存资料';
      }
    });

    app.querySelector('#bookmark-list')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-remove-bookmark]');
      if (!button) return;
      const archiveId = button.dataset.removeBookmark;
      const { error } = await supabase.from('bookmarks').delete().eq('archive_id', archiveId);
      if (error) { toast(error.message, 'error'); return; }
      button.closest('.list-row')?.remove();
      toast('已移出个人索引。', 'success');
    });
  },
};
