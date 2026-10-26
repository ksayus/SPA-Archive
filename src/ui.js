import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { CLEARANCE_LEVELS } from './config.js';
import { state } from './store.js';

marked.setOptions({ gfm: true, breaks: true });

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderMarkdown(markdown) {
  const html = marked.parse(String(markdown || ''));
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function clearanceInfo(level) {
  return CLEARANCE_LEVELS.find((item) => item.level === Number(level)) || CLEARANCE_LEVELS[0];
}

export function clearanceBadge(level) {
  const info = clearanceInfo(level);
  return `<span class="clearance-badge ${info.cls}" title="${escapeHtml(info.name)} · ${escapeHtml(info.desc)}">${escapeHtml(info.code)} · ${escapeHtml(info.name)}</span>`;
}

export function roleName(role) {
  return ({ admin: '管理员', editor: '编目主管', user: '档案员' }[role] || '档案员');
}

export function initials(name) {
  const value = String(name || '?').trim();
  if (!value) return '?';
  if (/^[\u3400-\u9fff]/.test(value)) return value.slice(0, 1);
  return value.slice(0, 2).toUpperCase();
}

export function debounce(fn, wait = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function categoryName(categoryId) {
  return state.categoryById?.get(categoryId)?.name || '未分类';
}

export function archiveCard(item, { locked = false } = {}) {
  const tags = (item.tags || []).slice(0, 3);
  const cat = categoryName(item.category_id);
  return `
    <a class="archive-card ${locked ? 'locked' : ''}" href="#/archive/${encodeURIComponent(item.slug)}">
      <div class="card-top">
        <span class="card-no">${escapeHtml(item.archive_no)}</span>
        ${clearanceBadge(item.clearance)}
      </div>
      <h3 class="card-title">${escapeHtml(item.title)}</h3>
      <p class="card-summary">${escapeHtml(item.summary || '本档案未提供摘要。')}</p>
      <div class="card-tags">
        <span class="card-tag">${escapeHtml(cat)}</span>
        ${tags.map((tag) => `<span class="card-tag">${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="card-foot">
        <span>${escapeHtml(item.archive_no?.split('/')[1] || 'SPA')} · 约 ${Number(item.read_minutes || 1)} 分钟</span>
        <span>${locked ? '权限不足' : '调阅全文 →'}</span>
      </div>
      ${locked ? `<div class="lock-note">需 ${escapeHtml(clearanceInfo(item.clearance).code)} 级权限</div>` : ''}
      <span class="card-stamp">${locked ? '密' : '档'}</span>
    </a>`;
}

export function categoryTile(category, count) {
  return `
    <a class="category-tile" href="#/archives?cat=${encodeURIComponent(category.slug)}">
      <span class="cat-icon">${escapeHtml(category.icon || '档')}</span>
      <span class="cat-body">
        <span class="cat-name">${escapeHtml(category.name)}</span>
        <span class="cat-desc">${escapeHtml(category.description || '')}</span>
      </span>
      <span class="cat-count">${Number(count || 0)} 卷</span>
    </a>`;
}

export function emptyState(title, desc = '', action = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p>${action}</div>`;
}

export function loadingBlock(text = '正在检索档案……') {
  return `<div class="boot-screen" style="min-height:32vh"><div class="boot-seal" style="width:54px;height:54px;font-size:24px">曙</div><p class="mono">RETRIEVING</p><p>${escapeHtml(text)}</p></div>`;
}

export function setPageTitle(title) {
  document.title = title ? `${title}｜曙光中央档案库` : '曙光中央档案库｜SPA Central Archive';
}

export function toast(message, type = 'info', duration = 3600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

export function openModal({ title, kicker = '', sub = '', body = '', actions = [], wide = false, onMount, onClose }) {
  const root = document.getElementById('modal-root');
  if (!root) return () => {};
  const previousOverflow = document.body.style.overflow;
  let closed = false;

  const buttons = actions.map((action, index) => (
    `<button type="button" class="btn ${action.className || ''}" data-modal-action="${index}">${escapeHtml(action.label)}</button>`
  )).join('');

  root.innerHTML = `
    <div class="modal-card ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button class="modal-close" type="button" data-modal-close aria-label="关闭">×</button>
      ${kicker ? `<div class="modal-kicker">${escapeHtml(kicker)}</div>` : ''}
      <h2 id="modal-title">${escapeHtml(title)}</h2>
      ${sub ? `<p class="modal-sub">${escapeHtml(sub)}</p>` : ''}
      <div class="modal-body">${body}</div>
      ${buttons ? `<div class="modal-actions">${buttons}</div>` : ''}
    </div>`;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onBackdrop);
    root.innerHTML = '';
    document.body.style.overflow = previousOverflow;
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  const onBackdrop = (event) => {
    if (event.target === root) close();
  };

  root.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', close);
  });
  root.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onKey);

  root.querySelectorAll('[data-modal-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = actions[Number(button.dataset.modalAction)];
      if (!action) return;
      try {
        await action.onClick?.(root, close);
      } catch (error) {
        console.error(error);
        toast(error?.message || '操作失败', 'error');
      }
    });
  });

  document.body.style.overflow = 'hidden';
  onMount?.(root, close);
  return close;
}

export function confirmDialog(message, {
  title = '确认操作',
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const close = openModal({
      title,
      kicker: 'CONFIRMATION',
      sub: message,
      body: '',
      actions: [
        { label: cancelText, onClick: (_root, closeFn) => { finish(false); closeFn(); } },
        {
          label: confirmText,
          className: danger ? 'btn-danger' : 'btn-primary',
          onClick: (_root, closeFn) => { finish(true); closeFn(); },
        },
      ],
      onClose: () => finish(false),
    });
    return close;
  });
}

export function renderFormError(message) {
  return `<p class="form-error" role="alert">${escapeHtml(message)}</p>`;
}

export function formatCompactNumber(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('zh-CN').format(n);
}
