/* =========================================================
   anim.js —— Hello Kitty 风勾选特效：蝴蝶结弹出 + 星星爱心
   四散 + 对勾一笔画成 + “叮铃”音效 + 震动
   ========================================================= */
const FX = (() => {
  let audioCtx = null;

  /* 两声可爱的“叮咚” */
  function beep() {
    if (!Store.getSetting('sound')) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [[880, 0], [1318.5, 0.09]].forEach(([freq, delay]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime + delay;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
        osc.start(t0);
        osc.stop(t0 + 0.32);
      });
    } catch (e) { /* 音频不可用时静默 */ }
  }

  function vibrate(ms = 40) {
    if (!Store.getSetting('vibrate')) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { }
  }

  /* 对勾 SVG（由卡片勾选框调用，动画由 drawCheck 触发） */
  function checkSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'check-path');
    path.setAttribute('d', 'M5 12.5 L10 17.5 L19 7');
    svg.appendChild(path);
    return svg;
  }

  /* 一笔画成对勾 */
  function drawCheck(svg) {
    const p = svg.querySelector('.check-path');
    if (!p) return;
    p.style.transition = 'stroke-dashoffset .35s ease .1s';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      p.style.strokeDashoffset = '0';
    }));
  }

  /* 在勾选框上方播放整套特效；done 回调在对勾画完后触发 */
  function completeFx(boxEl, done) {
    const rect = boxEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const layer = document.createElement('div');
    layer.className = 'fx-layer';
    document.body.appendChild(layer);

    // 1. 蝴蝶结弹出
    const bow = document.createElement('div');
    bow.className = 'fx-bow';
    bow.textContent = '🎀';
    bow.style.left = (cx - 28) + 'px';
    bow.style.top = (cy - 62) + 'px';
    layer.appendChild(bow);

    // 2. 星星 / 爱心四散
    const emojis = ['⭐', '✨', '💖', '🌟', '💕', '✨'];
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'fx-sparkle';
      s.textContent = emojis[i % emojis.length];
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      const ang = (Math.PI * 2 * i) / 6;
      s.style.setProperty('--dx', Math.round(Math.cos(ang) * 64) + 'px');
      s.style.setProperty('--dy', Math.round(Math.sin(ang) * 64 - 22) + 'px');
      s.style.setProperty('--rot', Math.round((ang * 180) / Math.PI) + 'deg');
      layer.appendChild(s);
    }

    // 3. 音效 + 震动
    beep();
    vibrate(40);

    setTimeout(() => layer.remove(), 950);
    if (done) setTimeout(done, 430);
  }

  /* 全局小提示 */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  return { completeFx, checkSvg, drawCheck, toast, beep, vibrate };
})();
