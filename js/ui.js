/* =========================================================
   ui.js —— 界面渲染与交互
   - 四大栏目 + 大事件专区 + 墓碑占位 + 回收站
   - 添加/编辑底部抽屉（星级、标签、子任务、DDL 剩余提示）
   - 勾选完成特效流程、手动拖拽排序、每秒实时刷新
   ========================================================= */
const UI = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* 上一次全量渲染时的状态快照：用于侦测 active→overdue 等状态翻转 */
  let statusSnapshot = {};

  /* 抽屉表单的临时状态 */
  const sheetState = { tags: [], subtasks: [], stars: 1 };

  /* ================= 全量渲染 ================= */
  function renderAll() {
    const now = Date.now();
    document.getElementById('app').classList.toggle('manual-mode', !!Store.getSetting('manual'));
    statusSnapshot = {};
    Store.all().forEach((t) => { statusSnapshot[t.id] = Store.statusOf(t, now); });

    renderBigEvents(now);
    renderTodoList(now);
    renderOverdueSpot(now);
    renderOverdueTab(now);
    renderDoneTab();
    renderTrashList();
    renderBadge(now);
    if ($('#view-stats').classList.contains('is-active')) StatsView.render();
    if ($('#view-calendar').classList.contains('is-active')) CalendarView.render();
    updateTimes();
  }

  function statusChanged() {
    const now = Date.now();
    return Store.all().some((t) => statusSnapshot[t.id] !== Store.statusOf(t, now));
  }

  /* ================= 卡片构件 ================= */

  function starsHTML(n) {
    let html = '<span class="stars-row">';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="${i <= n ? 's-on' : 's-off'}">★</span>`;
    }
    return html + '</span>';
  }

  function chipHTML(cls, text) {
    return `<span class="chip ${cls}">${escapeHtml(text)}</span>`;
  }

  /* 勾选小方格 */
  function checkboxHTML(checked) {
    return `<button class="checkbox" type="button" aria-label="勾选完成">
      ${checked ? FX.checkSvg().outerHTML : ''}
    </button>`;
  }

  /* 待办卡片主体 */
  function cardHTML(t, now, opts) {
    const diff = t.ddl - now;
    const tier = Util.tierOf(diff);
    const timeText = (diff < 6 * Util.HOUR && diff > 0)
      ? '⏰ ' + Util.countdown(diff)
      : Util.remainText(diff);
    const progress = Util.progressOf(diff, t.ddl - t.createdAt);

    const meta = [];
    if (t.category) meta.push(chipHTML('', t.category));
    meta.push(starsHTML(t.stars));
    if (t.isBigEvent) meta.push(chipHTML('big', '🎉 大事件'));
    if (t.repeat) meta.push(chipHTML('repeat', '🔁 ' + repeatLabel(t.repeat)));
    (t.tags || []).slice(0, 3).forEach((tag) => meta.push(chipHTML('tag', '#' + tag)));
    const subDone = (t.subtasks || []).filter((s) => s.done).length;
    if (t.subtasks && t.subtasks.length) {
      meta.push(`<span class="chip tag">📋 ${subDone}/${t.subtasks.length}</span>`);
    }
    if (t.note) meta.push('<button class="note-toggle" type="button">📝 备注</button>');

    const subHTML = (t.subtasks || []).map((s) => `
      <div class="subtask-row" data-sub="${s.id}">
        <button class="mini-check ${s.done ? 'done' : ''}" type="button" aria-label="子任务勾选">✓</button>
        <span class="sub-text ${s.done ? 'done' : ''}">${escapeHtml(s.text)}</span>
      </div>`).join('');

    return `
      <div class="card tier-${tier} ${opts.cls || ''}" data-id="${escapeHtml(t.id)}" data-t-ddl="${t.ddl}" data-t-created="${t.createdAt}">
        <div class="card-top">
          ${checkboxHTML(false)}
          <div class="card-main">
            <div class="card-title">${escapeHtml(t.title)}</div>
            <div class="card-meta">${meta.join('')}</div>
          </div>
          <div class="card-time">${timeText}</div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${progress * 100}%"></div></div>
        ${t.note ? `<div class="card-note">${escapeHtml(t.note)}</div>` : ''}
        ${subHTML ? `<div class="subtasks">${subHTML}</div>` : ''}
        ${opts.draggable ? '<span class="drag-handle" title="拖动排序">⋮⋮</span>' : ''}
      </div>`;
  }

  function repeatLabel(u) { return u === 'day' ? '每天' : u === 'week' ? '每周' : '每月'; }

  /* ================= 待办列表 ================= */
  function renderTodoList(now) {
    const box = $('#todo-list');
    const manual = Store.getSetting('manual');
    const active = Store.byStatus('active', now).filter((t) => !t.isBigEvent);
    const sorted = Store.sortActive(active, manual);

    if (!sorted.length) {
      box.innerHTML = '<div class="empty-state"><span class="big">🎀</span>还没有待办～<br>点右下角的 + 添加第一件事吧！</div>';
      return;
    }
    box.innerHTML = sorted.map((t) =>
      cardHTML(t, now, { draggable: manual })).join('');
  }

  /* ================= 大事件倒计时专区 ================= */
  function renderBigEvents(now) {
    const box = $('#big-events');
    const bigs = Store.byStatus('active', now)
      .filter((t) => t.isBigEvent)
      .sort((a, b) => a.ddl - b.ddl);

    if (!bigs.length) { box.innerHTML = ''; return; }

    box.innerHTML = `
      <div class="section-title">🎉 大事件倒计时</div>
      ${bigs.map((t) => `
        <div class="big-event" data-id="${escapeHtml(t.id)}" data-t-ddl="${t.ddl}">
          <div class="be-title">${escapeHtml(t.title)}</div>
          <div class="be-sub">${escapeHtml(t.category || '')} ${starsHTML(t.stars)}</div>
          <div class="be-count" data-t-ddl="${t.ddl}">${Util.diffHuman(t.ddl - now)}</div>
          <div class="be-actions">
            <button class="be-check" type="button" aria-label="勾选完成">✓</button>
            <span class="chip big">截止 ${Util.fmtDateTime(t.ddl)}</span>
          </div>
        </div>`).join('')}`;
  }

  /* ================= 墓碑占位（待办页底部） ================= */
  function renderOverdueSpot(now) {
    const box = $('#overdue-spot');
    const overdue = Store.byStatus('overdue', now);
    if (!overdue.length) { box.innerHTML = ''; return; }

    box.innerHTML = `
      <div class="tombstone-zone">
        <div class="zone-title">🪦 已过期 ${overdue.length} 项（点我跳转到过期栏）</div>
        ${overdue.map((t) => `
          <button class="tombstone-mini" type="button" data-goto-overdue>
            <span>🪦</span>
            <span class="tm-title">${escapeHtml(t.title)}</span>
            <span class="tm-ago">${Util.remainText(t.ddl - now)}</span>
          </button>`).join('')}
      </div>`;
  }

  /* ================= 已过期栏 ================= */
  function renderOverdueTab(now) {
    const box = $('#overdue-list');
    const overdue = Store.byStatus('overdue', now).sort((a, b) => a.ddl - b.ddl);

    if (!overdue.length) {
      box.innerHTML = '<div class="empty-state"><span class="big">🌷</span>没有过期任务，太棒啦！</div>';
      return;
    }

    box.innerHTML = overdue.map((t) => {
      const ago = Util.remainText(t.ddl - now);
      return `
        <div class="card overdue-card" data-id="${escapeHtml(t.id)}">
          <div class="card-top">
            ${checkboxHTML(false)}
            <div class="card-main">
              <div class="card-title">${escapeHtml(t.title)}</div>
              <div class="card-meta">
                ${t.category ? chipHTML('', t.category) : ''}
                ${starsHTML(t.stars)}
                ${t.isBigEvent ? chipHTML('big', '🎉 大事件') : ''}
              </div>
            </div>
          </div>
          <div class="overdue-tomb">🪦 ${ago} · 过期 7 天会自动进回收站</div>
          <div class="card-actions">
            <button class="mini-btn danger" data-act="trash" type="button">🗑️ 删除</button>
          </div>
        </div>`;
    }).join('');
  }

  /* ================= 已完成栏 ================= */
  function renderDoneTab() {
    const box = $('#done-list');
    const done = Store.byStatus('completed').sort((a, b) => b.completedAt - a.completedAt);

    if (!done.length) {
      box.innerHTML = '<div class="empty-state"><span class="big">✅</span>还没有完成的任务<br>去勾一个吧，有特效哦～</div>';
      return;
    }

    box.innerHTML = done.map((t) => `
      <div class="card done-card" data-id="${escapeHtml(t.id)}">
        <div class="card-top">
          ${checkboxHTML(true)}
          <div class="card-main">
            <div class="card-title">${escapeHtml(t.title)}</div>
            <div class="card-meta">
              ${t.category ? chipHTML('', t.category) : ''}
              ${starsHTML(t.stars)}
              ${t.isBigEvent ? chipHTML('big', '🎉 大事件') : ''}
            </div>
          </div>
        </div>
        <div class="done-when">🎀 ${Util.fmtDateTime(t.completedAt)} 完成 · 3 天后自动消失</div>
        <div class="card-actions">
          <button class="mini-btn" data-act="uncomplete" type="button">↩️ 撤销完成</button>
          <button class="mini-btn danger" data-act="trash" type="button">🗑️ 删除</button>
        </div>
      </div>`).join('');
  }

  /* ================= 回收站 ================= */
  function renderTrashList() {
    const box = $('#trash-list');
    const trashed = Store.byStatus('trashed').sort((a, b) => b.trashedAt - a.trashedAt);
    if (!trashed.length) {
      box.innerHTML = '<div class="empty-state"><span class="big">🗑️</span>回收站空空的～</div>';
      return;
    }
    box.innerHTML = trashed.map((t) => `
      <div class="trash-row" data-id="${escapeHtml(t.id)}">
        <span class="tr-title">${escapeHtml(t.title)}</span>
        <span class="tr-why">${t.trashReason === 'auto-overdue' ? '过期7天自动' : '手动删除'}</span>
        <button class="mini-btn" data-act="restore" type="button">恢复</button>
        <button class="mini-btn danger" data-act="purge" type="button">彻底删除</button>
      </div>`).join('');
  }

  function renderBadge(now) {
    const n = Store.byStatus('overdue', now).length;
    const badge = $('#badge-overdue');
    badge.hidden = n === 0;
    badge.textContent = n;
  }

  /* ================= 每秒实时刷新（不整卡重绘，只动时间和颜色） ================= */
  function updateTimes() {
    const now = Date.now();
    $$('.card[data-t-ddl]').forEach((card) => {
      const ddl = Number(card.dataset.tDdl);
      const created = Number(card.dataset.tCreated);
      const diff = ddl - now;
      if (diff <= 0) return; /* 状态翻转由 tick 里的 statusChanged 处理 */

      const timeEl = card.querySelector('.card-time');
      if (timeEl) {
        timeEl.textContent = (diff < 6 * Util.HOUR)
          ? '⏰ ' + Util.countdown(diff)
          : Util.remainText(diff);
      }

      const tier = Util.tierOf(diff);
      const cur = ['safe', 'warn', 'alert', 'danger'].find((c) => card.classList.contains('tier-' + c));
      if (cur && cur !== tier) {
        card.classList.remove('tier-' + cur);
        card.classList.add('tier-' + tier);
      }

      const fill = card.querySelector('.progress-fill');
      if (fill) fill.style.width = (Util.progressOf(diff, ddl - created) * 100) + '%';
    });

    $$('.be-count[data-t-ddl]').forEach((el) => {
      const diff = Number(el.dataset.tDdl) - now;
      if (diff > 0) el.textContent = Util.diffHuman(diff);
    });

  }

  /* ================= 勾选完成流程 ================= */
  const completing = new Set(); /* 防连点：同一任务动画期间忽略再次点击 */

  function onCheck(id, boxEl) {
    if (completing.has(id)) return;
    completing.add(id);
    const svg = FX.checkSvg();
    boxEl.appendChild(svg);
    boxEl.style.background = 'var(--red)';
    boxEl.style.borderColor = 'var(--red)';
    FX.drawCheck(svg);
    FX.completeFx(boxEl, () => {
      const card = boxEl.closest('.card, .big-event');
      if (card) card.classList.add('completing');
      setTimeout(() => {
        const r = Store.complete(id);
        completing.delete(id);
        renderAll();
        if (r && r.spawned) {
          FX.toast('🎀 完成！已自动生成下一次（' + repeatLabel(r.spawned.repeat) + '）');
        } else {
          FX.toast('🎀 完成！已移入「已完成」');
        }
      }, 450);
    });
  }

  /* ================= 表单抽屉 ================= */
  function openSheet(taskId) {
    const t = taskId ? Store.all().find((x) => x.id === taskId) : null;
    sheetState.tags = (t && t.tags) ? t.tags.slice() : [];
    sheetState.subtasks = (t && t.subtasks) ? t.subtasks.map((s) => ({ id: s.id, text: s.text, done: s.done })) : [];
    sheetState.stars = t ? t.stars : 1;

    $('#sheet-title').textContent = t ? '🎀 编辑待办' : '🎀 添加待办';
    $('#btn-delete').hidden = !t;
    $('#f-id').value = t ? t.id : '';
    $('#f-category').value = t ? t.category : '';
    $('#f-title').value = t ? t.title : '';
    $('#f-ddl').value = t ? Util.toLocalInputValue(t.ddl) : defaultDdlValue();
    $('#f-note').value = t ? t.note : '';
    $('#f-big').checked = t ? !!t.isBigEvent : false;
    $('#f-repeat').value = t && t.repeat ? t.repeat : '';
    $('#f-tags').value = '';
    renderStars(sheetState.stars);
    renderTagChips();
    renderSubtaskInputs();
    updateDdlTip();

    /* 历史分类下拉 */
    const dl = $('#category-history');
    dl.innerHTML = Store.categories().map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');

    $('#sheet-mask').hidden = false;
    $('#sheet').hidden = false;
    history.pushState({ sheetOpen: true }, ''); /* Android 返回键 → popstate → 关抽屉 */
    setTimeout(() => $('#f-title').focus(), 350);
  }

  function closeSheet() {
    $('#sheet-mask').hidden = true;
    $('#sheet').hidden = true;
  }

  /* Android 返回键：优先关抽屉，而不是退出整个 App */
  window.addEventListener('popstate', () => {
    if (!$('#sheet').hidden) closeSheet();
    else if (!$('#trash-sheet').hidden) { $('#trash-sheet').hidden = true; $('#trash-mask').hidden = true; }
    else if (!$('#settings-sheet').hidden) { $('#settings-sheet').hidden = true; $('#settings-mask').hidden = true; }
  });

  /* 键盘弹起时把正在输入的框滚到可视区（配合 viewport 的 interactive-widget） */
  $('#sheet').addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea, select')) {
      setTimeout(() => {
        try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e2) { }
      }, 320);
    }
  });

  function defaultDdlValue() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    return Util.toLocalInputValue(d.getTime());
  }

  function renderStars(n) {
    $$('#f-stars .star').forEach((el) => {
      const on = Number(el.dataset.star) <= n;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
    });
  }

  function renderTagChips() {
    const box = $('#f-tag-chips');
    box.innerHTML = sheetState.tags.map((tag, i) =>
      `<span class="chip">#${escapeHtml(tag)}<span class="x" data-tag-i="${i}">✕</span></span>`).join('');
  }

  function renderSubtaskInputs() {
    const box = $('#f-subtasks');
    box.innerHTML = sheetState.subtasks.map((s, i) => `
      <div class="subtask-edit" data-sub-i="${i}">
        <input type="text" class="text-input" value="${escapeHtml(s.text)}" placeholder="子任务 ${i + 1}" data-sub-input="${i}">
        <button type="button" class="mini-btn danger" data-sub-del="${i}">✕</button>
      </div>`).join('');
  }

  function updateDdlTip() {
    const tip = $('#f-ddl-tip');
    const v = $('#f-ddl').value;
    if (!v) { tip.textContent = ''; tip.classList.remove('hot'); return; }
    const diff = Util.fromLocalInputValue(v) - Date.now();
    tip.textContent = Util.remainText(diff);
    tip.classList.toggle('hot', diff > 0 && diff < 6 * Util.HOUR);
  }

  function saveForm(e) {
    e.preventDefault();
    const title = $('#f-title').value.trim();
    const ddlRaw = $('#f-ddl').value;
    if (!title) { FX.toast('⚠️ 先告诉我具体任务是什么～'); return; }
    if (!ddlRaw) { FX.toast('⚠️ 记得选一个 DDL 时间哦'); return; }
    const ddlTs = Util.fromLocalInputValue(ddlRaw);
    if (!Number.isFinite(ddlTs)) { FX.toast('⚠️ DDL 时间无效，请重新选择'); return; }

    const data = {
      title,
      category: $('#f-category').value.trim(),
      ddl: ddlTs,
      stars: sheetState.stars,
      note: $('#f-note').value.trim(),
      tags: sheetState.tags,
      subtasks: sheetState.subtasks.filter((s) => s.text.trim()).map((s) => ({ id: s.id, text: s.text.trim(), done: s.done })),
      isBigEvent: $('#f-big').checked,
      repeat: $('#f-repeat').value || null
    };

    const id = $('#f-id').value;
    if (id) {
      Store.update(id, data);
      FX.toast('🎀 已更新！');
    } else {
      Store.add(data);
      FX.toast('🎀 添加成功！按星级排好队啦');
    }
    closeSheet();
    renderAll();
  }

  /* ================= 手动拖拽排序 ================= */
  let drag = null; /* { card, startY, curY, moved } */

  function onDragStart(e, card) {
    if (!Store.getSetting('manual')) return;
    drag = {
      card,
      startY: e.clientY,
      curY: e.clientY,
      moved: false
    };
    card.classList.add('dragging');
    card.style.transform = 'translateY(0px)';
    card.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!drag) return;
    drag.curY = e.clientY;
    const dy = drag.curY - drag.startY;
    if (Math.abs(dy) > 6) drag.moved = true;
    drag.card.style.transform = `translateY(${dy}px)`;

    /* 找到当前悬停位置对应的插入目标 */
    $$('#todo-list .card:not(.dragging)').forEach((c) => c.classList.remove('drag-target'));
    if (!drag.moved) return;
    const rect = drag.card.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const targets = $$('#todo-list .card:not(.dragging)');
    for (const c of targets) {
      const r = c.getBoundingClientRect();
      if (mid > r.top && mid < r.bottom) { c.classList.add('drag-target'); break; }
    }
  }

  function onDragEnd() {
    if (!drag) return;
    const card = drag.card;
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    card.classList.remove('dragging');
    card.style.transform = '';

    if (drag.moved) {
      const ids = $$('#todo-list .card').map((c) => c.dataset.id);
      const targetIdx = ids.indexOf(card.dataset.id);

      /* 落点计算：中点落在目标卡上半 → 插它前面；下半 → 插它后面；
         没有任何目标卡（拖到列表最上/最下）→ 插到列表头/尾 */
      let insertIdx = ids.length - 1; /* 默认：末尾 */
      const others = $$('#todo-list .card:not(.dragging)');
      for (const o of others) {
        const r = o.getBoundingClientRect();
        if (midY >= r.top && midY <= r.bottom) {
          const oMid = r.top + r.height / 2;
          insertIdx = ids.indexOf(o.dataset.id);
          if (midY > oMid) insertIdx += 1; /* 目标卡下半部：插到它后面 */
          break;
        }
        if (midY < r.top) { insertIdx = ids.indexOf(o.dataset.id); break; } /* 拖到最上方 */
      }
      if (insertIdx > targetIdx) insertIdx -= 1; /* 删除位移补偿（目标在原卡之后） */

      ids.splice(targetIdx, 1);
      ids.splice(Math.max(0, Math.min(insertIdx, ids.length)), 0, card.dataset.id);

      /* 把顺序写回 manualPos */
      ids.forEach((tid, i) => Store.update(tid, { manualPos: i }));
      FX.toast('✋ 顺序已保存');
    }
    drag = null;
    $$('#todo-list .card.drag-target').forEach((c) => c.classList.remove('drag-target'));
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    /* 标签页切换 */
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.nav-item').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const name = btn.dataset.view;
        $$('.view').forEach((v) => v.classList.remove('is-active'));
        $('#view-' + name).classList.add('is-active');
        $('#app').scrollTop = 0; /* 切页重置滚动位置 */
        if (name === 'calendar') CalendarView.render();
        if (name === 'stats') StatsView.render();
      });
    });

    /* 事件委托：绑在 document 上（回收站抽屉等 #app 之外的弹层也能收到） */
    document.addEventListener('click', (e) => {
      const actBtn = e.target.closest('[data-act]');
      if (actBtn) {
        const id = actBtn.closest('[data-id]').dataset.id;
        const act = actBtn.dataset.act;
        if (act === 'trash') { Store.trash(id, 'manual'); FX.toast('🗑️ 已移入回收站'); renderAll(); }
        if (act === 'uncomplete') { Store.uncomplete(id); FX.toast('↩️ 已撤销完成'); renderAll(); }
        if (act === 'restore') { Store.restore(id); FX.toast('🎀 已恢复'); renderAll(); }
        if (act === 'purge') { Store.removePermanent(id); FX.toast('🗑️ 已彻底删除'); renderAll(); }
        return;
      }

      const sub = e.target.closest('.subtask-row');
      if (sub) {
        const card = sub.closest('[data-id]');
        Store.toggleSubtask(card.dataset.id, sub.dataset.sub);
        renderAll();
        return;
      }

      const noteToggle = e.target.closest('.note-toggle');
      if (noteToggle) {
        const card = noteToggle.closest('.card');
        const note = card.querySelector('.card-note');
        if (note) note.classList.toggle('is-open');
        return;
      }

      const check = e.target.closest('.checkbox, .be-check');
      if (check) {
        /* 已完成卡片的勾选框：再点一下 = 撤销完成 */
        if (check.closest('.done-card')) {
          const holder = check.closest('[data-id]');
          Store.uncomplete(holder.dataset.id);
          FX.toast('↩️ 已撤销完成');
          renderAll();
          return;
        }
        const holder = check.closest('[data-id]');
        if (check.classList.contains('be-check')) {
          if (completing.has(holder.dataset.id)) return;
          completing.add(holder.dataset.id);
          check.textContent = '';
          check.appendChild(FX.checkSvg());
          FX.drawCheck(check.querySelector('svg'));
          FX.completeFx(check, () => {
            setTimeout(() => {
              const r = Store.complete(holder.dataset.id);
              completing.delete(holder.dataset.id);
              renderAll();
              FX.toast(r && r.spawned ? '🎀 完成！已生成下一次' : '🎀 完成！');
            }, 450);
          });
        } else {
          onCheck(holder.dataset.id, check);
        }
        return;
      }

      const gotoOverdue = e.target.closest('[data-goto-overdue]');
      if (gotoOverdue) {
        const btn = $('.nav-item[data-view="overdue"]');
        if (btn) btn.click();
        return;
      }

      /* 大事件卡片本体 → 编辑（勾选框除外，勾选在上面已处理） */
      const big = e.target.closest('.big-event');
      if (big) {
        openSheet(big.dataset.id);
        return;
      }

      /* 点击卡片本体 → 编辑 */
      const card = e.target.closest('.card');
      if (card) {
        /* 拖拽句柄不打开编辑 */
        if (e.target.closest('.drag-handle')) return;
        openSheet(card.dataset.id);
      }
      const timeline = e.target.closest('.timeline-row');
      if (timeline) {
        /* 日历行点击 → 编辑（在 calendar.js 里已绑定，此处兜底） */
      }
    });

    /* 拖拽 */
    $('#todo-list').addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.drag-handle');
      if (!handle) return;
      const card = handle.closest('.card');
      if (card) onDragStart(e, card);
    });
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);

    /* 添加按钮 */
    $('#fab').addEventListener('click', () => openSheet(null));

    /* 表单 */
    $('#task-form').addEventListener('submit', saveForm);
    $('#btn-cancel').addEventListener('click', closeSheet);
    $('#sheet-mask').addEventListener('click', closeSheet);
    $('#btn-delete').addEventListener('click', () => {
      const id = $('#f-id').value;
      if (!id) return;
      if (confirm('确定删除这个任务吗？会先进回收站，30 天内可恢复')) {
        Store.trash(id, 'manual');
        closeSheet();
        FX.toast('🗑️ 已移入回收站');
        renderAll();
      }
    });

    /* 星级 */
    $('#f-stars').addEventListener('click', (e) => {
      const star = e.target.closest('.star');
      if (!star) return;
      const n = Number(star.dataset.star);
      sheetState.stars = sheetState.stars === n ? 1 : n; /* 再点同一颗回退到 1 星 */
      renderStars(sheetState.stars);
      star.classList.remove('bump');
      void star.offsetWidth;
      star.classList.add('bump');
    });

    /* 标签 */
    $('#f-tags').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = $('#f-tags').value.trim();
        if (v && !sheetState.tags.includes(v)) {
          sheetState.tags.push(v);
          renderTagChips();
        }
        $('#f-tags').value = '';
      }
    });
    $('#f-tag-chips').addEventListener('click', (e) => {
      const x = e.target.closest('.x');
      if (!x) return;
      sheetState.tags.splice(Number(x.dataset.tagI), 1);
      renderTagChips();
    });

    /* 子任务 */
    $('#btn-add-subtask').addEventListener('click', () => {
      sheetState.subtasks.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: '', done: false });
      renderSubtaskInputs();
    });
    $('#f-subtasks').addEventListener('click', (e) => {
      const del = e.target.closest('[data-sub-del]');
      if (del) {
        sheetState.subtasks.splice(Number(del.dataset.subDel), 1);
        renderSubtaskInputs();
      }
    });
    $('#f-subtasks').addEventListener('input', (e) => {
      const inp = e.target.closest('[data-sub-input]');
      if (inp) sheetState.subtasks[Number(inp.dataset.subInput)].text = inp.value;
    });

    /* DDL 剩余提示 */
    $('#f-ddl').addEventListener('change', updateDdlTip);

    /* 回收站 */
    $('#btn-trash').addEventListener('click', () => {
      renderTrashList();
      $('#trash-mask').hidden = false;
      $('#trash-sheet').hidden = false;
    });
    $('#btn-trash-close').addEventListener('click', () => {
      $('#trash-mask').hidden = true;
      $('#trash-sheet').hidden = true;
    });
    $('#trash-mask').addEventListener('click', () => {
      $('#trash-mask').hidden = true;
      $('#trash-sheet').hidden = true;
    });
    $('#btn-empty-trash').addEventListener('click', () => {
      if (confirm('确定清空回收站吗？清空后无法恢复哦')) {
        Store.emptyTrash();
        FX.toast('🗑️ 回收站已清空');
        renderAll();
      }
    });

    /* 设置 */
    $('#btn-settings').addEventListener('click', () => {
      $('#settings-mask').hidden = false;
      $('#settings-sheet').hidden = false;
    });
    $('#settings-mask').addEventListener('click', () => {
      $('#settings-mask').hidden = true;
      $('#settings-sheet').hidden = true;
    });
    $('#set-sound').addEventListener('change', (e) => {
      Store.setSetting('sound', e.target.checked);
      if (e.target.checked) FX.beep();
    });
    $('#set-vibrate').addEventListener('change', (e) => Store.setSetting('vibrate', e.target.checked));
    $('#set-manual').addEventListener('change', (e) => {
      Store.setSetting('manual', e.target.checked);
      FX.toast(e.target.checked ? '✋ 手动排序已开启，长按卡片左侧 ⋮⋮ 拖动' : '🎀 已恢复自动排序（星级优先）');
      renderAll();
    });
    $('#btn-export').addEventListener('click', () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hellotodo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      FX.toast('📤 备份已导出');
    });
    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (!confirm('导入会用备份文件覆盖当前全部数据，确定吗？')) return;
          Store.importJSON(reader.result);
          syncSettingsUI(); /* 备份里带过来的设置同步到开关上 */
          FX.toast('📥 导入成功！');
          renderAll();
        } catch (err) {
          FX.toast('⚠️ 导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    $('#btn-clear-all').addEventListener('click', () => {
      if (confirm('确定清空全部数据吗？此操作不可撤销！')) {
        Store.clearAll();
        FX.toast('🗑️ 已清空');
        renderAll();
      }
    });

    /* 日历翻页 */
    $('#cal-prev').addEventListener('click', () => CalendarView.prevMonth());
    $('#cal-next').addEventListener('click', () => CalendarView.nextMonth());
  }

  function syncSettingsUI() {
    $('#set-sound').checked = !!Store.getSetting('sound');
    $('#set-vibrate').checked = !!Store.getSetting('vibrate');
    $('#set-manual').checked = !!Store.getSetting('manual');
  }

  /* ================= 心跳 ================= */
  let tickCount = 0;
  function tick() {
    tickCount += 1;
    updateTimes();
    /* 每 30 秒：自动清理（完成 3 天 / 过期 7 天 / 回收站 30 天） */
    if (tickCount % 30 === 0) {
      Store.purge();
    }
    /* 每分钟整刷一次（墓碑“过期 X 天”等文案保鲜）；拖拽进行中跳过 */
    if (tickCount % 60 === 0 && !drag) {
      renderAll();
      return;
    }
    /* 状态翻转（如 DDL 刚过 → 进过期栏）；拖拽进行中跳过，避免摧毁拖动 */
    if (statusChanged() && !drag) renderAll();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  return { renderAll, tick, bindEvents, syncSettingsUI, openSheet, closeSheet };
})();
