# Sunrise 中央档案库 / SPA Archive

《死潮》同人档案站。以桑瑞思（Sunrise）的归档口吻整理城市、使徒、边境、科研与日常记录，采用深褐纸本、米色档案纸与红色印章的视觉风格。

线上地址：<https://ksayus.github.io/SPA-Archive/>（账号启用自定义域名后会跳转至 <https://ksayus.top/SPA-Archive/>）

## 功能

- **公开目录**：分类筛选、关键词检索、密级筛选、排序与分页。
- **163 卷馆藏**：导入 29 卷既有档案，并新增 134 卷普通档案、长篇档案、系统日志与米钠凘个人档案。
- **长篇档案专题**：新增止芸谷地形调查、轻芸派合作备忘录、采药事故复盘、修斯纳腐化现场手册、XHA 审讯第二卷、编目手册与年度系统审计等 10 卷长篇档案。
- **系统日志专题**：桑瑞思的晨间自检、语音偏差、03:00 维护窗口、完整性校验、权限自检与响应延迟统计。
- **权限阶梯**：`VEL`、`VEL+`、`NIM`、`NIM+`、`TON`、`NUN` 六级；限制层正文由 Supabase 行级安全策略保护。
- **账号系统**：Supabase Auth 登录、申请码登记、权限档案、调阅历史与个人索引。
- **调阅任务**：每日/每周/一次性/人工审核任务，完成任务获得 XP 与通用点数，自动晋升至 III 级；IV、V 级由管理员核定。
- **管理控制台**：档案增删改查、账号权限调整、密码重置、待审队列、公告管理与审计日志。
- **响应式终端界面**：移动端菜单、终端搜索、阅读进度条与锁卷提示。

## 技术栈

- 原生 HTML / CSS / JavaScript，esbuild 打包，Hash 路由，可直接部署到 GitHub Pages。
- Supabase：Postgres、Auth、Row Level Security、RPC。
- `marked` 渲染 Markdown，`DOMPurify` 清理正文 HTML。

## 本地运行

```bash
npm install
npm run build
python -m http.server 4173 --bind 127.0.0.1
```

打开 <http://127.0.0.1:4173/>。开发时可运行 `npm run dev` 监听源码变化，另开一个终端运行静态服务器。

构建产物为 `assets/js/app.js`。修改源码或样式后请重新执行 `npm run build`，并同步更新 `index.html` 中的资源版本号。

## Supabase 配置

前端连接配置位于 `src/config.js`。数据库迁移与种子文件位于：

- `supabase/migrations/0001_init.sql`：表结构、视图、RLS、账号/任务/阅读/管理 RPC。
- `supabase/migrations/0002_security_fixes.sql`：公告 RLS、个人资料受信写入、XP 晋升与人工任务校验修复。
- `supabase/seed/0001_catalog.sql`：分类、任务与初始公告。

数据库脚本通过连接池执行。复制 `.env.example` 为 `.env.local`，填入自己的 Supabase 连接信息：

```bash
npm run db:push -- supabase/migrations/0001_init.sql supabase/migrations/0002_security_fixes.sql
npm run db:push -- supabase/seed/0001_catalog.sql
```

`.env.local` 已加入 `.gitignore`。**不要**把数据库密码、`service_role` 密钥或管理员密码提交到仓库。

### 档案正文

`content/` 保存本地导入源与新增档案源，已加入 `.gitignore`。站点运行时不读取这些文件；档案正文存放在 Supabase 的 `archives` 表中。公开目录视图 `archive_catalog` 只暴露元数据，限制层正文由 `archives` 的 RLS 策略控制。

重新灌入档案：

```bash
npm run seed
```

## 部署到 GitHub Pages

1. 将站点文件推送到 `main`。
2. 在仓库 **Settings → Pages** 选择 **Deploy from a branch**，分支 `main`，目录 `/ (root)`。
3. 仓库根目录的 `.nojekyll` 会阻止 Jekyll 处理静态资源。
4. 部署完成后访问 <https://ksayus.github.io/SPA-Archive/>。

站点使用 Hash 路由，因此不需要额外的 SPA 回退配置。

## 目录结构

```text
index.html                 静态入口
assets/css/style.css       视觉系统与响应式布局
assets/js/app.js           esbuild 产物
src/                       页面、状态、路由与 Supabase 客户端
supabase/migrations/       数据库迁移
supabase/seed/             分类、任务与公告种子
scripts/                   数据库推送与档案灌入脚本
content/                   本地档案源（不提交）
```

## 安全说明

- 前端只使用 Supabase **publishable key**；该密钥按设计可公开。
- 公开目录只返回元数据；限制层正文不会出现在公开目录接口中。
- 管理员与编辑操作受 RLS 和数据库函数权限约束。
- 调阅记录会写入个人阅读档案；任务领取、人工审核与账号调整会写入审计日志。
- 生产环境请通过安全渠道分发管理员密码，并定期轮换。

---

本项目为《死潮》同人创作，档案内容为虚构，与现实中的任何组织、事件或人物无关。
