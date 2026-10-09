/* =========================================================
   util.js —— 日期、时间、剩余时间计算工具
   ========================================================= */
const Util = (() => {
  const DAY = 86400000;
  const HOUR = 3600000;
  const MIN = 60000;

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${fmtTime(ts)}`;
  }

  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  function weekdayCN(ts) { return '周' + WEEK_CN[new Date(ts).getDay()]; }

  function isSameDay(a, b) {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
           da.getMonth() === db.getMonth() &&
           da.getDate() === db.getDate();
  }

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* ---------- 剩余时间文字 ---------- */
  // diff > 0 表示还没到 DDL
  function remainText(diff) {
    const abs = Math.abs(diff);
    if (diff > 0) {
      if (abs >= DAY) {
        const days = Math.floor(abs / DAY);
        const hours = Math.floor((abs % DAY) / HOUR);
        return hours > 0 ? `还剩 ${days} 天 ${hours} 小时` : `还剩 ${days} 天`;
      }
      if (abs >= HOUR) {
        const hours = Math.floor(abs / HOUR);
        const mins = Math.floor((abs % HOUR) / MIN);
        return mins > 0 ? `还剩 ${hours} 小时 ${mins} 分` : `还剩 ${hours} 小时`;
      }
      return `还剩 ${Math.floor(abs / MIN)} 分钟`;
    }
    // 已过期
    if (abs >= DAY) return `过期 ${Math.floor(abs / DAY)} 天`;
    if (abs >= HOUR) return `过期 ${Math.floor(abs / HOUR)} 小时`;
    return `过期 ${Math.floor(abs / MIN)} 分钟`;
  }

  /* ---------- 颜色分档（需求四档阈值） ---------- */
  // safe:   > 48h 安心绿
  // warn:   24~48h 提醒黄
  // alert:  6~24h 注意橙（含 6h 整点，规格是"<6h 才红"）
  // danger: < 6h 紧急红 + 脉动
  function tierOf(diff) {
    if (diff > 48 * HOUR) return 'safe';
    if (diff >= 24 * HOUR) return 'warn';   /* 24h 整点含在黄档（规格：24~48h 黄） */
    if (diff >= 6 * HOUR) return 'alert';
    return 'danger';
  }

  const TIER_TEXT = { safe: '安心', warn: '注意', alert: '警惕', danger: '紧急' };
  function tierText(tier) { return TIER_TEXT[tier] || ''; }

  /* ---------- <6h 实时跳秒倒计时 ---------- */
  function countdown(diff) {
    const abs = Math.max(0, Math.floor(diff / 1000));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  /* ---------- 进度条比例（0~1） ---------- */
  // 剩余时间 / 总时长（ddl - createdAt）；总时长非正（创建时已过期）直接按 0 处理
  function progressOf(diff, total) {
    if (!(total > 0)) return 0;
    return Math.max(0, Math.min(1, diff / total));
  }

  /* ---------- 人性化时长（大事件倒计时用） ---------- */
  function diffHuman(ms) {
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const mins = Math.floor((ms % HOUR) / MIN);
    const secs = Math.floor((ms % MIN) / 1000);
    if (days > 0) return `${days} 天 ${hours} 小时`;
    if (hours > 0) return `${hours} 小时 ${mins} 分`;
    if (mins > 0) return `${mins} 分 ${secs} 秒`;
    return `${secs} 秒`;
  }

  /* ---------- 表单 ↔ 时间戳 ---------- */
  // datetime-local 输入框需要的格式："2026-10-15T17:00"
  function toLocalInputValue(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fromLocalInputValue(s) {
    return new Date(s).getTime();
  }

  /* ---------- 月历矩阵（周一开头，固定 6 行） ---------- */
  function monthMatrix(year, month) {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // 周一 = 0
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month, 1 - offset + i);
      cells.push({ ts: d.getTime(), other: d.getMonth() !== month });
    }
    return cells;
  }

  /* ---------- 重复任务的下一次 DDL ---------- */
  function addRepeatMs(ts, unit) {
    const d = new Date(ts);
    if (unit === 'day') d.setDate(d.getDate() + 1);
    else if (unit === 'week') d.setDate(d.getDate() + 7);
    else if (unit === 'month') {
      const day = d.getDate();
      d.setMonth(d.getMonth() + 1);
      // 月末钳制：1月31日 → 2月28/29日
      if (d.getDate() !== day) d.setDate(0);
    }
    return d.getTime();
  }

  return {
    DAY, HOUR, MIN, pad,
    fmtDate, fmtTime, fmtDateTime, weekdayCN,
    isSameDay, startOfDay,
    remainText, tierOf, tierText, countdown, progressOf, diffHuman,
    toLocalInputValue, fromLocalInputValue,
    monthMatrix, addRepeatMs
  };
})();
