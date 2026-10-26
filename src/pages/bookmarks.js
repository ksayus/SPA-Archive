import { supabase } from '../supabase.js';
import { state, canRead } from '../store.js';
import { archiveCard, emptyState, escapeHtml, setPageTitle, toast } from '../ui.js';

export const bookmarks = {
  async render({ app }) {
    setPageTitle('个人索引');
    if (!state.session?.user) {
      app.innerHTML = `
        <section class="page-head">
          <p class="page-kicker">PERSONAL INDEX · GUEST</p>
          <h1 class="page-title">个人索引</h1>
          <p class="page-desc">登录后可建立自己的档案索引。访客仍可浏览公开目录。</p>
        </section>
        <div class="btn-row"><a class="btn btn-primary" href="#/login?next=%2Fbookmarks">登录终端</a><a class="btn" href="#/archives">浏览档案库</a></div>`;
      return;
    }

    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', state.session.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const items = (data || []).map((bookmark) => ({
      bookmark,
      archive: state.catalogById.get(bookmark.archive_id),
    })).filter((item) => item.archive);

    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">PERSONAL INDEX · ${items.length} RECORDS</p>
        <h1 class="page-title">个人索引</h1>
        <p class="page-desc">你收藏的档案会保留在这里。限制层档案仍按当前权限显示；权限不足时，正文不可调阅。</p>
      </section>
      ${items.length ? `
        <div class="archive-grid">
          ${items.map(({ archive, bookmark }) => `
            <div class="bookmark-cell">
              ${archiveCard(archive, { locked: !canRead(archive.clearance) })}
              <div class="bookmark-cell-foot">
                <span class="mono" style="font-size:8px;color:#8f7d63">收藏于 ${new Date(bookmark.created_at).toLocaleDateString('zh-CN')}</span>
                <button class="btn btn-sm" data-remove="${escapeHtml(archive.id)}">移出索引</button>
              </div>
            </div>`).join('')}
        </div>` : emptyState('个人索引为空', '在档案页点击“加入个人索引”，条目会出现在这里。', '<div class="mt-16"><a class="btn btn-primary" href="#/archives">浏览档案库</a></div>')}
    `;

    app.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', async () => {
        const { error: removeError } = await supabase.from('bookmarks').delete().eq('archive_id', button.dataset.remove);
        if (removeError) { toast(removeError.message, 'error'); return; }
        button.closest('.bookmark-cell')?.remove();
        toast('已移出个人索引。', 'success');
      });
    });
  },
};
