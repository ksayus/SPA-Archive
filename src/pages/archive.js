import { supabase } from '../supabase.js';
import { state, canRead, isStaff } from '../store.js';
import {
  archiveCard, clearanceInfo, escapeHtml, formatDate,
  openModal, renderMarkdown, setPageTitle, toast,
} from '../ui.js';

function renderDenied(app, { title = '权限不足', message = '当前账号无权调阅此档案。' } = {}) {
  setPageTitle(title);
  app.innerHTML = `
    <section class="page-head">
      <p class="page-kicker">ACCESS DENIED</p>
      <h1 class="page-title">${escapeHtml(title)}</h1>
      <p class="page-desc">${escapeHtml(message)}</p>
    </section>
    <div class="btn-row"><a class="btn btn-primary" href="#/archives">返回档案库</a></div>
  `;
}

export const archive = {
  async render({ app, params, setCleanup }) {
    const slug = params[0];
    const catalogItem = state.catalogBySlug.get(slug);

    if (!catalogItem) {
      setPageTitle('档案不存在');
      app.innerHTML = `
        <section class="page-head">
          <p class="page-kicker">NOT FOUND · ${escapeHtml(slug || '')}</p>
          <h1 class="page-title">目录中没有这卷档案</h1>
          <p class="page-desc">可能是编号错误，也可能该条目已归入 <code>NUN</code> 层，不再出现在公开目录。</p>
        </section>
        <div class="btn-row"><a class="btn btn-primary" href="#/archives">返回档案库</a></div>`;
      return;
    }

    if (!canRead(catalogItem.clearance)) {
      renderDenied(app);
      return;
    }

    const { data: record, error } = await supabase
      .from('archives')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!record) {
      renderDenied(app, { title: '档案暂时无法调阅', message: '档案正文未能载入，请稍后再试。' });
      return;
    }

    let bookmarked = false;
    if (state.session?.user) {
      const { data: bookmark } = await supabase
        .from('bookmarks')
        .select('archive_id')
        .eq('archive_id', record.id)
        .maybeSingle();
      bookmarked = Boolean(bookmark);
    }

    const related = state.catalog
      .filter((item) => item.category_id === record.category_id && item.id !== record.id)
      .slice(0, 3);

    const meta = record.metadata || {};
    const metaRows = Object.entries(meta)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd></div>`)
      .join('');

    const required = clearanceInfo(record.clearance);
    const category = state.categoryById.get(record.category_id);
    const canEdit = isStaff();

    setPageTitle(record.title);
    app.innerHTML = `
      <div class="archive-page">
        <article class="doc-paper" id="doc-paper">
          <header class="doc-header">
            <p class="doc-kicker">${escapeHtml(record.archive_no)} · ${escapeHtml(category?.name || '未分类')} · ${escapeHtml(required.code)} / ${escapeHtml(required.name)}</p>
            <h1 class="doc-title">${escapeHtml(record.title)}</h1>
            ${record.subtitle ? `<p class="doc-sub">${escapeHtml(record.subtitle)}</p>` : ''}
            <div class="doc-stamp">${escapeHtml(required.code)}<br>${escapeHtml(required.name)}</div>
          </header>
          ${metaRows ? `<dl class="doc-meta">${metaRows}</dl>` : ''}
          <div class="prose">${renderMarkdown(record.content)}</div>
          <footer style="margin-top:34px;padding-top:14px;border-top:1px solid #d2c09e;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <span class="mono" style="font-size:8px;color:#8a7454;letter-spacing:.1em">SPA CENTRAL ARCHIVE · ${escapeHtml(record.archive_no)}</span>
            <span class="mono" style="font-size:8px;color:#8a7454;letter-spacing:.1em">调阅记录已登记 · ${formatDate(record.updated_at)}</span>
          </footer>
        </article>

        <aside class="side-stack">
          <div class="side-card">
            <h3>DOCUMENT CONTROL</h3>
            <div class="side-kv"><span>档案编号</span><span>${escapeHtml(record.archive_no)}</span></div>
            <div class="side-kv"><span>密级</span><span>${escapeHtml(required.code)} · ${escapeHtml(required.name)}</span></div>
            <div class="side-kv"><span>分类</span><span>${escapeHtml(category?.name || '未分类')}</span></div>
            <div class="side-kv"><span>阅读时长</span><span>约 ${Number(record.read_minutes || 1)} 分钟</span></div>
            <div class="side-kv"><span>调阅次数</span><span id="doc-views">${Number(record.views || 0)}</span></div>
            <div class="side-kv"><span>最后编目</span><span>${formatDate(record.updated_at, false)}</span></div>
          </div>

          <div class="side-card">
            <h3>ACTIONS</h3>
            <div class="side-actions">
              <button class="btn btn-sm" id="bookmark-btn">${bookmarked ? '移出个人索引' : '加入个人索引'}</button>
              <button class="btn btn-sm" id="copy-link">复制档案链接</button>
              <button class="btn btn-sm" id="feedback-btn">提交纠错 / 补充</button>
              ${canEdit ? `<a class="btn btn-sm" href="#/admin?tab=archives&edit=${encodeURIComponent(record.id)}">编辑档案</a>` : ''}
            </div>
          </div>

          <div class="side-card">
            <h3>ACCESS NOTE</h3>
            <p>${state.profile ? `当前身份：${escapeHtml(state.profile.display_name)} · ${escapeHtml(clearanceInfo(state.profile.clearance).code)} 级。` : '当前为访客身份，仅可调阅公开层。'}</p>
            <p>本卷已通过访问控制校验。正文不会出现在公开目录接口中。</p>
            <a class="section-link" href="#/tasks">查看权限阶梯 →</a>
          </div>

          <div class="side-card">
            <h3>ARCHIVE NO.</h3>
            <p class="mono" style="font-size:10px;color:#c9a35c;word-break:break-all">${escapeHtml(record.archive_no)}</p>
            <p style="font-size:10px">${escapeHtml((record.tags || []).join(' / '))}</p>
          </div>
        </aside>
      </div>

      ${related.length ? `
        <section class="section">
          <div class="section-head">
            <div><p class="section-kicker">RELATED RECORDS</p><h2 class="section-title">同分类档案</h2></div>
            <a class="section-link" href="#/archives?cat=${encodeURIComponent(category?.slug || '')}">查看分类 →</a>
          </div>
          <div class="related-grid">${related.map((item) => archiveCard(item, { locked: !canRead(item.clearance) })).join('')}</div>
        </section>` : ''}
    `;

    const progress = document.createElement('div');
    progress.className = 'reading-progress';
    document.body.appendChild(progress);
    const onScroll = () => {
      const paper = app.querySelector('#doc-paper');
      if (!paper) return;
      const rect = paper.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight * 0.55);
      const done = Math.min(1, Math.max(0, (-rect.top + 120) / total));
      progress.style.width = `${done * 100}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      progress.remove();
    };
    setCleanup(cleanup);

    // Register a reading event. Public visitors increment views; members also get reading history.
    const bumpViewCount = () => {
      const views = app.querySelector('#doc-views');
      if (views) views.textContent = String(Number(views.textContent || 0) + 1);
    };
    if (state.session?.user) {
      supabase.rpc('mark_archive_read', { p_archive_id: record.id }).then(({ data, error: readError }) => {
        if (readError) console.warn('mark_archive_read failed', readError.message);
        else if (data?.ok) bumpViewCount();
      });
    } else {
      supabase.rpc('record_archive_view', { p_archive_id: record.id }).then(({ data, error: viewError }) => {
        if (viewError) console.warn('record_archive_view failed', viewError.message);
        else if (data?.ok) bumpViewCount();
      });
    }

    const bookmarkBtn = app.querySelector('#bookmark-btn');
    bookmarkBtn?.addEventListener('click', async () => {
      if (!state.session?.user) {
        toast('请先登录后再建立个人索引。', 'info');
        location.hash = '#/login?next=' + encodeURIComponent(`/archive/${slug}`);
        return;
      }
      if (bookmarked) {
        const { error: removeError } = await supabase.from('bookmarks').delete().eq('archive_id', record.id);
        if (removeError) { toast(removeError.message, 'error'); return; }
        bookmarked = false;
        bookmarkBtn.textContent = '加入个人索引';
        toast('已移出个人索引。', 'success');
      } else {
        const { error: addError } = await supabase.from('bookmarks').insert({
          user_id: state.session.user.id,
          archive_id: record.id,
        });
        if (addError) { toast(addError.message, 'error'); return; }
        bookmarked = true;
        bookmarkBtn.textContent = '移出个人索引';
        toast('已加入个人索引。', 'success');
      }
    });

    app.querySelector('#copy-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        toast('档案链接已复制。', 'success');
      } catch {
        toast('复制失败，请手动复制地址栏链接。', 'error');
      }
    });

    app.querySelector('#feedback-btn')?.addEventListener('click', () => {
      if (!state.session?.user) {
        toast('请先登录后再提交纠错或补充。', 'info');
        location.hash = '#/login?next=' + encodeURIComponent(`/archive/${slug}`);
        return;
      }
      openModal({
        title: '提交纠错 / 补充',
        kicker: 'ARCHIVE FEEDBACK',
        sub: `${record.archive_no} · ${record.title}`,
        body: `
          <div class="field">
            <label for="feedback-kind">类型</label>
            <select id="feedback-kind">
              <option value="correction">档案纠错</option>
              <option value="addition">补充材料</option>
              <option value="report">异常报告</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="field mt-16">
            <label for="feedback-content">内容</label>
            <textarea id="feedback-content" placeholder="请描述需要修正或补充的内容，至少 5 个字符。" minlength="5"></textarea>
          </div>
          <p class="form-note mt-16">提交后进入管理员审核队列。通过后可获得 XP 与通用点数。</p>`,
        actions: [
          { label: '取消', onClick: (_root, close) => close() },
          {
            label: '提交报告',
            className: 'btn-primary',
            onClick: async (root, close) => {
              const kind = root.querySelector('#feedback-kind').value;
              const content = root.querySelector('#feedback-content').value.trim();
              if (content.length < 5) { toast('请填写至少 5 个字符。', 'error'); return; }
              const { data, error: submitError } = await supabase.rpc('submit_feedback', {
                p_archive_id: record.id,
                p_kind: kind,
                p_content: content,
              });
              if (submitError) { toast(submitError.message, 'error'); return; }
              if (!data?.ok) { toast(data?.error || '提交失败', 'error'); return; }
              close();
              toast(data.message || '报告已归档，等待审核。', 'success');
            },
          },
        ],
      });
    });

    // Return cleanup through the router hook.
    app.dataset.cleanup = 'reading-progress';
  },
};
