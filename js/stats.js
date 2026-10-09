/* =========================================================
   stats.js —— 统计面板
   图表配色遵循 dataviz 规范：分类用验证过的色板（固定顺序，
   不循环取色），文字用文字令牌而非系列色；每行直接标注名称+
   数值（身份不靠颜色单独传达，同时满足对比度救济规则）。
   注：App 目前只有浅色主题（暗色模式以后再说），图表表面
   固定为白色卡片，因此只声明浅色系列色。
   ========================================================= */
const StatsView = (() => {
  /* 分类色板（已通过校验，固定顺序使用） */
  const SERIES = [
    '#2a78d6', /* slot1 蓝   */
    '#eb6834', /* slot2 橙   */
    '#1baf7a', /* slot3 青   */
    '#eda100', /* slot4 黄   */
    '#e87ba4', /* slot5 品红 */
    '#008300', /* slot6 绿   */
    '#4a3aa7'  /* slot7 紫   */
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function render() {
    const root = document.getElementById('stats-root');
    if (!root) return;
    const now = Date.now();
    const tasks = Store.all();

    if (!tasks.length) {
      root.innerHTML = '<div class="empty-state"><span class="big">📊</span>还没有数据～<br>先去添加几个待办吧！</div>';
      return;
    }

    const active = Store.byStatus('active', now);
    const overdue = Store.byStatus('overdue', now);
    const completed = Store.byStatus('completed', now);

    /* 按时完成率：勾完的任务里，completedAt <= ddl 的占比 */
    const onTime = completed.filter((t) => t.completedAt <= t.ddl).length;
    const onTimeRate = completed.length ? Math.round((onTime / completed.length) * 100) : null;

    /* 完成率：已到期该收尾的（已完成+已过期）里完成了多少 */
    const dueTotal = completed.length + overdue.length;
    const doneRate = dueTotal ? Math.round((completed.length / dueTotal) * 100) : null;

    /* 分类分布（不含回收站）。Object.create(null) 防"constructor"等分类名污染原型 */
    const catMap = Object.create(null);
    tasks.filter((t) => !t.trashedAt).forEach((t) => {
      const c = t.category || '未分类';
      catMap[c] = (catMap[c] || 0) + 1;
    });
    const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const catRows = cats.slice(0, 6).map(([name, n]) => ({ name, n }));
    const rest = cats.slice(6).reduce((s, [, n]) => s + n, 0);
    if (rest > 0) catRows.push({ name: '其他', n: rest });
    const maxCat = Math.max(1, ...catRows.map((r) => r.n));

    /* 最近 7 天完成趋势：用完成日志（Store 持久保存），
       不受"已完成任务 3 天后消失"影响，才能画满 7 天 */
    const compLog = Store.completionsList();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = Util.startOfDay(d.getTime());
      const n = compLog.filter(
        (c) => c.ts >= dayStart && c.ts < dayStart + Util.DAY
      ).length;
      days.push({ label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`, n });
    }
    const maxDay = Math.max(1, ...days.map((x) => x.n));

    const pct = (n, max) => Math.max(n > 0 ? 8 : 0, Math.round((n / max) * 100));

    root.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><div class="num">${active.length}</div><div class="lbl">📌 当前待办</div></div>
        <div class="stat-tile"><div class="num">${overdue.length}</div><div class="lbl">🪦 已过期</div></div>
        <div class="stat-tile"><div class="num">${doneRate == null ? '—' : doneRate + '%'}</div><div class="lbl">✅ 完成率（到期任务中）</div></div>
        <div class="stat-tile"><div class="num">${onTimeRate == null ? '—' : onTimeRate + '%'}</div><div class="lbl">⏰ 按时完成率（勾完的）</div></div>
      </div>

      <div class="stat-card">
        <h3>🎀 任务分类分布</h3>
        <div class="bar-list">
          ${catRows.map((r, i) => `
            <div class="bar-row" title="${esc(r.name)}：${r.n} 个任务">
              <span class="bar-label">${esc(r.name)}</span>
              <span class="bar-track">
                <span class="bar-fill" style="width:${pct(r.n, maxCat)}%;background:${SERIES[i % SERIES.length]}"></span>
              </span>
              <span class="bar-val">${r.n}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="stat-card">
        <h3>✨ 最近 7 天完成数</h3>
        <div class="week-bars">
          ${days.map((d) => `
            <div class="week-col" title="${esc(d.label)}：完成 ${d.n} 个">
              <div class="week-bar" style="height:${pct(d.n, maxDay)}%"></div>
              <span class="week-lbl">${esc(d.label)}</span>
            </div>`).join('')}
        </div>
      </div>
    `;
  }

  return { render };
})();
