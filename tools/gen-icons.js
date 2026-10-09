/* =========================================================
   gen-icons.js —— 用纯 Node（零依赖）生成 PWA PNG 图标
   画的是和 icons/icon.svg 同款的小猫头：粉底 + 白猫脸 + 红蝴蝶结
   运行：node tools/gen-icons.js
   ========================================================= */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.slice(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 形状判断 ---------- */
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRing(x, y, cx, cy, rOut, rIn) {
  return inCircle(x, y, cx, cy, rOut) && !inCircle(x, y, cx, cy, rIn);
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/* ---------- 配色 ---------- */
const C = {
  BG: [255, 209, 220],      // 粉底 #FFD1DC
  WHITE: [255, 255, 255],
  RED: [230, 0, 18],        // #E60012
  BOW: [255, 107, 122],     // 蝴蝶结中心 #FF6B7A
  DARK: [74, 43, 50],       // 眼睛/胡须
  NOSE: [255, 179, 0]
};

/* ---------- 绘制小猫（scale = 0.72 时留出 maskable 安全区） ---------- */
function drawKitty(size, scale) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const s = scale;

  /* 圆角矩形粉底 */
  const r = 0.22 * size;
  const inRoundRect = (x, y) => {
    if (x < 0 || x > size || y < 0 || y > size) return false;
    /* 中间横条 / 竖条区域直接算在矩形内 */
    if ((x >= r && x <= size - r) || (y >= r && y <= size - r)) return true;
    const qx = x < r ? r : size - r;
    const qy = y < r ? r : size - r;
    return inCircle(x, y, qx, qy, r);
  };

  /* 各部位坐标（相对中心、乘以 scale） */
  const P = (dx, dy) => [cx + dx * s, cy + dy * s];
  const R = (v) => v * s;
  const headR = R(150);
  const ringW = R(15);

  const earLOut = [...P(-108, -206), ...P(-134, -228), ...P(-2, -126)];
  const earROut = [...P(108, -206), ...P(134, -228), ...P(2, -126)];
  const earLIn = [...P(-104, -198), ...P(-126, -216), ...P(-6, -128)];
  const earRIn = [...P(104, -198), ...P(126, -216), ...P(6, -128)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = null;

      if (inRoundRect(x, y)) c = C.BG;

      /* 耳朵：先红描边（外扩），再白填充（内缩） */
      if (inTriangle(x, y, ...earLOut) || inTriangle(x, y, ...earROut)) c = C.RED;
      if (inTriangle(x, y, ...earLIn) || inTriangle(x, y, ...earRIn)) c = C.WHITE;

      /* 头：红环 + 白脸 */
      if (inRing(x, y, cx + 0 * s, cy + 0 * s, headR, headR - ringW)) c = C.RED;
      if (inCircle(x, y, cx, cy, headR - ringW)) c = C.WHITE;

      /* 眼睛 */
      const [elx, ely] = P(-60, -12), [erx, ery] = P(60, -12);
      if (inEllipse(x, y, elx, ely, R(13), R(19)) || inEllipse(x, y, erx, ery, R(13), R(19))) c = C.DARK;

      /* 鼻子 */
      const [nx, ny] = P(0, 32);
      if (inEllipse(x, y, nx, ny, R(12), R(9))) c = C.NOSE;

      /* 胡须（粗线） */
      const whiskers = [
        [P(-104, 18), P(-164, 6)], [P(-104, 42), P(-166, 44)], [P(-104, 66), P(-162, 80)],
        [P(104, 18), P(164, 6)], [P(104, 42), P(166, 44)], [P(104, 66), P(162, 80)]
      ];
      for (const [a, b] of whiskers) {
        if (segDist(x, y, a[0], a[1], b[0], b[1]) <= R(4)) { c = C.DARK; break; }
      }

      /* 蝴蝶结（左耳旁） */
      const bowR = R(48);
      if (inCircle(x, y, ...P(-112, -126), bowR) || inCircle(x, y, ...P(-48, -126), bowR)) {
        c = C.RED;
      }
      if (inCircle(x, y, ...P(-80, -126), R(20))) c = C.BOW;
      if (inCircle(x, y, ...P(-112, -126), R(8)) || inCircle(x, y, ...P(-48, -126), R(8))) c = C.WHITE;

      const i = (y * size + x) * 4;
      if (c) {
        rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
      }
      /* 圆角外的角落保持全透明（Buffer 默认已零填充） */
    }
  }
  return rgba;
}

/* ---------- 输出 ---------- */
const outDir = path.join(__dirname, '..', 'icons');
/* 绘图坐标按 512 画布设计：192 图标缩到 192/512；
   512 图标缩到 0.72 留出 maskable 安全区 */
fs.writeFileSync(path.join(outDir, 'icon-192.png'), encodePNG(192, drawKitty(192, 192 / 512)));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), encodePNG(512, drawKitty(512, 0.72)));
console.log('✅ 已生成 icons/icon-192.png 和 icons/icon-512.png');
