/* ============================================================
 *  VÒNG XOAY MAY MẮN — JS THUẦN + 2 CANVAS + ÂM THANH CƠ BẢN
 *  - 🎨 Hình ảnh: 2 canvas chồng nhau (#wheel quay, #fx đứng yên)
 *  - 🎧 Âm thanh: whoosh (loop khi quay), tick (qua ranh lát)
 *  - Không dùng Winwheel/GSAP; animate bằng requestAnimationFrame
 *  - ĐÃ BỎ: jingle win/lose, phím M mute
 * ============================================================ */

/* -------------------------------
   DOM & STATE CHUNG
---------------------------------*/
const wrap        = document.querySelector('.wheel-wrap');
const wheelCanvas = document.getElementById('wheel'); // 🎨 lớp quay
const fxCanvas    = document.getElementById('fx');    // 🎨 lớp đứng yên (pointer & highlight)
const ctxWheel    = wheelCanvas.getContext('2d');
const ctxFx       = fxCanvas.getContext('2d');

const spinBtn  = document.getElementById('spinBtn');
const statusEl = document.getElementById('status');

let slices = [];     // dữ liệu lát từ BE
let rotation = 0;    // góc hiện tại (radian)
let N = 0;           // số lát
let sliceAngle = 0;  // góc mỗi lát (radian)

/* ============================================================
 * 🎧 AUDIO MANAGER (Web Audio API)
 * - Quản lý whoosh loop (âm gió khi quay) và tick (mỗi khi qua ranh lát)
 * - Không có jingle, không có phím mute
 * ============================================================ */
function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Master gain (giữ để dễ chỉnh tổng âm lượng nếu cần)
  const master = ctx.createGain();
  master.gain.value = 1.0;
  master.connect(ctx.destination);

  // Bus riêng
  const whooshGain = ctx.createGain(); whooshGain.gain.value = 0; whooshGain.connect(master);
  const tickGain   = ctx.createGain(); tickGain.gain.value   = 0.9; tickGain.connect(master);

  // Bộ nhớ đệm tiếng đã decode
  const buffers = { whoosh: null, tick: null };
  let whooshSrc = null;

  /** 📥 Tải & decode 1 file âm thanh */
  async function loadBuffer(url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  }

  /** 📥 Tải tất cả file âm thanh (chạy khi init) */
  async function loadAll() {
    buffers.whoosh = await loadBuffer('/sfx/whoosh.loop.wav'); // giữ WAV để loop sạch
    buffers.tick   = await loadBuffer('/sfx/tick.wav');
  }

  /** ▶️ Đảm bảo AudioContext được resume (bị chặn tới khi có user gesture, đặc biệt iOS/Safari) */
  async function resumeIfNeeded() {
    if (ctx.state === 'suspended') await ctx.resume();
  }

  /** ▶️ Bắt đầu phát whoosh dạng loop, fade-in nhẹ */
  function startWhoosh() {
    if (!buffers.whoosh) return;
    stopWhooshImmediate();

    whooshSrc = ctx.createBufferSource();
    whooshSrc.buffer = buffers.whoosh;
    whooshSrc.loop = true;
    whooshSrc.playbackRate.value = 0.9; // sẽ tinh chỉnh theo tốc độ quay
    whooshSrc.connect(whooshGain);

    const now = ctx.currentTime;
    whooshGain.gain.cancelScheduledValues(now);
    whooshGain.gain.setValueAtTime(whooshGain.gain.value, now);
    whooshGain.gain.linearRampToValueAtTime(0.35, now + 0.18); // fade-in
    whooshSrc.start();
  }

  /** 🎚️ Cập nhật âm lượng/tốc độ whoosh dựa theo vận tốc góc */
  function updateWhoosh({ gain, rate }) {
    if (!whooshSrc) return;
    const now = ctx.currentTime;
    const g = Math.max(0, Math.min(0.6, gain));
    const r = Math.max(0.7, Math.min(1.6, rate));
    whooshGain.gain.linearRampToValueAtTime(g, now + 0.08);
    try { whooshSrc.playbackRate.setTargetAtTime(r, now, 0.06); } catch(e){}
  }

  /** ⏹️ Dừng whoosh mượt (fade-out) khi kết thúc quay */
  function stopWhooshSmooth() {
    if (!whooshSrc) return;
    const src = whooshSrc; whooshSrc = null;
    const now = ctx.currentTime;
    whooshGain.gain.cancelScheduledValues(now);
    whooshGain.gain.setValueAtTime(whooshGain.gain.value, now);
    whooshGain.gain.linearRampToValueAtTime(0.0, now + 0.22);
    try { src.stop(now + 0.25); } catch(e){}
  }

  /** ⛔ Dừng whoosh ngay lập tức (an toàn) */
  function stopWhooshImmediate() {
    if (!whooshSrc) return;
    try { whooshSrc.stop(); } catch(e){}
    whooshSrc = null;
  }

  /** 🔊 Phát tick 1 lần (ngắn), mỗi lần qua ranh lát */
  function playTick() {
    if (!buffers.tick) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers.tick;
    src.playbackRate.value = 0.975 + Math.random()*0.05; // ±5% để đỡ đơn điệu
    src.connect(tickGain);
    src.start();
  }

  return {
    ctx,
    loadAll,
    resumeIfNeeded,
    startWhoosh,
    updateWhoosh,
    stopWhooshSmooth,
    playTick
  };
}
const audio = createAudio();

/* ============================================================
 * 🎨 HIỂN THỊ — Resize HiDPI
 * - Thiết lập kích thước & scale theo devicePixelRatio
 * - Vẽ lại FX (đứng yên) và Wheel (quay) theo rotation hiện tại
 * ============================================================ */
/** 📐 Cập nhật kích thước canvas theo kích thước wrap + DPR, rồi vẽ lại */
function resize() {
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  for (const c of [wheelCanvas, fxCanvas]) {
    c.width  = Math.floor(rect.width * dpr);
    c.height = Math.floor(rect.height * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
  }
  drawFx();          // vẽ highlight/pointer (đứng yên)
  drawWheel(rotation);
}

/* ============================================================
 * 🚀 KHỞI TẠO
 * - Preload âm thanh
 * - Lấy dữ liệu lát từ BE
 * - Thiết lập render ban đầu và lắng nghe resize
 * ============================================================ */
/** 🔧 Init toàn bộ ứng dụng FE */
async function init() {
  // Preload audio song song (không chặn UI)
  audio.loadAll().catch(err => console.warn('Audio preload error:', err));

  // Lấy cấu hình bánh xe (ẩn weight)
  const data = await fetch('/api/wheel').then(r => r.json());
  slices = data.slices || [];
  N = Math.max(1, slices.length || 10);
  sliceAngle = (2 * Math.PI) / N;

  resize();
  statusEl.textContent = 'Sẵn sàng';
}
init();
window.addEventListener('resize', resize);

/* ============================================================
 * 🖱️ TƯƠNG TÁC — NÚT QUAY Ở TÂM
 * - Gọi /api/spin -> nhận index trúng
 * - Tính góc đích -> animate -> cập nhật trạng thái
 * - Quản lý whoosh start/stop và tick theo ranh lát
 * ============================================================ */
spinBtn.addEventListener('click', async () => {
  if (spinBtn.disabled) return;
  spinBtn.disabled = true;
  statusEl.textContent = 'Đang quay...';

  try {
    await audio.resumeIfNeeded();  // cần user gesture để phát audio (iOS/Safari)
    audio.startWhoosh();           // bật whoosh loop (fade-in)

    // Lấy kết quả từ server
    const res = await fetch('/api/spin', { method:'POST' }).then(r => r.json());
    if (res.error) throw new Error(res.error);

    const targetIndex = res.index;
    const label       = res.label;

    // Góc tâm lát trúng
    const targetCenterAngle = targetIndex * sliceAngle + sliceAngle / 2;

    // Làm cho tâm lát trúng đi lên đỉnh (kim ở -90°)
    let targetRotation = -Math.PI / 2 - targetCenterAngle;

    // Quay thêm ≥ 2 vòng (ở đây đảm bảo ≥ 4π từ góc hiện tại) để mượt mắt
    while (targetRotation <= rotation + 4 * Math.PI) targetRotation += 2 * Math.PI;

    // Animate + tick/âm lượng whoosh sẽ được cập nhật trong frame loop
    await animateTo(targetRotation, 2300);

    statusEl.textContent = `Kết quả: ${label}`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Có lỗi, thử lại sau.';
  } finally {
    spinBtn.disabled = false;
  }
});

/* ============================================================
 * 🎨 VẼ LỚP QUAY (#wheel)
 * - Vành vàng (rim + bevel), các lát (radial gradient), hubcap 3 vòng
 * - Nhãn lát bọc dòng theo bán kính
 * ============================================================ */
/** 🎨 Vẽ toàn bộ bánh xe theo góc rot (radian) */
function drawWheel(rot) {
  const { width, height } = wrap.getBoundingClientRect();
  const cx = width / 2, cy = height / 2;
  const rOuter = Math.min(width, height) / 2;

  // Các bán kính/tham số bố cục
  const rim      = 18;                 // độ dày vành vàng ngoài
  const bevel    = 8;                  // rãnh tối (bevel) sát trong
  const rWheel   = rOuter - 6;         // lề 6px
  const rRimOut  = rWheel;
  const rRimIn   = rWheel - rim;
  const rSlices  = rRimIn - 2;         // mặt lát
  const rHubOut  = Math.max(42, rSlices * 0.20);
  const rHubIn   = rHubOut * 0.55;

  const ctx = ctxWheel;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  // --- Vành vàng kim loại ---
  ring(ctx, 0, 0, rRimIn, rRimOut, goldGradient(ctx, -rRimOut, -rRimOut, rRimOut*2, rRimOut*2));
  ring(ctx, 0, 0, rRimIn - bevel, rRimIn, '#8c6e24');

  // --- Các lát (radial gradient), viền lát & nhãn ---
  for (let i = 0; i < N; i++) {
    const start = i * sliceAngle;
    const end   = start + sliceAngle;

    // lát
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, rSlices, start, end);
    ctx.closePath();

    const base = sliceColor(i);
    const grad = ctx.createRadialGradient(0, 0, rSlices * 0.10, 0, 0, rSlices);
    grad.addColorStop(0,   lighten(base, 0.18));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1,   darken(base, 0.12));
    ctx.fillStyle = grad;
    ctx.fill();

    // viền lát
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // nhãn lát
    ctx.save();
    const mid = start + sliceAngle / 2;
    ctx.rotate(mid);
    ctx.fillStyle    = '#111';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = '600 14px system-ui';
    wrapText(ctx, slices[i]?.label ?? `Lát ${i+1}`, rSlices * 0.65, 86, 16);
    ctx.restore();
  }

  // --- Hubcap (mâm) 3 vòng: sáng–tối–sáng ---
  ring(ctx, 0, 0, rHubIn * 0.9, rHubOut,      chromeGradient(ctx, rHubOut));
  ring(ctx, 0, 0, rHubIn * 0.6, rHubIn * 0.9, '#b7b7b7');
  ring(ctx, 0, 0, 0,             rHubIn * 0.6, chromeGradient(ctx, rHubIn * 0.8));

  ctx.restore();
}

/* ============================================================
 * 🎨 VẼ LỚP FX ĐỨNG YÊN (#fx)
 * - Highlight/specular mờ & vệt sáng phía trên
 * - Pointer cố định ở đỉnh (tam giác)
 * ============================================================ */
/** 🎨 Vẽ highlight & pointer cố định, không chịu ảnh hưởng rotation */
function drawFx() {
  const { width, height } = wrap.getBoundingClientRect();
  const cx = width / 2, cy = height / 2;
  const r  = Math.min(width, height) / 2;

  const ctx = ctxFx;
  ctx.clearRect(0, 0, width, height);

  // Specular highlight lệch tâm
  const radial = ctx.createRadialGradient(cx - r*0.25, cy - r*0.30, r*0.05, cx - r*0.20, cy - r*0.35, r*0.85);
  radial.addColorStop(0, 'rgba(255,255,255,0.25)');
  radial.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = radial;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.96, 0, 2*Math.PI); ctx.fill();

  // Vệt sáng bán nguyệt phía trên
  ctx.beginPath();
  ctx.ellipse(cx, cy - r*0.35, r*0.85, r*0.25, 0, 0, Math.PI, true);
  ctx.closePath();
  const sheen = ctx.createLinearGradient(cx, cy - r*0.6, cx, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0.40)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen; ctx.fill();

  // Pointer cố định (tam giác) ở đỉnh
  const pTopY = cy - r + 6;
  ctx.beginPath();
  ctx.moveTo(cx, pTopY);
  ctx.lineTo(cx - 16, pTopY + 34);
  ctx.lineTo(cx + 16, pTopY + 34);
  ctx.closePath();
  const pointerGrad = ctx.createLinearGradient(cx, pTopY, cx, pTopY + 34);
  pointerGrad.addColorStop(0, '#f6d676');
  pointerGrad.addColorStop(1, '#c4962a');
  ctx.fillStyle = pointerGrad;
  ctx.fill();
  ctx.lineWidth   = 2;
  ctx.strokeStyle = '#8a6f1f';
  ctx.stroke();
}

/* ============================================================
 * 🧭 ANIMATE VỀ GÓC MỤC TIÊU
 * - Tween cubic-out; cập nhật whoosh dựa trên vận tốc góc
 * - Phát tick khi qua ranh lát (tính từ kim ở -90°)
 * ============================================================ */
/**
 * Animate quay tới góc `target` trong `durationMs`.
 * - Trong mỗi frame:
 *   + cập nhật rotation (ease-out)
 *   + vẽ lại bánh
 *   + tính vận tốc góc -> update whoosh (gain/rate)
 *   + phát tick nếu đi qua ranh lát (chống bắn quá dày bằng TICK_GAP_MS)
 */
function animateTo(target, durationMs) {
  return new Promise(resolve => {
    const startRot = rotation;
    const delta    = target - startRot;
    const startT   = performance.now();

    // Tick-crossing: theo dõi chỉ số ranh trước đó
    let prevPhaseFloor = Math.floor(( -rotation - Math.PI/2 ) / sliceAngle);
    let lastTickAt = 0;           // ms
    const TICK_GAP_MS = 70;       // tối thiểu 70ms giữa 2 tick

    // Theo dõi tốc độ
    let prevTime = startT;
    let prevRot  = startRot;

    function frame(now) {
      const t     = Math.min(1, (now - startT) / durationMs);
      const eased = easeOutCubic(t);

      rotation = startRot + delta * eased;
      drawWheel(rotation);

      // --- 🎧 map vận tốc góc -> whoosh gain/rate ---
      const dt    = Math.max(1, now - prevTime) / 1000; // s
      const dA    = Math.abs(rotation - prevRot);       // rad
      const omega = dA / dt;                            // rad/s
      const s     = Math.max(0, Math.min(1, omega / 18)); // chuẩn hoá 0..1 (chỉnh ngưỡng tùy cảm giác)
      audio.updateWhoosh({ gain: 0.20 + 0.40*s, rate: 0.9 + 0.5*s });

      prevTime = now;
      prevRot  = rotation;

      // --- 🎧 tick khi qua ranh lát (kim tại -90°) ---
      const phase     = (-rotation - Math.PI/2) / sliceAngle;
      const currFloor = Math.floor(phase);
      const crossings = currFloor - prevPhaseFloor; // số ranh đã vượt trong frame
      if (crossings !== 0) {
        const nowMs = now;
        const times = Math.min(3, Math.abs(crossings)); // phát bù tối đa 3 tick/frame
        for (let i = 0; i < times; i++) {
          if (nowMs - lastTickAt >= TICK_GAP_MS) {
            audio.playTick();
            lastTickAt = nowMs;
          }
        }
        prevPhaseFloor = currFloor;
      }

      if (t < 1) requestAnimationFrame(frame);
      else {
        audio.stopWhooshSmooth();  // fade-out whoosh khi dừng
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/** Easing cubic-out (mượt ở cuối) */
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

/* ============================================================
 * 🎨 HELPERS — VẼ & MÀU SẮC
 * ============================================================ */
/** Vẽ vòng tròn vành (rOuter) trừ lỗ rInner (dạng donut) */
function ring(ctx, x, y, rInner, rOuter, fill) {
  ctx.beginPath();
  ctx.arc(x, y, rOuter, 0, 2*Math.PI);
  ctx.arc(x, y, rInner, 0, 2*Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Gradient vàng kim loại cho rim (độ sâu thị giác) */
function goldGradient(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0.00, '#6d5415');
  g.addColorStop(0.15, '#b08b2b');
  g.addColorStop(0.32, '#f6d676');
  g.addColorStop(0.50, '#caa43d');
  g.addColorStop(0.68, '#f6e08f');
  g.addColorStop(0.85, '#a27f25');
  g.addColorStop(1.00, '#6d5415');
  return g;
}

/** Gradient chrome cho hubcap (mâm) */
function chromeGradient(ctx, r) {
  const g = ctx.createRadialGradient(0, 0, r*0.2, 0, 0, r);
  g.addColorStop(0,   '#ffffff');
  g.addColorStop(0.3, '#d9d9d9');
  g.addColorStop(0.6, '#9f9f9f');
  g.addColorStop(1,   '#eaeaea');
  return g;
}

/** Chọn màu lát từ palette nhẹ nhàng (10 màu) */
function sliceColor(i) {
  const palette = [
    '#f7c56c','#66d2c3','#f27aa7','#7fb0ff','#f39e8b',
    '#8fe089','#cba7ff','#8dd7f3','#f7b4d9','#f4dd82'
  ];
  return palette[i % palette.length];
}

/** Làm sáng/tối màu HEX */
function lighten(hex, amt=0.15) { return shade(hex, +amt); }
function darken (hex, amt=0.15) { return shade(hex, -amt); }
function shade(hex, amt) {
  let c = hex.replace('#','');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  let r = (num >> 16)       + Math.round(255 * amt);
  let g = (num >>  8 & 255) + Math.round(255 * amt);
  let b = (num       & 255) + Math.round(255 * amt);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (1<<24 | r<<16 | g<<8 | b).toString(16).slice(1);
}

/**
 * 🎨 Vẽ chữ theo bán kính, tự bọc dòng trong maxWidth
 * - Dịch tâm vẽ ra r (chừa 10px biên), căn giữa theo trục bán kính
 */
function wrapText(ctx, text, r, maxWidth, lineHeight) {
  const words = (text || '').split(' ');
  let line = '';
  const lines = [];

  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  ctx.save();
  ctx.translate(r - 10, 0);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
        lines[i],
        0,
        -((lines.length - 1) * lineHeight) / 2 + i * lineHeight
    );
  }
  ctx.restore();
}
