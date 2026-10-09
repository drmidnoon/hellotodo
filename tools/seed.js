// 冒烟测试种子数据：各状态任务
var now = Date.now(), H = 3600000, D = 86400000;
function mk(o) {
  return Object.assign({
    id: 't' + Math.random().toString(36).slice(2, 9),
    title: '', category: '', ddl: now + D, stars: 1, note: '', tags: [], subtasks: [],
    isBigEvent: false, repeat: null, repeatAnchor: null, createdAt: now - D,
    completedAt: null, trashedAt: null, trashReason: null, manualPos: null, spawnedFrom: null
  }, o);
}
localStorage.setItem('hellotodo.tasks.v1', JSON.stringify([
  mk({ id: 't-danger',  title: '紧急任务测试', category: '文体部', ddl: Math.min(now + 2 * H, new Date().setHours(23, 59, 0, 0)), stars: 5, tags: ['紧急'], note: '备注测试' }),
  mk({ id: 't-warn',    title: '提醒任务测试', category: '班级', ddl: now + 30 * H, stars: 3 }),
  mk({ id: 't-safe',    title: '安心任务测试', category: '学习', ddl: now + 5 * D, stars: 2 }),
  mk({ id: 't-overdue', title: '过期任务测试', category: '生活', ddl: now - 2 * H, stars: 4 }),
  mk({ id: 't-done',    title: '已完成任务测试', category: '文体部', ddl: now - D, stars: 3, completedAt: now - H }),
  mk({ id: 't-big',     title: '期末考试', category: '学习', ddl: now + 10 * D, stars: 5, isBigEvent: true }),
  mk({ id: 't-trash',   title: '回收站任务测试', category: '', ddl: now + D, stars: 1, trashedAt: now - H, trashReason: 'manual' })
]));
localStorage.setItem('hellotodo.completions.v1', JSON.stringify([
  { id: 't-done', ts: now - H }, { id: 'x', ts: now - D }, { id: 'y', ts: now - 5 * D }
]));
location.replace('../index.html');
