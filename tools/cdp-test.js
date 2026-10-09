/* tools/cdp-test.js —— 用 CDP 驱动无头 Edge 做端到端验证
   用法：node tools/cdp-test.js（需要先启动本地服务器 8123） */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!EDGE) { console.error('未找到 Edge'); process.exit(1); }

const PROFILE = path.join(process.env.TEMP || '.', 'cdp-test-profile');
fs.rmSync(PROFILE, { recursive: true, force: true });

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${PROFILE}`,
  '--remote-debugging-port=9333',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  /* 等待调试端口 */
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9333/json/list');
      targets = await res.json();
      if (targets.length) break;
    } catch (e) { }
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.error('没找到页面目标'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };
  await new Promise((r) => (ws.onopen = r));

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };

  let pass = 0, fail = 0;
  const t = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗ FAIL:', name, extra || ''); }
  };

  /* 1. 打开主页 */
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:8123/index.html' });
  await sleep(1200);

  /* 2. 种入各状态任务，然后刷新 */
  await evaluate(`(() => {
    const now = Date.now(), H = 3600000, D = 86400000;
    const mk = (o) => Object.assign({
      id: 't' + Math.random().toString(36).slice(2, 9),
      title: '', category: '', ddl: now + D, stars: 1, note: '', tags: [], subtasks: [],
      isBigEvent: false, repeat: null, repeatAnchor: null, createdAt: now - D,
      completedAt: null, trashedAt: null, trashReason: null, manualPos: null, spawnedFrom: null
    }, o);
    localStorage.setItem('hellotodo.tasks.v1', JSON.stringify([
      mk({ id: 't-danger',  title: '紧急任务测试', category: '文体部', ddl: Math.min(now + 2 * H, new Date().setHours(23, 59, 0, 0)), stars: 5, tags: ['紧急'], note: '备注测试', subtasks: [{id:'s1',text:'子步骤一',done:false}] }),
      mk({ id: 't-warn',    title: '提醒任务测试', category: '班级', ddl: now + 30 * H, stars: 3 }),
      mk({ id: 't-safe',    title: '安心任务测试', category: '学习', ddl: now + 5 * D, stars: 2 }),
      mk({ id: 't-overdue', title: '过期任务测试', category: '生活', ddl: now - 2 * H, stars: 4 }),
      mk({ id: 't-done',    title: '已完成任务测试', category: '文体部', ddl: now - D, stars: 3, completedAt: now - H }),
      mk({ id: 't-big',     title: '期末考试', category: '学习', ddl: now + 10 * D, stars: 5, isBigEvent: true }),
      mk({ id: 't-trash',   title: '回收站任务测试', ddl: now + D, stars: 1, trashedAt: now - H, trashReason: 'manual' })
    ]));
    localStorage.setItem('hellotodo.completions.v1', JSON.stringify([
      { id: 't-done', ts: now - H }, { id: 'x', ts: now - D }, { id: 'y', ts: now - 5 * D }
    ]));
    return 'seeded';
  })()`);
  await send('Page.reload');
  await sleep(1500);

  /* 3. 待办列表渲染与排序 */
  const todoTitles = await evaluate(`[...document.querySelectorAll('#todo-list .card .card-title')].map(e => e.textContent)`);
  t('待办 3 张卡（大事件/过期/完成/回收站不在此列）', todoTitles.length === 3, JSON.stringify(todoTitles));
  t('排序：5星紧急在最前', todoTitles[0] === '紧急任务测试');
  t('排序：2星安心在最后', todoTitles[2] === '安心任务测试');

  /* 4. 紧急档样式 + 倒计时 */
  const danger = await evaluate(`(() => {
    const card = document.querySelector('#todo-list .card');
    return { tier: card.classList.contains('tier-danger'), time: card.querySelector('.card-time').textContent };
  })()`);
  t('紧急任务为红档', danger.tier);
  t('显示跳秒倒计时', /^\u23f0 \d{2}:\d{2}:\d{2}$/.test(danger.time), danger.time);

  /* 5. 大事件专区 */
  const big = await evaluate(`(() => {
    const be = document.querySelector('#big-events .big-event');
    return be ? { title: be.querySelector('.be-title').textContent, count: be.querySelector('.be-count').textContent } : null;
  })()`);
  t('大事件专区渲染期末考试', big && big.title === '期末考试');
  t('大事件倒计时文案', big && /天/.test(big.count), big && big.count);

  /* 6. 墓碑占位 + 过期徽章 */
  const spot = await evaluate(`(() => ({
    tombstones: document.querySelectorAll('#overdue-spot .tombstone-mini').length,
    badge: document.getElementById('badge-overdue').textContent,
    badgeHidden: document.getElementById('badge-overdue').hidden
  }))()`);
  t('待办页墓碑占位 1 个', spot.tombstones === 1);
  t('过期徽章 = 1', spot.badge === '1' && !spot.badgeHidden);

  /* 7. 过期栏 */
  const ov = await evaluate(`document.querySelectorAll('#overdue-list .overdue-card').length`);
  t('过期栏 1 张卡', ov === 1);

  /* 8. 已完成栏 */
  const dn = await evaluate(`document.querySelectorAll('#done-list .done-card').length`);
  t('已完成栏 1 张卡', dn === 1);

  /* 9. 回收站 */
  const tr = await evaluate(`document.querySelectorAll('#trash-list .trash-row').length`);
  t('回收站渲染 1 条', tr === 1);

  /* 10. 统计面板（7 天趋势应有 3 根有值的柱子） */
  await evaluate(`document.querySelector('.nav-item[data-view="stats"]').click()`);
  await sleep(400);
  const stats = await evaluate(`(() => ({
    tiles: [...document.querySelectorAll('.stat-tile .num')].map(e => e.textContent),
    weekBars: document.querySelectorAll('.week-bar').length,
    catRows: document.querySelectorAll('.bar-row').length
  }))()`);
  t('统计 4 个指标格', stats.tiles.length === 4, JSON.stringify(stats.tiles));
  t('7 天趋势 7 根柱', stats.weekBars === 7);
  t('分类分布有行', stats.catRows >= 2);

  /* 11. 日历：选中有任务的日子出时间轴 */
  await evaluate(`document.querySelector('.nav-item[data-view="calendar"]').click()`);
  await sleep(400);
  const cal = await evaluate(`(() => {
    const cells = [...document.querySelectorAll('.cal-cell')];
    const today = cells.find(c => c.classList.contains('today'));
    today.click();
    return new Promise(r => setTimeout(() => r({ rows: document.querySelectorAll('#cal-timeline .timeline-row').length }), 300));
  })()`);
  t('日历今日时间轴有行（今天的紧急+过期任务都在）', cal.rows >= 2, 'rows=' + cal.rows);

  /* 12. 勾选完成：点待办页第一张卡的勾选框 → 特效 + 移入已完成 */
  await evaluate(`document.querySelector('.nav-item[data-view="todo"]').click()`);
  await sleep(300);
  await evaluate(`document.querySelector('#todo-list .card .checkbox').click()`);
  await sleep(1400);
  const after = await evaluate(`(() => ({
    todo: document.querySelectorAll('#todo-list .card').length,
    done: [...document.querySelectorAll('#done-list .done-card .card-title')].map(e => e.textContent)
  }))()`);
  t('勾选后待办剩 2 张', after.todo === 2);
  t('完成的任务进入已完成栏', after.done.includes('紧急任务测试'), JSON.stringify(after.done));

  /* 13. 撤销完成（点已完成卡勾选框） */
  await evaluate(`document.querySelector('.nav-item[data-view="done"]').click()`);
  await sleep(300);
  await evaluate(`document.querySelector('#done-list .done-card .checkbox').click()`);
  await sleep(400);
  const back = await evaluate(`document.querySelectorAll('#done-list .done-card').length`);
  t('撤销完成生效（已完成回到 1 张）', back === 1);

  /* 14. 备注折叠展开 */
  await evaluate(`document.querySelector('.nav-item[data-view="todo"]').click()`);
  await sleep(300);
  await evaluate(`(() => {
    const t = document.querySelector('#todo-list .card .note-toggle');
    if (t) t.click();
  })()`);
  await sleep(200);
  const noteOpen = await evaluate(`!!document.querySelector('#todo-list .card .card-note.is-open')`);
  t('备注点击展开', noteOpen);

  /* 15. 回收站恢复按钮可用（document 级委托） */
  await evaluate(`document.getElementById('btn-trash').click()`);
  await sleep(400);
  await evaluate(`document.querySelector('#trash-list [data-act="restore"]').click()`);
  await sleep(400);
  const restored = await evaluate(`(() => ({
    trash: document.querySelectorAll('#trash-list .trash-row').length,
    active: Store.byStatus('active').length
  }))()`);
  t('回收站恢复按钮生效（回收站 0 条）', restored.trash === 0, JSON.stringify(restored));

  console.log(`\n端到端结果：通过 ${pass} 项，失败 ${fail} 项`);
  ws.close();
  edge.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('测试脚本错误:', e.message);
  edge.kill();
  process.exit(1);
});
