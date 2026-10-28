import { state, visibleAnnouncements, canRead, isStaff } from '../store.js';
import {
  archiveCard, categoryTile, clearanceInfo, escapeHtml, formatCompactNumber,
  setPageTitle,
} from '../ui.js';

function announcementCard(item) {
  return `
    <article class="announcement">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
      <div class="ann-meta">
        <span>${item.level > 0 ? `限制层 ${clearanceInfo(item.level).code}` : '公开层'}</span>
        <span>${new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
      </div>
    </article>`;
}

export const home = {
  render({ app }) {
    setPageTitle('');
    const catalog = state.catalog;
    const openCount = catalog.filter((item) => Number(item.clearance) === 0).length;
    const sealedCount = catalog.filter((item) => Number(item.clearance) >= 4).length;
    const minasCount = catalog.filter((item) => state.categoryById.get(item.category_id)?.slug === 'minas').length;
    const featured = catalog.filter((item) => item.featured).slice(0, 3);
    const latest = catalog.slice(0, 6);
    const announcements = visibleAnnouncements().slice(0, 3);
    const profile = state.profile;
    const staff = isStaff();
    const level = profile?.clearance ?? -1;
    const levelInfo = level >= 0 ? clearanceInfo(level) : null;

    const categoryCounts = new Map();
    for (const item of catalog) {
      categoryCounts.set(item.category_id, (categoryCounts.get(item.category_id) || 0) + 1);
    }

    app.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <div class="hero-kicker">SUNRISE ARCHIVE SYSTEM · 建城第 22 年</div>
          <h1 class="hero-title">Sunrise<br><span class="accent">中央档案库</span></h1>
          <p class="hero-sub">
            SPA 中央档案库由桑瑞思（Sunrise）维护。这里保存城市、使徒、边境与日常的记录。
            <strong>公开目录向所有访客开放；限制目录与密卷层按权限调阅。</strong>
            本系统不提供定义，只提交档案。
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/archives">进入档案库</a>
            ${profile
              ? `<a class="btn btn-ghost" href="#/profile">查看权限档案</a>`
              : `<a class="btn btn-ghost" href="#/register">登记调阅资格</a>`}
            <a class="btn btn-ghost" href="#/tasks">领取调阅任务</a>
          </div>
          <div class="hero-foot">
            <span><i></i> 馆藏 ${formatCompactNumber(catalog.length)} 卷</span>
            <span><i></i> 公开层 ${formatCompactNumber(openCount)} 卷</span>
            <span><i></i> 封存层 ${formatCompactNumber(sealedCount)} 卷</span>
            <span><i></i> 米钠凘专题 ${formatCompactNumber(minasCount)} 卷</span>
          </div>
        </div>

        <aside class="status-card" aria-label="档案库状态">
          <div class="status-head">
            <span>SPA / CENTRAL ARCHIVE</span>
            <span class="live">● ONLINE</span>
          </div>
          <div class="status-grid">
            <div class="status-cell"><strong>${formatCompactNumber(catalog.length)}</strong><span>馆藏卷宗</span></div>
            <div class="status-cell"><strong>${formatCompactNumber(openCount)}</strong><span>公开调阅</span></div>
            <div class="status-cell"><strong>${formatCompactNumber(sealedCount)}</strong><span>封存 / 虚空</span></div>
            <div class="status-cell"><strong>${formatCompactNumber(state.tasks.length)}</strong><span>调阅任务</span></div>
          </div>
          <div class="status-line"><span>终端身份</span><b>${profile ? escapeHtml(profile.display_name) : '访客 / GUEST'}</b></div>
          <div class="status-line"><span>当前权限</span><b>${profile ? `${levelInfo.code} · ${levelInfo.name}` : '未登记'}</b></div>
          <div class="status-line"><span>权限来源</span><b>${staff ? '管理员核定' : (level >= 0 ? '任务 / 阅读记录' : '—')}</b></div>
          <div class="status-line"><span>数据节点</span><b>锡拉库萨 · 桑瑞思</b></div>
          <div class="status-line"><span>系统状态</span><b class="text-gold">回答中</b></div>
          <div class="status-seal">${profile ? escapeHtml(levelInfo.code) : '访客'}</div>
        </aside>
      </section>

      ${announcements.length ? `
        <section class="section section-tight">
          <div class="section-head">
            <div><p class="section-kicker">NOTICE BOARD</p><h2 class="section-title">档案库公告</h2></div>
            <a class="section-link" href="#/archives">查看全部档案 →</a>
          </div>
          <div class="announcement-list">${announcements.map(announcementCard).join('')}</div>
        </section>` : ''}

      <section class="section">
        <div class="section-head">
          <div><p class="section-kicker">FEATURED RECORDS</p><h2 class="section-title">本期推荐</h2></div>
          <a class="section-link" href="#/archives">浏览全部 ${catalog.length} 卷 →</a>
        </div>
        <div class="archive-grid">
          ${featured.map((item) => archiveCard(item, { locked: !canRead(item.clearance) })).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div><p class="section-kicker">CATEGORIES</p><h2 class="section-title">按分类检索</h2></div>
          <a class="section-link" href="#/about">编目基准 →</a>
        </div>
        <div class="category-grid">
          ${state.categories.map((category) => categoryTile(category, categoryCounts.get(category.id) || 0)).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div><p class="section-kicker">LATEST INTAKE</p><h2 class="section-title">最近归档</h2></div>
          <a class="section-link" href="#/archives">按时间排序 →</a>
        </div>
        <div class="archive-grid">
          ${latest.map((item) => archiveCard(item, { locked: !canRead(item.clearance) })).join('')}
        </div>
      </section>

      <section class="section section-tight">
        <div class="panel" style="display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:center">
          <div>
            <p class="section-kicker">JOINT ARCHIVE / BAMILEN</p>
            <h2 class="section-title" style="font-size:26px;margin:4px 0 6px">另一套档案系统，同一组身份。</h2>
            <p style="color:#b7a88d;font-size:13px;margin:0;max-width:760px">Bamilen 档案库由埃德里奥（Etherial）维护，采用蓝白科研档案风格。两站共用 Supabase 身份系统；账号、角色与权限档案互通，档案内容与风控规则各自独立。埃德里奥不是桑瑞思：共享架构，不共享记忆。</p>
          </div>
          <a class="btn btn-paper" href="https://ksayus.top/Bamilen-Archive/" target="_blank" rel="noopener">打开 Bamilen 档案库 ↗</a>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div><p class="section-kicker">SCAN ARCHIVE</p><h2 class="section-title">馆藏扫描件</h2></div>
          <span class="section-link">原件状态：已编目</span>
        </div>
        <div class="scan-strip">
          <figure class="scan"><img src="assets/img/1792649248743.webp" alt="手稿扫描件" loading="lazy"><figcaption><span>手稿 · 旧城编目</span><span>SCAN 01</span></figcaption></figure>
          <figure class="scan"><img src="assets/img/1792649248785.webp" alt="档案扫描件" loading="lazy"><figcaption><span>手稿 · 风语注</span><span>SCAN 02</span></figcaption></figure>
          <figure class="scan"><img src="assets/img/1792691907794.webp" alt="档案扫描件" loading="lazy"><figcaption><span>手稿 · 边境记录</span><span>SCAN 03</span></figcaption></figure>
          <figure class="scan"><img src="assets/img/1792691907784.webp" alt="档案扫描件" loading="lazy"><figcaption><span>手稿 · 冰原采样</span><span>SCAN 04</span></figcaption></figure>
        </div>
      </section>

      <section class="section section-tight">
        <div class="panel" style="display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:center">
          <div>
            <p class="section-kicker">CLEARANCE / TASKS</p>
            <h2 class="section-title" style="font-size:26px;margin:4px 0 6px">调阅权限不是配给的，是挣来的。</h2>
            <p style="color:#b7a88d;font-size:13px;margin:0;max-width:720px">完成每日签到、调阅档案、建立索引与完善个人档案，可提升 XP 并自动获得 I—III 级权限。IV 级（Ton）与 V 级（Nun）仅由管理员核定。</p>
          </div>
          <a class="btn btn-paper" href="#/tasks">查看任务与权限阶梯</a>
        </div>
      </section>
    `;
  },
};
