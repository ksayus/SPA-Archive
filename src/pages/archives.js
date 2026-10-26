import { state, canRead } from '../store.js';
import {
  archiveCard, clearanceInfo, debounce, emptyState, escapeHtml, setPageTitle,
} from '../ui.js';

const PAGE_SIZE = 18;

export const archives = {
  render({ app, query }) {
    setPageTitle('档案库');
    const initialCat = query.get('cat') || 'all';
    const filters = {
      q: query.get('q') || '',
      cat: state.categoryBySlug.has(initialCat) ? initialCat : 'all',
      clr: query.get('clr') || 'all',
      sort: query.get('sort') || 'new',
    };
    let page = 1;

    const counts = new Map();
    for (const item of state.catalog) {
      counts.set(item.category_id, (counts.get(item.category_id) || 0) + 1);
    }

    const catName = filters.cat === 'all'
      ? '全部档案'
      : state.categoryBySlug.get(filters.cat)?.name || '全部档案';

    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">ARCHIVE INDEX · ${state.catalog.length} RECORDS</p>
        <h1 class="page-title">${escapeHtml(catName)}</h1>
        <p class="page-desc">
          公开目录展示全部已编目档案的元数据。限制目录与密卷层条目会显示标题、摘要与所需权限，正文需达到对应等级后调阅。
          当前身份：${state.profile ? `<strong>${escapeHtml(state.profile.display_name)}</strong> · ${escapeHtml(clearanceInfo(state.profile.clearance).code)} 级` : '<strong>访客</strong> · 仅公开层'}。
        </p>
      </section>

      <div class="filter-bar">
        <div class="search-field">
          <span class="search-icon">⌕</span>
          <input type="search" id="archive-search" value="${escapeHtml(filters.q)}" placeholder="检索标题、编号、摘要、标签……" autocomplete="off" aria-label="检索档案">
        </div>
        <select class="filter-select" id="archive-clearance" aria-label="按权限筛选">
          <option value="all" ${filters.clr === 'all' ? 'selected' : ''}>全部权限</option>
          <option value="0" ${filters.clr === '0' ? 'selected' : ''}>仅公开层</option>
          <option value="2" ${filters.clr === '2' ? 'selected' : ''}>II 级及以上</option>
          <option value="3" ${filters.clr === '3' ? 'selected' : ''}>III 级及以上</option>
          <option value="4" ${filters.clr === '4' ? 'selected' : ''}>IV 级及以上</option>
        </select>
        <select class="filter-select" id="archive-sort" aria-label="排序方式">
          <option value="new" ${filters.sort === 'new' ? 'selected' : ''}>最新归档</option>
          <option value="old" ${filters.sort === 'old' ? 'selected' : ''}>最早归档</option>
          <option value="no" ${filters.sort === 'no' ? 'selected' : ''}>按档案编号</option>
          <option value="title" ${filters.sort === 'title' ? 'selected' : ''}>按标题</option>
        </select>
      </div>

      <div class="filter-chips" id="archive-cats" style="margin: 0 0 8px">
        <button class="filter-chip ${filters.cat === 'all' ? 'active' : ''}" data-cat="all">全部 <span style="opacity:.6">${state.catalog.length}</span></button>
        ${state.categories.map((category) => `
          <button class="filter-chip ${filters.cat === category.slug ? 'active' : ''}" data-cat="${escapeHtml(category.slug)}">
            ${escapeHtml(category.name)} <span style="opacity:.6">${counts.get(category.id) || 0}</span>
          </button>`).join('')}
      </div>

      <div id="archive-results"></div>
    `;

    const results = app.querySelector('#archive-results');
    const search = app.querySelector('#archive-search');
    const clrSelect = app.querySelector('#archive-clearance');
    const sortSelect = app.querySelector('#archive-sort');
    const catBar = app.querySelector('#archive-cats');

    const syncURL = () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.cat !== 'all') params.set('cat', filters.cat);
      if (filters.clr !== 'all') params.set('clr', filters.clr);
      if (filters.sort !== 'new') params.set('sort', filters.sort);
      const next = `#/archives${params.toString() ? `?${params.toString()}` : ''}`;
      history.replaceState(null, '', next);
      document.querySelectorAll('[data-nav]').forEach((link) => {
        const key = link.dataset.nav;
        if (key === 'archives') link.classList.toggle('active', filters.cat !== 'classified');
        if (key === 'classified') link.classList.toggle('active', filters.cat === 'classified');
      });
    };

    const getFiltered = () => {
      const q = filters.q.trim().toLowerCase();
      let items = state.catalog.slice();
      if (filters.cat !== 'all') {
        const category = state.categoryBySlug.get(filters.cat);
        if (category) items = items.filter((item) => item.category_id === category.id);
        else items = [];
      }
      if (filters.clr !== 'all') {
        const min = Number(filters.clr);
        items = items.filter((item) => Number(item.clearance) >= min);
      }
      if (q) {
        items = items.filter((item) => {
          const haystack = [
            item.title, item.subtitle, item.summary, item.archive_no,
            ...(item.tags || []), state.categoryById.get(item.category_id)?.name || '',
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        });
      }
      if (filters.sort === 'old') items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      else if (filters.sort === 'no') items.sort((a, b) => String(a.archive_no).localeCompare(String(b.archive_no), 'zh-CN'));
      else if (filters.sort === 'title') items.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'));
      else items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return items;
    };

    const renderResults = () => {
      const items = getFiltered();
      const visible = items.slice(0, page * PAGE_SIZE);
      const lockedCount = items.filter((item) => !canRead(item.clearance)).length;
      results.innerHTML = `
        <div class="result-meta">
          <span>命中 ${items.length} 卷 · 当前显示 ${visible.length} 卷${lockedCount ? ` · ${lockedCount} 卷需更高权限` : ''}</span>
          <span>排序：${({ new: '最新归档', old: '最早归档', no: '档案编号', title: '标题' })[filters.sort] || '最新归档'}</span>
        </div>
        ${items.length ? `
          <div class="archive-grid">${visible.map((item) => archiveCard(item, { locked: !canRead(item.clearance) })).join('')}</div>
          ${visible.length < items.length ? `<div class="load-more-wrap"><button class="btn" id="load-more">继续调阅（剩余 ${items.length - visible.length} 卷）</button></div>` : ''}
        ` : emptyState('没有匹配的档案', '试试更换关键词、分类或权限筛选。', '<div class="mt-16"><a class="btn btn-primary" href="#/archives">清除筛选</a></div>')}
      `;
      results.querySelector('#load-more')?.addEventListener('click', () => {
        page += 1;
        renderResults();
      });
    };

    search.addEventListener('input', debounce(() => {
      filters.q = search.value;
      page = 1;
      renderResults();
      syncURL();
    }, 180));

    clrSelect.addEventListener('change', () => {
      filters.clr = clrSelect.value;
      page = 1;
      renderResults();
      syncURL();
    });

    sortSelect.addEventListener('change', () => {
      filters.sort = sortSelect.value;
      page = 1;
      renderResults();
      syncURL();
    });

    catBar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cat]');
      if (!button) return;
      filters.cat = button.dataset.cat;
      page = 1;
      catBar.querySelectorAll('[data-cat]').forEach((chip) => chip.classList.toggle('active', chip === button));
      const nextName = filters.cat === 'all' ? '全部档案' : state.categoryBySlug.get(filters.cat)?.name || '全部档案';
      app.querySelector('.page-title').textContent = nextName;
      renderResults();
      syncURL();
    });

    renderResults();
  },
};
