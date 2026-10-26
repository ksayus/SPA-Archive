import { supabase } from '../supabase.js';
import { refreshProfile } from '../store.js';
import { SITE } from '../config.js';
import { escapeHtml, setPageTitle, toast } from '../ui.js';
import { navigate } from '../router.js';

export const register = {
  render({ app, query }) {
    setPageTitle('登记调阅资格');
    const next = query.get('next') || '/profile';
    app.innerHTML = `
      <section class="auth-wrap">
        <div class="auth-paper">
          <p class="page-kicker">ENLISTMENT · NEW ACCOUNT</p>
          <h1>登记调阅资格</h1>
          <p class="auth-sub">新档案员从 0 级（Vel · 公开）开始。完成调阅任务、积累 XP，可自动升至 I—III 级。IV 级（Ton）与 V 级（Nun）仅由管理员核定。</p>
          <form id="register-form" novalidate>
            <div class="field">
              <label for="reg-name">显示名称</label>
              <input type="text" id="reg-name" name="displayName" maxlength="40" placeholder="你在档案库中使用的名字" required>
            </div>
            <div class="field mt-16">
              <label for="reg-email">登记邮箱</label>
              <input type="email" id="reg-email" name="email" autocomplete="email" placeholder="name@example.com" required>
            </div>
            <div class="field mt-16">
              <label for="reg-password">密码</label>
              <input type="password" id="reg-password" name="password" autocomplete="new-password" placeholder="至少 8 位" minlength="8" required>
            </div>
            <div class="field mt-16">
              <label for="reg-invite">调阅申请码</label>
              <input type="text" id="reg-invite" name="invite" placeholder="SPA-ENLIST-2026" required>
              <span class="hint">本期开放登记申请码：<code>${escapeHtml(SITE.inviteCode)}</code>。该码仅用于限制公开注册，不代表任何权限等级。</span>
            </div>
            <div id="register-error"></div>
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" id="register-submit">提交登记</button>
              <a class="btn" href="#/login">已有账号登录</a>
            </div>
          </form>
          <p class="auth-switch">登记即表示你同意遵守档案库调阅规则：不转载限制层与密卷层正文，不冒用他人身份，不尝试绕过访问控制。</p>
        </div>
        <aside class="auth-aside">
          <div>
            <p class="page-kicker">SELTA / OATH</p>
            <h2>“我的风，你的风，<br>我们是同一阵风。”</h2>
            <p class="auth-quote">Kae vel, tae vel, mo un vel.</p>
          </div>
          <div>
            <p class="mono" style="font-size:9px;letter-spacing:.16em;color:#8f7d63">CLEARANCE PATH</p>
            <p style="font-size:11.5px">0 级公开 → 100 XP 内部 → 350 XP 限制 → 900 XP 机密。阅读、签到、收藏、纠错均可获得 XP。</p>
            <p class="mono" style="font-size:8px;letter-spacing:.12em;color:#6f604c">THE ARCHIVE REMEMBERS</p>
          </div>
        </aside>
      </section>`;

    const form = app.querySelector('#register-form');
    const errorBox = app.querySelector('#register-error');
    const submit = app.querySelector('#register-submit');

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.innerHTML = '';
      const displayName = form.displayName.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const invite = form.invite.value.trim();

      if (!displayName || !email || !password || !invite) {
        errorBox.innerHTML = '<p class="form-error">请填写全部字段。</p>';
        return;
      }
      if (password.length < 8) {
        errorBox.innerHTML = '<p class="form-error">密码至少需要 8 位。</p>';
        return;
      }

      submit.disabled = true;
      submit.textContent = '正在登记……';
      try {
        const { data, error } = await supabase.rpc('register_account', {
          p_email: email,
          p_password: password,
          p_display_name: displayName,
          p_invite: invite,
        });
        if (error) {
          errorBox.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`;
          return;
        }
        if (!data?.ok) {
          errorBox.innerHTML = `<p class="form-error">${escapeHtml(data?.error || '登记失败')}</p>`;
          return;
        }

        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) {
          toast('登记成功，但自动登录失败。请手动登录。', 'info');
          navigate('/login');
          return;
        }
        await refreshProfile();
        toast('登记完成。你的权限档案已建立。', 'success');
        navigate(next.startsWith('/') ? next : '/profile');
      } catch (error) {
        errorBox.innerHTML = `<p class="form-error">${escapeHtml(error.message || '登记失败')}</p>`;
      } finally {
        submit.disabled = false;
        submit.textContent = '提交登记';
      }
    });
  },
};
