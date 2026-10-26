-- ============================================================
-- SPA CENTRAL ARCHIVE · catalog seed
-- ============================================================

insert into public.categories (slug, name, description, icon, sort_order) values
  ('personnel',   '人物档案',       '十三使徒、部门职员、无名者与阵亡者。', '人', 10),
  ('incident',    '事件记录',       '死潮、边境、事故、救援与未解事件。', '事', 20),
  ('organization','组织与势力',     'SPA 官署、XHA、Bamilen、UBM、风灵族与地方势力。', '组', 30),
  ('location',    '地点与遗迹',     '锡拉库萨、旧城、托巴勒、艾灵斯、勒勒弗斯、底格络温格。', '地', 40),
  ('research',    '科研与装备',     '修斯纳、炉心、武器、mOS 与医学。', '研', 50),
  ('daily',       '日常观察',       '食堂、失物柜、夜班、猫与城市生活。', '日', 60),
  ('classified',  '密卷',           '不进入公开目录的档案。', '密', 70),
  ('minas',       '米钠凘个人档案', '冰之使徒米钠凘的个人档案与观察记录。', '冰', 80),
  ('reference',   '编目基准',       '档案规范、语言与世界观基准。', '典', 90)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.tasks (slug, title, description, category, reward_xp, reward_points, requirement, active, sort_order) values
  ('daily-checkin', '每日签到', '每日向中央档案库报到，维持调阅资格。', 'daily', 10, 5, '{"type":"always"}'::jsonb, true, 10),
  ('first-read', '首次调阅', '完成第一次档案调阅。', 'once', 15, 0, '{"type":"read_count","count":1}'::jsonb, true, 20),
  ('read-3-today', '今日三卷', '今日调阅 3 份档案。', 'daily', 25, 5, '{"type":"read_count","count":3,"window":"day"}'::jsonb, true, 30),
  ('read-10', '十卷归档', '累计调阅 10 份档案。', 'once', 50, 10, '{"type":"read_count","count":10}'::jsonb, true, 40),
  ('bookmark-3', '建立索引', '收藏 3 份档案，建立个人索引。', 'once', 20, 0, '{"type":"bookmark_count","count":3}'::jsonb, true, 50),
  ('profile-complete', '完善个人档案', '填写显示名称与至少 8 个字符的简介。', 'once', 20, 0, '{"type":"profile_complete"}'::jsonb, true, 60),
  ('category-5', '分类勘探', '在 5 个不同分类中各调阅至少 1 份档案。', 'once', 60, 10, '{"type":"category_count","count":5}'::jsonb, true, 70),
  ('read-nim', '限制级调阅', '调阅至少 1 份 II 级（Nim）或更高等级档案。', 'once', 40, 5, '{"type":"read_clearance","min":2,"count":1}'::jsonb, true, 80),
  ('read-ton', '机密级调阅', '调阅至少 1 份 III 级（Ton）或更高等级档案。', 'once', 80, 15, '{"type":"read_clearance","min":3,"count":1}'::jsonb, true, 90),
  ('minas-5', '冰之使徒专题', '阅读 5 份米钠凘个人档案。', 'once', 70, 10, '{"type":"minas_count","count":5}'::jsonb, true, 100),
  ('weekly-streak', '静默七日', '连续 7 天完成每日签到。', 'weekly', 100, 20, '{"type":"streak","count":7}'::jsonb, true, 110),
  ('submit-correction', '档案纠错', '提交一份档案纠错或补充，审核通过后发放奖励。', 'manual', 50, 10, '{"type":"manual"}'::jsonb, true, 120),
  ('submit-report', '异常报告', '提交一份档案异常或死潮相关报告，审核通过后发放奖励。', 'manual', 40, 5, '{"type":"manual"}'::jsonb, true, 130)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  reward_xp = excluded.reward_xp,
  reward_points = excluded.reward_points,
  requirement = excluded.requirement,
  active = excluded.active,
  sort_order = excluded.sort_order;

insert into public.announcements (title, body, level, active)
select '中央档案库·开馆公告',
       '索特恩历 11 月 07 日。SPA 中央档案库完成新一轮编目。公开目录、限制目录与密卷层已接入调阅系统。请使用调阅申请码完成登记；权限等级由任务、阅读记录与管理员核定共同决定。',
       0, true
where not exists (select 1 from public.announcements where title = '中央档案库·开馆公告');

insert into public.announcements (title, body, level, active)
select '冰之使徒·个人档案专题',
       '米钠凘个人档案专题已开放。该专题包含训练、授衔、家庭访问、甜食配额与战斗损伤记录。部分条目位于限制层，需 II 级或以上权限。',
       0, true
where not exists (select 1 from public.announcements where title = '冰之使徒·个人档案专题');

insert into public.announcements (title, body, level, active)
select '密卷层维护通知',
       '密卷层将于本周末进行索引重建。期间 III 级及以上档案可能出现短暂延迟。请勿在维护窗口内提交密卷调阅申请。',
       2, true
where not exists (select 1 from public.announcements where title = '密卷层维护通知');
