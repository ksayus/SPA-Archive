import { state } from '../store.js';
import { clearanceInfo, escapeHtml, setPageTitle } from '../ui.js';

export const about = {
  render({ app }) {
    setPageTitle('编目基准');
    const total = state.catalog.length;
    const byLevel = [0, 1, 2, 3, 4, 5].map((level) => ({
      level,
      info: clearanceInfo(level),
      count: state.catalog.filter((item) => Number(item.clearance) === level).length,
    }));

    app.innerHTML = `
      <section class="page-head">
        <p class="page-kicker">CATALOGUE STANDARD · SPA / AR</p>
        <h1 class="page-title">编目基准</h1>
        <p class="page-desc">本页说明档案库的密级、标签、调阅规则与站点边界。档案正文为《死潮》同人创作；现实中的站点维护者不主张任何官方身份。</p>
      </section>

      <div class="about-grid">
        <article class="about-paper">
          <h2>一、档案库是什么</h2>
          <p>SPA 中央档案库（SPA Central Archive）是《死潮》世界观下的同人档案站。站点以桑瑞思（Sunrise）的归档口吻整理人物、事件、组织、地点、科研与日常记录，并收录米钠凘个人档案专题。</p>
          <p>档案分为公开层、限制层与密卷层。公开层向所有访客开放；限制层与密卷层需要登记账号并达到对应权限。目录元数据（标题、摘要、编号、密级）对访客可见，正文由数据库行级安全策略保护。</p>

          <h2>二、密级与标签</h2>
          <p>SPA 使用 Veltak 档案标签：<code>Vel</code>（风／开放）、<code>Nim</code>（月／夜）、<code>Ton</code>（石／记忆）、<code>Nun</code>（虚空／零）。站点将标签细分为六级，便于任务系统自动晋升：</p>
          <ul>
            <li><strong>0 · VEL</strong>：公开。任何访客可调阅。</li>
            <li><strong>1 · VEL+</strong>：内部。100 XP 自动授予。</li>
            <li><strong>2 · NIM</strong>：限制。350 XP 自动授予。</li>
            <li><strong>3 · NIM+</strong>：机密。900 XP 自动授予。</li>
            <li><strong>4 · TON</strong>：封存。仅管理员核定。</li>
            <li><strong>5 · NUN</strong>：虚空。仅管理员核定；部分条目不在公开目录中。</li>
          </ul>

          <h2>三、权限如何提升</h2>
          <p>登记账号后，完成“调阅任务”可获得 XP 与通用点数。XP 达到 100 / 350 / 900 时，系统会自动将权限提升至 I / II / III 级。阅读、签到、收藏、完善资料与纠错均可计入任务条件。</p>
          <p>IV 级与 V 级不通过任务自动授予。它们由管理员根据档案贡献、审核记录与站点需要核定。管理员与编目主管拥有编辑权限，但不会因此获得“会长”或“使徒”的虚构身份。</p>
          <blockquote>权限是调阅范围，不是叙事地位。桑瑞思不因为一个人能读更多档案，就认为他更重要。</blockquote>

          <h2>四、调阅规则</h2>
          <ol>
            <li>不转载限制层与密卷层正文。目录摘要可以引用，正文不可以。</li>
            <li>不冒用他人身份，不尝试绕过访问控制，不批量抓取档案。</li>
            <li>纠错与补充请通过档案页的“提交纠错 / 补充”提交，不要直接在公开渠道传播未核实内容。</li>
            <li>档案中的“桑瑞思附注”是叙事装置，不代表现实中的系统判断。</li>
            <li>站点为同人创作，与任何现实组织、企业、政府无关。</li>
          </ol>

          <h2>五、技术说明</h2>
          <p>站点为静态页面，托管于 GitHub Pages；账号、权限、任务、阅读记录与档案正文存放于 Supabase。前端使用 Supabase 匿名发布密钥，所有敏感操作通过数据库函数与行级安全策略执行。密卷正文不会进入公开目录接口。</p>
          <p>如果页面显示“权限不足”，通常不是网络错误，而是当前账号的权限档案低于该档案密级。可在“调阅任务”中提升，或联系管理员核定。</p>

          <h2>六、联合档案</h2>
          <p>Bamilen 档案库（<a href="https://ksayus.top/Bamilen-Archive/" target="_blank" rel="noopener">Bamilen Archive</a>）是同一世界观下的另一套档案站，由 Bamilen 自主研发的智能体埃德里奥（Etherial）维护。站点采用蓝白科研档案风格，收录企业、智能系统、研究、安全风控、设施、交易与封存记录。</p>
          <p>两站共用同一个 Supabase 项目与同一组 <code>profiles</code> 权限档案：你在 SPA 登记的账号可以在 Bamilen 登录，反之亦然。档案内容、阅读记录、风控规则与智能体各自独立。埃德里奥基于 Proton 架构，桑瑞思为 SPA VIII 型；两者架构不同，但都保留 Komos 遗留层并使用其底层通信协议，因此可以互操作。后期部分 Komos 模块已弃用；共享遗留层与协议不共享记忆、身份或权限。</p>
          <p>Bamilen 的登记码为 <code>BML-ENLIST-2026</code>。已有 SPA 账号可直接登录，无需重复登记。</p>

          <h2>七、致谢与边界</h2>
          <p>世界观与角色源自《死潮》设定整理及 Veltak 语言融合设定。站点内新增档案为同人补写，尽量遵循原有时间线、称谓与语言边界；与原作者设定冲突之处，以原作者设定为准。</p>
          <p>桑瑞思的归档原则：不提供定义，只提交档案；不替活着的人按下最后一个键。</p>
        </article>

        <aside class="about-aside">
          <div class="panel">
            <div class="about-seal">档</div>
            <p class="mono text-center" style="font-size:8px;letter-spacing:.18em;color:#8f7d63">SPA CENTRAL ARCHIVE</p>
            <p class="text-center" style="font-size:12px;color:#b7a88d">馆藏 ${total} 卷 · 九类编目<br>桑瑞思归档系统 · 建城第 22 年</p>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>密级分布</h3></div>
            <table class="label-table">
              <thead><tr><th>标签</th><th>含义</th><th>卷数</th></tr></thead>
              <tbody>
                ${byLevel.map(({ level, info, count }) => `<tr><td>${escapeHtml(info.code)}</td><td>${escapeHtml(info.name)}</td><td>${count}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>快速入口</h3></div>
            <div class="side-actions">
              <a class="btn btn-sm" href="#/archives">全部档案</a>
              <a class="btn btn-sm" href="#/archives?cat=minas">米钠凘专题</a>
              <a class="btn btn-sm" href="#/archives?cat=classified">密卷层</a>
              <a class="btn btn-sm" href="https://ksayus.top/Bamilen-Archive/" target="_blank" rel="noopener">Bamilen 档案库 ↗</a>
              <a class="btn btn-sm" href="#/tasks">调阅任务</a>
            </div>
          </div>
          <div class="panel">
            <p class="mono" style="font-size:8px;letter-spacing:.14em;color:#8f7d63">VELTAK / NOTE</p>
            <p style="font-size:12px;color:#b7a88d">“Vel ze, ka lo.”<br>风走了，我来了。<br><span style="color:#7e6d56">——浮晓碑文</span></p>
          </div>
        </aside>
      </div>
    `;
  },
};
