import { initStore, state, subscribe, isStaff, signOut } from './store.js';
import {
  clearanceInfo, escapeHtml, initials, roleName, toast,
} from './ui.js';
import { defineRoutes, startRouter, navigate } from './router.js';

import { home } from './pages/home.js';
import { archives } from './pages/archives.js';
import { archive } from './pages/archive.js';
import { login } from './pages/login.js';
import { register } from './pages/register.js';
import { tasks } from './pages/tasks.js';
import { profile } from './pages/profile.js';
import { bookmarks } from './pages/bookmarks.js';
import { about } from './pages/about.js';
import { admin } from './pages/admin.js';

defineRoutes([
  { pattern: /^\/$/, page: home, nav: 'home' },
  { pattern: /^\/archives$/, page: archives, nav: 'archives' },
  { pattern: /^\/archive\/([^/]+)$/, page: archive, nav: 'archives' },
  { pattern: /^\/login$/, page: login, nav: 'login' },
  { pattern: /^\/register$/, page: register, nav: 'register' },
  { pattern: /^\/tasks$/, page: tasks, nav: 'tasks' },
  { pattern: /^\/profile$/, page: profile, nav: 'profile' },
  { pattern: /^\/bookmarks$/, page: bookmarks, nav: 'bookmarks' },
  { pattern: /^\/about$/, page: about, nav: 'about' },
  { pattern: /^\/admin$/, page: admin, nav: 'admin' },
]);

function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toISOString().slice(11, 19);
  };
  tick();
  window.setInterval(tick, 1000);
}

function authMarkup() {
  if (state.session?.user && state.profile) {
    const p = state.profile;
    const level = clearanceInfo(p.clearance);
    return `
      <a class="user-chip" href="#/profile" title="查看权限档案">
        <span class="user-avatar">${escapeHtml(initials(p.display_name))}</span>
        <span class="user-chip-text">
          <strong>${escapeHtml(p.display_name)}</strong>
          <small>${escapeHtml(level.code)} · ${escapeHtml(roleName(p.role))}</small>
        </span>
      </a>
      ${isStaff() ? '<a class="auth-link" href="#/admin">控制台</a>' : ''}
      <button class="auth-link" type="button" data-logout>退出</button>`;
  }
  if (state.session?.user) {
    return '<span class="auth-link">核验身份…</span>';
  }
  return `
    <a class="auth-link" href="#/login">登录</a>
    <a class="auth-link primary" href="#/register">登记</a>`;
}

let lastAuthMarkup = '';

function renderAuth() {
  const html = authMarkup();
  if (html === lastAuthMarkup) return;
  lastAuthMarkup = html;

  const header = document.getElementById('auth-area');
  const mobile = document.getElementById('mobile-auth');
  if (header) header.innerHTML = html;
  if (mobile) mobile.innerHTML = html;

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await signOut();
        toast('已退出终端。', 'success');
        navigate('/');
      } catch (error) {
        toast(error?.message || '退出失败，请重试。', 'error');
      }
    });
  });
}

function setupMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('mobile-nav');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    toggle.textContent = open ? '×' : '☰';
  };

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  window.addEventListener('hashchange', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) setOpen(false);
  });
}

function setupHeaderSearch() {
  const form = document.getElementById('header-search');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input[name="q"]');
    const q = input?.value.trim() || '';
    navigate(q ? `/archives?q=${encodeURIComponent(q)}` : '/archives');
  });
}

function renderBootError(message) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="boot-screen" style="min-height:64vh">
      <div class="boot-seal" style="animation:none;border-color:#7a241c;color:#c04a3a">断</div>
      <p class="mono">CONNECTION FAILED</p>
      <p style="max-width:520px;color:#b7a88d">桑瑞思归档系统未能完成接入。这通常是网络问题，也可能是档案层正在维护。</p>
      <div class="error-box" style="margin-top:14px;text-align:left"><strong>错误信息：</strong>${escapeHtml(message || '未知错误')}</div>
      <div class="btn-row" style="margin-top:20px;justify-content:center">
        <button class="btn btn-primary" id="boot-retry">重新接入</button>
        <a class="btn" href="#/about">查看编目基准</a>
      </div>
    </div>`;
  app.querySelector('#boot-retry')?.addEventListener('click', () => location.reload());
}

async function boot() {
  startClock();
  setupMobileMenu();
  setupHeaderSearch();

  subscribe(() => {
    renderAuth();
  });

  try {
    await initStore();
  } catch (error) {
    console.error(error);
    renderBootError(error?.message || '无法接入档案库');
    return;
  }

  if (!state.ready) {
    renderBootError(state.error || '无法接入档案库');
    return;
  }

  renderAuth();
  startRouter();
}

boot();
