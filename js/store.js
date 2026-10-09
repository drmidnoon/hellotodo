/* =========================================================
   store.js —— 数据层（localStorage 适配器）

   架构说明：这是“纯前端 + 预留升级”的关键文件。
   未来升级账号系统（用户名+密码登录、数据存服务器）时，
   只需把本模块的实现换成远程 API，其余界面代码一行不用改。
   ========================================================= */
const Store = (() => {
  const KEY_TASKS = 'hellotodo.tasks.v1';
  const KEY_SETTINGS = 'hellotodo.settings.v1';
  const KEY_COMP = 'hellotodo.completions.v1'; /* 完成日志：任务 3 天消失后，统计仍能画 7 天趋势 */
  const DAY = 86400000;
  const REPEAT_UNITS = ['day', 'week', 'month']; /* 必须在 load() 之前初始化（TDZ！） */

  /* 自动清理规则（需求定案）：
     - 已完成：从“勾选完成那一刻”起存 3 天，之后自动消失
     - 已过期：过期 7 天还没勾选 → 自动进回收站
     - 回收站：保留 30 天，之后彻底删除 */
  const DONE_KEEP = 3 * DAY;
  const OVERDUE_GRACE = 7 * DAY;
  const TRASH_KEEP = 30 * DAY;

  let tasks = load();
  let settings = Object.assign(
    { sound: true, vibrate: true, manual: false },
    loadSettings()
  );
  let completions = loadCompletions();
  const listeners = new Set();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_TASKS));
      return Array.isArray(raw) ? raw.map(normalizeTask) : [];
    } catch (e) { return []; }
  }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(KEY_SETTINGS)) || {}; } catch (e) { return {}; }
  }
  function loadCompletions() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_COMP));
      return Array.isArray(raw)
        ? raw.filter((x) => x && typeof x.id === 'string' && typeof x.ts === 'number' && isFinite(x.ts))
        : [];
    } catch (e) { return []; }
  }
  function saveCompletions() {
    try { localStorage.setItem(KEY_COMP, JSON.stringify(completions.slice(-500))); } catch (e) { }
  }
  function recordCompletion(id, ts) {
    completions.push({ id, ts });
    saveCompletions();
  }
  function removeCompletion(id, ts) {
    if (!ts) return;
    completions = completions.filter((c) => !(c.id === id && c.ts === ts));
    saveCompletions();
  }

  /* 清洗/补全字段：防止旧版本或导入的数据缺字段/类型错误 */
  function normalizeTask(t) {
    t = t || {};
    const num = (v, dflt) => (typeof v === 'number' && isFinite(v)) ? v : dflt;
    const str = (v) => (typeof v === 'string' ? v : String(v == null ? '' : v));
    const repeat = REPEAT_UNITS.includes(t.repeat) ? t.repeat : null;
    const ddl = num(t.ddl, 0);
    /* 每月重复的“锚定日”：月末钳制后不漂移（1月31日 → 2月28日 → 3月31日） */
    const repeatAnchor = repeat === 'month'
      ? (num(t.repeatAnchor, 0) || (ddl > 0 ? new Date(ddl).getDate() : 1))
      : null;
    return {
      id: str(t.id) || newId(),
      title: str(t.title),
      category: str(t.category),
      ddl,
      stars: Math.max(1, Math.min(5, Math.round(num(t.stars, 1)))),
      note: str(t.note),
      tags: Array.isArray(t.tags) ? t.tags.filter((x) => typeof x === 'string').slice(0, 20) : [],
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map((s) => ({
        id: str(s && s.id) || newId(), text: str(s && s.text), done: !!(s && s.done)
      })) : [],
      isBigEvent: !!t.isBigEvent,
      repeat,
      repeatAnchor,
      createdAt: num(t.createdAt, Date.now()),
      completedAt: t.completedAt == null ? null : num(t.completedAt, null),
      trashedAt: t.trashedAt == null ? null : num(t.trashedAt, null),
      trashReason: t.trashedAt ? (t.trashReason === 'auto-overdue' ? 'auto-overdue' : 'manual') : null,
      manualPos: t.manualPos == null ? null : num(t.manualPos, null),
      spawnedFrom: t.spawnedFrom == null ? null : str(t.spawnedFrom)
    };
  }

  function newId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* 存储失败（如空间不足）时通知界面，不让数据静默丢失 */
  let onPersistError = null;

  function persist() {
    try { localStorage.setItem(KEY_TASKS, JSON.stringify(tasks)); }
    catch (e) { if (onPersistError) { try { onPersistError(); } catch (e2) { } } }
    emit();
  }
  function persistSettings() {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch (e) { }
  }
  function emit() {
    listeners.forEach((fn) => { try { fn(); } catch (e) { } });
  }

  /* 任务当前状态（派生，不落库，永远正确） */
  function statusOf(t, now = Date.now()) {
    if (t.trashedAt) return 'trashed';
    if (t.completedAt) return 'completed';
    if (t.ddl && now >= t.ddl) return 'overdue';
    return 'active';
  }

  /* 自动清理：加载时、每 30 秒心跳时各跑一次 */
  function purge(now = Date.now()) {
    let changed = false;
    tasks = tasks.filter((t) => {
      if (t.trashedAt && now - t.trashedAt > TRASH_KEEP) { changed = true; return false; }
      if (t.completedAt && now - t.completedAt > DONE_KEEP) { changed = true; return false; }
      if (!t.completedAt && !t.trashedAt && t.ddl && now - t.ddl > OVERDUE_GRACE) {
        t.trashedAt = now;
        t.trashReason = 'auto-overdue';
        changed = true;
      }
      return true;
    });
    if (changed) persist();
  }

  /* 重复任务：完成时生成下一次，DDL 自动推进到未来。
     带防御上限，未知 repeat 单位（如手工改坏的备份）也不会死循环。 */
  function spawnNext(t, now) {
    let next = t.ddl;
    let guard = 0;
    if (t.repeat === 'month' && t.repeatAnchor) {
      /* 每月重复：以“锚定日”为基准逐月推进，月末自动钳制且不漂移 */
      const base = new Date(t.ddl);
      const anchor = t.repeatAnchor;
      let k = 1;
      do {
        const y = base.getFullYear();
        const m = base.getMonth() + k;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const day = Math.min(anchor, lastDay);
        next = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0).getTime();
        k += 1;
        guard += 1;
        if (guard > 1200) { next = now + Util.DAY; break; } /* 百年兜底 */
      } while (next <= now);
    } else {
      do {
        next = Util.addRepeatMs(next, t.repeat);
        guard += 1;
        if (guard > 100000) { next = now + Util.DAY; break; } /* 兜底：绝不无限循环 */
      } while (next <= now);
    }
    const copy = Object.assign({}, t, {
      id: newId(),
      ddl: next,
      createdAt: now,
      completedAt: null,
      trashedAt: null,
      trashReason: null,
      manualPos: null,
      spawnedFrom: t.id,
      subtasks: (t.subtasks || []).map((s) => Object.assign({}, s, { done: false }))
    });
    tasks.push(copy);
    return copy;
  }

  const api = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    all() { return tasks; },

    byStatus(status, now = Date.now()) {
      return tasks.filter((t) => statusOf(t, now) === status);
    },

    add(data) {
      const t = normalizeTask({
        id: newId(),
        title: String(data.title || '').trim(),
        category: String(data.category || '').trim(),
        ddl: data.ddl,
        stars: data.stars || 1,
        note: String(data.note || '').trim(),
        tags: data.tags || [],
        subtasks: data.subtasks || [],
        isBigEvent: !!data.isBigEvent,
        repeat: data.repeat || null,
        createdAt: Date.now()
      });
      if (t.repeat === 'month') t.repeatAnchor = new Date(t.ddl).getDate();
      tasks.push(t);
      persist();
      return t;
    },

    update(id, patch) {
      const t = tasks.find((x) => x.id === id);
      if (t) {
        Object.assign(t, patch);
        /* 每月重复的锚定日跟随 DDL 变化 */
        if (t.repeat === 'month') t.repeatAnchor = new Date(t.ddl).getDate();
        else if (patch.repeat !== undefined) t.repeatAnchor = null;
        persist();
      }
      return t;
    },

    toggleSubtask(id, subId) {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      const s = (t.subtasks || []).find((x) => x.id === subId);
      if (s) { s.done = !s.done; persist(); }
    },

    /* 勾选完成：返回 { task, spawned }，spawned 是重复任务生成的下一期 */
    complete(id, now = Date.now()) {
      const t = tasks.find((x) => x.id === id);
      if (!t || t.completedAt) return null;
      t.completedAt = now;
      recordCompletion(t.id, now);
      const spawned = t.repeat ? spawnNext(t, now) : null;
      persist();
      return { task: t, spawned };
    },

    /* 撤销完成：回到未完成状态（DDL 未过回待办，已过进过期栏）。
       若当时自动生成了下一期，且下一期还没被处理过，就一并撤销，避免重复。 */
    uncomplete(id) {
      const t = tasks.find((x) => x.id === id);
      if (!t) return t;
      const wasCompletedAt = t.completedAt;
      t.completedAt = null;
      if (t.repeat && wasCompletedAt) {
        const spawned = tasks
          .filter((x) => x.spawnedFrom === id && !x.completedAt && !x.trashedAt &&
            x.createdAt >= wasCompletedAt - 1000)
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (spawned) {
          const i = tasks.indexOf(spawned);
          if (i >= 0) tasks.splice(i, 1);
        }
      }
      removeCompletion(id, wasCompletedAt);
      persist();
      return t;
    },

    trash(id, reason = 'manual') {
      const t = tasks.find((x) => x.id === id);
      if (t) { t.trashedAt = Date.now(); t.trashReason = reason; persist(); }
      return t;
    },

    restore(id) {
      const t = tasks.find((x) => x.id === id);
      if (t) { t.trashedAt = null; t.trashReason = null; persist(); }
      return t;
    },

    removePermanent(id) {
      tasks = tasks.filter((x) => x.id !== id);
      persist();
    },

    emptyTrash() {
      tasks = tasks.filter((x) => !x.trashedAt);
      persist();
    },

    clearAll() {
      tasks = [];
      persist();
    },

    /* 历史分类（按出现次数排序，喂给 datalist）。
       用 Object.create(null) 防"constructor"这类分类名污染原型 */
    categories() {
      const map = Object.create(null);
      tasks.forEach((t) => {
        if (t.category) map[t.category] = (map[t.category] || 0) + 1;
      });
      return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    },

    /* 排序规则（需求定案）：
       自动：星级高→低，同级按 DDL 从近到远，再按创建时间
       手动模式：按手动拖拽后的 manualPos
       无 DDL 的异常数据（ddl=0）排到同级最后 */
    sortActive(list, manual) {
      const arr = list.slice();
      if (manual) {
        arr.sort((a, b) =>
          (a.manualPos == null ? Infinity : a.manualPos) - (b.manualPos == null ? Infinity : b.manualPos) ||
          a.createdAt - b.createdAt
        );
      } else {
        arr.sort((a, b) =>
          (b.stars - a.stars) ||
          ((a.ddl || Infinity) - (b.ddl || Infinity)) ||
          (a.createdAt - b.createdAt)
        );
      }
      return arr;
    },

    /* 多标签页同步：重新读入 localStorage 里的最新数据 */
    reload() { tasks = load(); },

    completionsList() { return completions; },

    setPersistErrorHandler(fn) { onPersistError = fn; },

    exportJSON() {
      return JSON.stringify({
        app: 'hellotodo',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        tasks,
        completions
      }, null, 2);
    },

    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.tasks)) throw new Error('格式不对：这不是 HelloTodo 的备份文件');
      tasks = data.tasks.map(normalizeTask);
      if (Array.isArray(data.completions)) {
        completions = data.completions
          .filter((x) => x && typeof x.id === 'string' && typeof x.ts === 'number' && isFinite(x.ts))
          .slice(-500);
        saveCompletions();
      }
      if (data.settings) settings = Object.assign(settings, data.settings);
      persist();
      persistSettings();
    },

    getSetting(k) { return settings[k]; },
    setSetting(k, v) { settings[k] = v; persistSettings(); },

    statusOf, purge
  };

  return api;
})();
