/* =========================================================
   calendar.js —— DDL 日历：月历格子 + 当日时间轴 + 冲突检测
   需求定案：
   - 月历 + 日时间轴
   - 同一天多个 DDL 按时段排列
   - 时间重叠（30 分钟内）红色冲突警示
   ========================================================= */
const CalendarView = (() => {
  const CONFLICT_WINDOW = 30 * Util.MIN; /* 相邻 DDL 相差 < 30 分钟视为冲突 */

  let year = 0;
  let month = 0;
  let selectedDay = 0; /* 当天 0 点时间戳 */

  function init() {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
    selectedDay = Util.startOfDay(Date.now());
  }

  function prevMonth() {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    const first = new Date(year, month, 1);
    const today = Util.startOfDay(Date.now());
    selectedDay = Math.min(selectedDay, new Date(year, month + 1, 0).getTime());
    if (selectedDay < first.getTime()) {
      selectedDay = today >= first.getTime() && today <= new Date(year, month + 1, 0).getTime()
        ? today : first.getTime();
    }
    render();
  }

  function nextMonth() {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    const first = new Date(year, month, 1);
    const today = Util.startOfDay(Date.now());
    if (selectedDay < first.getTime()) {
      selectedDay = today >= first.getTime() && today <= new Date(year, month + 1, 0).getTime()
        ? today : first.getTime();
    }
    render();
  }

  /* 每月的任务索引：dayStart -> [tasks] */
  function indexTasks() {
    const map = {};
    Store.all().forEach((t) => {
      if (t.trashedAt) return;
      const day = Util.startOfDay(t.ddl);
      (map[day] = map[day] || []).push(t);
    });
    return map;
  }

  function dotClass(t, now) {
    if (t.completedAt) return 'done';
    if (now >= t.ddl) return 'overdue';
    return Util.tierOf(t.ddl - now);
  }

  function render() {
    renderGrid();
    renderDay();
  }

  function renderGrid() {
    document.getElementById('cal-month-label').textContent = `${year} 年 ${month + 1} 月`;
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    const now = Date.now();
    const today = Util.startOfDay(now);
    const tasksByDay = indexTasks();

    Util.monthMatrix(year, month).forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'cal-cell';
      btn.setAttribute('aria-label', `${new Date(c.ts).getMonth() + 1}月${new Date(c.ts).getDate()}日`);
      if (c.other) btn.classList.add('other-month');
      if (c.ts === today) btn.classList.add('today');
      if (c.ts === selectedDay) btn.classList.add('selected');

      const num = document.createElement('span');
      num.textContent = new Date(c.ts).getDate();
      btn.appendChild(num);

      const list = tasksByDay[c.ts] || [];
      if (list.length) {
        if (list.length > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'cal-count';
          cnt.textContent = list.length;
          btn.appendChild(cnt);
        }
        const dots = document.createElement('span');
        dots.className = 'cal-dots';
        list.slice(0, 4).forEach((t) => {
          const dot = document.createElement('i');
          dot.className = 'cal-dot ' + dotClass(t, now);
          dots.appendChild(dot);
        });
        btn.appendChild(dots);
      }

      btn.addEventListener('click', () => {
        selectedDay = c.ts;
        render();
      });
      grid.appendChild(btn);
    });
  }

  function renderDay() {
    const d = new Date(selectedDay);
    document.getElementById('cal-day-title').textContent =
      `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${Util.weekdayCN(selectedDay)}`;

    const tl = document.getElementById('cal-timeline');
    tl.innerHTML = '';
    const now = Date.now();
    const list = Store.all()
      .filter((t) => !t.trashedAt && Util.isSameDay(t.ddl, selectedDay))
      .sort((a, b) => a.ddl - b.ddl);

    if (!list.length) {
      tl.innerHTML = '<div class="empty-state"><span class="big">🌤️</span>这一天没有 DDL，安心～</div>';
      return;
    }

    /* 冲突检测：按时间排序后，相邻（含链式）相差 < 30 分钟 → 冲突 */
    const conflictIds = new Set();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].ddl - list[i].ddl < CONFLICT_WINDOW) {
          conflictIds.add(list[i].id);
          conflictIds.add(list[j].id);
        } else break;
      }
    }

    list.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      if (conflictIds.has(t.id)) row.classList.add('conflict');

      const dot = document.createElement('span');
      dot.className = 'timeline-dot ' + dotClass(t, now);
      row.appendChild(dot);

      const time = document.createElement('span');
      time.className = 'timeline-time';
      time.textContent = Util.fmtTime(t.ddl);
      row.appendChild(time);

      const main = document.createElement('div');
      main.className = 'timeline-main';
      const title = document.createElement('div');
      title.className = 'timeline-title';
      title.textContent = t.title;
      main.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'timeline-meta';
      if (t.category) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = t.category;
        meta.appendChild(chip);
      }
      const stars = document.createElement('span');
      stars.className = 'stars-row';
      for (let i = 1; i <= 5; i++) {
        const s = document.createElement('span');
        s.className = i <= t.stars ? 's-on' : 's-off';
        s.textContent = '★';
        stars.appendChild(s);
      }
      meta.appendChild(stars);
      if (conflictIds.has(t.id)) {
        const c = document.createElement('span');
        c.className = 'chip conflict';
        c.textContent = '⚠ 时间冲突';
        meta.appendChild(c);
      }
      if (t.completedAt) {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = '✅ 已完成';
        meta.appendChild(c);
      } else if (now >= t.ddl) {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = '🪦 已过期';
        meta.appendChild(c);
      } else {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = Util.remainText(t.ddl - now);
        meta.appendChild(c);
      }
      main.appendChild(meta);
      row.appendChild(main);

      /* 点击行 → 打开编辑抽屉 */
      row.addEventListener('click', () => UI.openSheet(t.id));
      tl.appendChild(row);
    });
  }

  return { init, render, prevMonth, nextMonth, selectToday() { selectedDay = Util.startOfDay(Date.now()); render(); } };
})();
