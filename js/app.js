/* =========================================================
   app.js —— 启动入口
   ========================================================= */
(function () {
  'use strict';

  /* 数据一变界面就刷（所有 Store 写操作都会触发） */
  Store.subscribe(() => UI.renderAll());

  /* 存储失败（空间不足等）要告诉用户，不能静默丢数据 */
  Store.setPersistErrorHandler(() => FX.toast('⚠️ 浏览器存储空间不足，这次修改可能没保存'));

  /* 多标签页同步：另一个标签改了数据，本标签重新读入最新数据再刷新 */
  window.addEventListener('storage', () => {
    Store.reload();
    UI.renderAll();
  });

  function boot() {
    CalendarView.init();
    UI.bindEvents();
    UI.syncSettingsUI();

    /* 打开时先跑一次自动清理：
       已完成超 3 天消失 / 过期 7 天进回收站 / 回收站超 30 天彻底删除 */
    Store.purge();
    UI.renderAll();

    /* 每秒心跳：<6h 跳秒倒计时、颜色分档渐变、自动清理、状态翻转侦测 */
    setInterval(() => UI.tick(), 1000);

    /* 注册服务工作者（PWA 离线缓存）。
       注意：file:// 直接双击打开时浏览器不允许注册，会自动跳过；
       要用 PWA 功能请通过本地服务器访问（见 README）。 */
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
