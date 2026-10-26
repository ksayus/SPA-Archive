import { supabase } from '../supabase.js';
import { state, refreshProfile } from '../store.js';
import {
  clearanceInfo, escapeHtml, openModal, setPageTitle, toast,
} from '../ui.js';
import { navigate } from '../router.js';

const TASK_CATEGORY = {
  daily: '每日', weekly: '每周', once: '一次性', manual: '人工审核',
};

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

function periodKey(task) {
  const now = new Date();
  if (task.category === 'daily') return now.toISOString().slice(0, 10);
  if (task.category === 'weekly') return isoWeek(now);
  if (task.category === 'once') return 'once';
  return null;
}

function requirement(task) {
  if (!task.requirement) return { type: 'always' };
  if (typeof task.requirement === 'string') {
    try { return JSON.parse(task.requirement); } catch { return { type: 'always' }; }
  }
  return task.requirement;
}

function requirementText(task) {
  const req = requirement(task);
  switch (req.type) {
    case 'read_count':
      return req.window === 'day' ? `今日调阅 ${req.count || 1} 份档案` : `累计调阅 ${req.count || 1} 份档案`;
    case 'bookmark_count':
      return `在个人索引中收藏 ${req.count || 1} 份档案`;
    case 'category_count':
      return `在 ${req.count || 1} 个不同分类中各调阅至少 1 份档案`;
    case 'profile_complete':
      return '显示名称至少 2 个字符，简介至少 8 个字符';
    case 'read_clearance':
      return `调阅至少 ${req.count || 1} 份 ${clearanceInfo(req.min || 1).code} 级或以上档案`;
    case 'minas_count':
      return `阅读至少 ${req.count || 1} 份米钠凘个人档案`;
    case 'streak':
      return `连续 ${req.count || 7} 天完成每日签到`;
    case 'manual':
      return '提交材料，由管理员审核';
    default:
      return '无额外条件，可直接领取';
  }
}

function ladderHtml() {
  const xp = Number(state.profile?.xp || 0);
  const current = Number(state.profile?.clearance ?? -1);
  const thresholds = [0, 100, 350, 900, null, null];
  return [0, 1, 2, 3, 4, 5].map((n) => {
    const info = clearanceInfo(n);
    const req = thresholds[n] === null ? '管理员核定' : `${thresholds[n]} XP`;
    return `<div class="ladder-card ${n === current ? 'current' : ''}">
      <div class="lvl">${info.code}</div>
      <div class="lvl-name">${info.name}</div>
      <div class="lvl-req">${req}${n === current ? `<br><span style="color:#c9a35c">当前 · ${xp} XP</span>` : ''}</div>
    </div>`;
  }).join('');
}

function progressHtml() {
  const xp = Number(state.profile?.xp || 0);
  const current = Number(state.profile?.clearance ?? 0);
  const nextThreshold = [100, 350, 900].find((threshold) => xp < threshold);
  const previous = xp < 100 ? 0 : xp < 350 ? 100 : xp < 900 ? 350 : 900;
  const pct = nextThreshold ? Math.min(100, Math.max(0, Math.round(((xp - previous) / (nextThreshold - previous)) * 100))) : 100;
  return `
    <div class="panel">
      <div class="panel-head">
        <h2 style="font-size:18px">权限进度</h2>
        <span class="mono" style="font-size:9px;color:#c9a35c">${xp} XP</span>
      </div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="progress-label">
        <span>当前：${clearanceInfo(current).code} · ${clearanceInfo(current).name}</span>
        <span>${nextThreshold ? `下一级 ${nextThreshold} XP · 还差 ${Math.max(0, nextThreshold - xp)} XP` : '已达自动晋升上限；IV / V 级由管理员核定'}</span>
      </div>
      <p class="form-note mt-16">自动晋升上限为 III 级（NIM+ · 900 XP）。IV 级（TON）与 V 级（NUN）仅由管理员核定，不通过任务自动授予。</p>
    </div>`;
}

function taskCard(task, completion, { loggedIn }) {
  const status = completion?.status;
  const done = status === 'completed' || status === 'approved';
  const pending = status === 'pending';
  const reward = `+${Number(task.reward_xp || 0)} XP · +${Number(task.reward_points || 0)} 点`;
  let action = '';
  if (!loggedIn) {
    action = `<a class="btn btn-sm" href="#/login?next=${encodeURIComponent('/tasks')}">登录后领取</a>`;
  } else if (done) {
    action = `<button class="btn btn-sm" disabled>本期已完成</button>`;
  } else if (pending) {
    action = `<button class="btn btn-sm" disabled>等待审核</button>`;
  } else if (task.category === 'manual') {
    action = `<button class="btn btn-sm btn-primary" data-claim="${escapeHtml(task.slug)}">提交材料</button>`;
  } else {
    action = `<button class="btn btn-sm btn-primary" data-claim="${escapeHtml(task.slug)}">领取任务</button>`;
  }

  return `
    <article class="task-card ${done ? 'done' : ''} ${pending ? 'pending' : ''}">
      <div class="task-top">
        <span class="task-cat">${escapeHtml(TASK_CATEGORY[task.category] || task.category)} · ${escapeHtml(task.slug)}</span>
        <span class="task-reward">${reward}</span>
      </div>
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      <p class="task-desc">${escapeHtml(task.description || '')}<br><span style="color:#8a7454">条件：${escapeHtml(requirementText(task))}</span></p>
      <div class="task-foot">
        <span class="task-status ${done ? 'ok' : pending ? 'wait' : ''}">
          ${done ? '● 已完成' : pending ? '● 待审核' : '○ 可领取'}
        </span>
        ${action}
      </div>
    </article>`;
}

export const tasks = {
  async render({ app }) {
    setPageTitle('调阅任务');
    const loggedIn = Boolean(state.session?.user);

    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">CLEARANCE TASKS · ${state.tasks.length} ACTIVE</p>
        <h1 class="page-title">调阅任务</h1>
        <p class="page-desc">完成任务可获得 XP 与通用点数。XP 达到 100 / 350 / 900 时，桑瑞思会自动更新你的权限档案至 I / II / III 级。IV 级与 V 级仅由管理员核定。</p>
      </section>
      <div class="section-tight">
        <div class="ladder" id="task-ladder">${ladderHtml()}</div>
        <div id="task-progress">${loggedIn ? progressHtml() : ''}</div>
      </div>
      <div class="section-tight">
        <div class="section-head">
          <div><p class="section-kicker">TASK BOARD</p><h2 class="section-title">任务清单</h2></div>
          <span class="section-link">${loggedIn ? '任务记录已接入' : '访客仅可查看'}</span>
        </div>
        <div class="task-grid" id="task-grid"></div>
      </div>
    `;

    const grid = app.querySelector('#task-grid');
    let completions = [];

    const completionFor = (task) => {
      if (task.category === 'manual') {
        return completions.find((item) => item.task_id === task.id && item.status === 'pending')
          || completions.find((item) => item.task_id === task.id && item.status === 'approved')
          || null;
      }
      const key = periodKey(task);
      return completions.find((item) => item.task_id === task.id && item.period_key === key && ['completed', 'pending', 'approved'].includes(item.status)) || null;
    };

    const renderGrid = () => {
      grid.innerHTML = state.tasks.map((task) => taskCard(task, completionFor(task), { loggedIn })).join('')
        || '<div class="empty-state"><strong>任务板为空</strong><p>管理员尚未发布任务。</p></div>';
      grid.querySelectorAll('[data-claim]').forEach((button) => {
        button.addEventListener('click', () => claim(state.tasks.find((task) => task.slug === button.dataset.claim)));
      });
    };

    const refreshTaskState = async () => {
      await refreshProfile();
      if (state.session?.user) {
        const { data, error } = await supabase
          .from('task_completions')
          .select('*')
          .eq('user_id', state.session.user.id)
          .order('completed_at', { ascending: false })
          .limit(300);
        if (!error) completions = data || [];
      }
      app.querySelector('#task-ladder').innerHTML = ladderHtml();
      app.querySelector('#task-progress').innerHTML = state.session?.user ? progressHtml() : '';
      renderGrid();
    };

    const claim = async (task) => {
      if (!task) return;
      if (!state.session?.user) {
        navigate(`/login?next=${encodeURIComponent('/tasks')}`);
        return;
      }
      if (task.category === 'manual') {
        openModal({
          title: task.title,
          kicker: 'MANUAL SUBMISSION',
          sub: task.description || '',
          body: `
            <div class="field">
              <label for="task-proof">提交材料 / 说明</label>
              <textarea id="task-proof" placeholder="请说明你完成的纠错、补充或异常报告内容，至少 10 个字符。"></textarea>
              <span class="hint">条件：${escapeHtml(requirementText(task))}</span>
            </div>
            <p class="form-note mt-16">提交后进入管理员审核队列。审核通过后发放奖励；被驳回后可重新提交。</p>`,
          actions: [
            { label: '取消', onClick: (_root, close) => close() },
            {
              label: '提交审核',
              className: 'btn-primary',
              onClick: async (root, close) => {
                const proof = root.querySelector('#task-proof').value.trim();
                if (proof.length < 10) { toast('请填写至少 10 个字符。', 'error'); return; }
                const { data, error } = await supabase.rpc('claim_task', { p_task_slug: task.slug, p_proof: proof });
                if (error) { toast(error.message, 'error'); return; }
                if (!data?.ok) { toast(data?.error || '提交失败', 'error'); return; }
                close();
                toast(data.message || '已提交，等待管理员审核。', 'success');
                await refreshTaskState();
              },
            },
          ],
        });
        return;
      }

      const { data, error } = await supabase.rpc('claim_task', { p_task_slug: task.slug });
      if (error) { toast(error.message, 'error'); return; }
      if (!data?.ok) {
        toast(data?.error || '条件尚未满足', 'error');
        return;
      }
      toast(`${data.message || '任务完成'} · +${data.xp || 0} XP`, 'success');
      await refreshTaskState();
    };

    if (loggedIn) {
      const { data, error } = await supabase
        .from('task_completions')
        .select('*')
        .eq('user_id', state.session.user.id)
        .order('completed_at', { ascending: false })
        .limit(300);
      if (error) console.warn(error.message);
      completions = data || [];
    }

    renderGrid();
  },
};
