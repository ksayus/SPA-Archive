import { state } from './store.js';
import { loadingBlock, setPageTitle, escapeHtml } from './ui.js';

let routes = [];
let activeCleanup = null;
let renderToken = 0;
let currentRoute = null;

export function defineRoutes(list) {
  routes = list;
}

export function parseLocation() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  let path = pathPart || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return { path, query: new URLSearchParams(queryPart) };
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === target) {
    renderRoute();
    return;
  }
  if (replace) {
    history.replaceState(null, '', target);
    renderRoute();
  } else {
    location.hash = target;
  }
}

export function currentPath() {
  return parseLocation().path;
}

function updateNav(route, path) {
  const cat = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const key = link.dataset.nav;
    let active = route?.nav === key;
    if (key === 'archives' && path === '/archives') active = cat !== 'classified';
    if (key === 'classified' && path === '/archives') active = cat === 'classified';
    link.classList.toggle('active', Boolean(active));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export async function renderRoute() {
  const token = ++renderToken;
  if (activeCleanup) {
    try { activeCleanup(); } catch (error) { console.error(error); }
    activeCleanup = null;
  }

  const app = document.getElementById('app');
  if (!app) return;
  const { path, query } = parseLocation();

  if (!state.ready) {
    app.innerHTML = loadingBlock('正在接入桑瑞思归档系统……');
    return;
  }

  app.innerHTML = loadingBlock();
  let matched = null;
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (match) {
      matched = { route, params: match.slice(1).map((value) => decodeURIComponent(value)) };
      break;
    }
  }

  currentRoute = matched?.route || null;
  updateNav(currentRoute, path);
  document.body.dataset.route = path;

  if (!matched) {
    setPageTitle('未找到档案');
    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">ERROR · 404</p>
        <h1 class="page-title">目录中没有这一页</h1>
        <p class="page-desc">桑瑞思检索了全部公开索引，没有找到对应条目。可能是编号错误，也可能该条目已归入 <code>NUN</code> 层。</p>
      </section>
      <div class="btn-row"><a class="btn btn-primary" href="#/archives">返回档案库</a><a class="btn" href="#/">回到首页</a></div>`;
    return;
  }

  try {
    await matched.route.page.render({
      app,
      query,
      params: matched.params,
      path,
      setCleanup(fn) { activeCleanup = fn; },
    });
    if (token !== renderToken) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    console.error(error);
    if (token !== renderToken) return;
    setPageTitle('调阅中断');
    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">SYSTEM FAULT</p>
        <h1 class="page-title">调阅中断</h1>
        <p class="page-desc">桑瑞思未能完成本次检索。这可能是网络问题，也可能是档案层正在维护。</p>
      </section>
      <div class="error-box"><strong>错误信息：</strong>${escapeHtml(error?.message || '未知错误')}</div>
      <div class="btn-row mt-24"><button class="btn btn-primary" id="retry-route">重试</button><a class="btn" href="#/">回到首页</a></div>`;
    app.querySelector('#retry-route')?.addEventListener('click', () => renderRoute());
  }
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

export { currentRoute };
