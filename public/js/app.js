/* ============================================================
 *  VÒNG XOAY — JS THUẦN + 2 CANVAS + AUDIO (whoosh/tick)
 *  FLOW: vào trang "Lượt còn: 1"; bấm Quay => nếu chưa đăng ký -> mở modal
 *        đăng ký xong mới được quay; quay xong => lượt về 0 (khóa nút)
 *  (Không jingle, không mute phím M)
 * ============================================================ */

/* -------------------------------
   DOM & STATE
---------------------------------*/
const wrap        = document.querySelector('.wheel-wrap');
const wheelCanvas = document.getElementById('wheel');
const fxCanvas    = document.getElementById('fx');
const ctxWheel    = wheelCanvas.getContext('2d');
const ctxFx       = fxCanvas.getContext('2d');

const spinBtn     = document.getElementById('spinBtn');
const statusEl    = document.getElementById('status');
const spinsEl     = document.getElementById('spins');
const greetingEl  = document.getElementById('greeting');

// Modal đăng ký
const regModal  = document.getElementById('regModal');
const regForm   = document.getElementById('regForm');
const regNameEl = document.getElementById('regName');
const regPhoneEl= document.getElementById('regPhone');
const regCancel = document.getElementById('regCancel');

let slices = [];
let rotation = 0;
let N = 0;
let sliceAngle = 0;

// Lượt quay & đăng ký (demo = localStorage)
const LS_SPINS = 'lw_spins';      // số lượt còn lại (int)
const LS_USER  = 'lw_user';       // thông tin user {name, phone, registeredAt}

let spinsRemaining = null;
let user = null; // {name, phone, registeredAt}

/* ============================================================
 * 🎧 AUDIO — whoosh loop + tick
 * ============================================================ */
function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = 1.0; master.connect(ctx.destination);
  const whooshGain = ctx.createGain(); whooshGain.gain.value = 0; whooshGain.connect(master);
  const tickGain   = ctx.createGain(); tickGain.gain.value   = 0.9; tickGain.connect(master);

  const buffers = { whoosh: null, tick: null };
  let whooshSrc = null;

  async function loadBuffer(url){
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  }
  async function loadAll(){
    buffers.whoosh = await loadBuffer('/sfx/whoosh.loop.wav');
    buffers.tick   = await loadBuffer('/sfx/tick.wav');
  }
  async function resumeIfNeeded(){ if (ctx.state === 'suspended') await ctx.resume(); }

  function startWhoosh(){
    if (!buffers.whoosh) return;
    stopWhooshImmediate();
    whooshSrc = ctx.createBufferSource();
    whooshSrc.buffer = buffers.whoosh;
    whooshSrc.loop = true;
    whooshSrc.playbackRate.value = 0.9;
    whooshSrc.connect(whooshGain);
    const now = ctx.currentTime;
    whooshGain.gain.cancelScheduledValues(now);
    whooshGain.gain.setValueAtTime(whooshGain.gain.value, now);
    whooshGain.gain.linearRampToValueAtTime(0.35, now + 0.18);
    whooshSrc.start();
  }
  function updateWhoosh({gain, rate}){
    if (!whooshSrc) return;
    const now = ctx.currentTime;
    whooshGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(0.6, gain)), now + 0.08);
    try { whooshSrc.playbackRate.setTargetAtTime(Math.max(0.7, Math.min(1.6, rate)), now, 0.06); } catch(e){}
  }
  function stopWhooshSmooth(){
    if (!whooshSrc) return;
    const src = whooshSrc; whooshSrc = null;
    const now = ctx.currentTime;
    whooshGain.gain.cancelScheduledValues(now);
    whooshGain.gain.setValueAtTime(whooshGain.gain.value, now);
    whooshGain.gain.linearRampToValueAtTime(0.0, now + 0.22);
    try { src.stop(now + 0.25); } catch(e){}
  }
  function stopWhooshImmediate(){
    if (!whooshSrc) return;
    try { whooshSrc.stop(); } catch(e){}
    whooshSrc = null;
  }
  function playTick(){
    if (!buffers.tick) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers.tick;
    src.playbackRate.value = 0.975 + Math.random()*0.05;
    src.connect(tickGain);
    src.start();
  }

  return { loadAll, resumeIfNeeded, startWhoosh, updateWhoosh, stopWhooshSmooth, playTick };
}
const audio = createAudio();

/* ============================================================
 * 🔐 ĐĂNG KÝ — localStorage (demo)
 * ============================================================ */
/** Đọc user từ localStorage */
function loadUser(){
  try { return JSON.parse(localStorage.getItem(LS_USER) || 'null'); }
  catch { return null; }
}
/** Ghi user vào localStorage */
function saveUser(u){
  user = u;
  localStorage.setItem(LS_USER, JSON.stringify(u));
  updateGreetingUI();
}
/** Có đăng ký chưa? */
function isRegistered(){ return !!(user && user.name && user.phone); }
/** Cập nhật greeting UI */
function updateGreetingUI(){
  if (isRegistered()) greetingEl.textContent = `Xin chào, ${user.name}!`;
  else greetingEl.textContent = 'Chưa đăng ký';
}

/** Mở/đóng modal đăng ký */
function openRegModal(){
  regModal.classList.remove('hidden');
  regModal.setAttribute('aria-hidden', 'false');
  regNameEl.focus();
}
function closeRegModal(){
  regModal.classList.add('hidden');
  regModal.setAttribute('aria-hidden', 'true');
}

/* ============================================================
 * 🔢 LƯỢT QUAY
 * ============================================================ */
/** Khởi tạo lượt: lần đầu vào => 1; quay xong => 0; lưu localStorage */
function initSpinsLocal(){
  const raw = localStorage.getItem(LS_SPINS);
  if (raw == null){
    spinsRemaining = 1; // theo yêu cầu: vào là 1
    localStorage.setItem(LS_SPINS, String(spinsRemaining));
  } else {
    const n = Number(raw);
    spinsRemaining = Number.isFinite(n) ? n : 1;
  }
  updateSpinsUI();
}
/** Cập nhật UI & khoá nút nếu hết */
function updateSpinsUI(){
  spinsEl.textContent = `Lượt còn: ${spinsRemaining ?? '—'}`;
  if (spinsRemaining === 0) spinBtn.disabled = true;
}

/* ============================================================
 * 🎨 HIỂN THỊ — Resize HiDPI
 * ============================================================ */
function resize(){
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  for (const c of [wheelCanvas, fxCanvas]){
    c.width  = Math.floor(rect.width * dpr);
    c.height = Math.floor(rect.height * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
  }
  drawFx();          // highlight/pointer đứng yên
  drawWheel(rotation);
}

/* ============================================================
 * 🚀 KHỞI TẠO
 * ============================================================ */
async function init(){
  audio.loadAll().catch(()=>{});
  user = loadUser();

  const data = await fetch('/api/wheel').then(r=>r.json());
  slices = data.slices || [];
  N = Math.max(1, slices.length || 10);
  sliceAngle = (2*Math.PI)/N;

  initSpinsLocal();
  updateGreetingUI();

  resize();
  statusEl.textContent = 'Sẵn sàng';
}
init();
window.addEventListener('resize', resize);

/* ============================================================
 * 🖱️ TƯƠNG TÁC — QUAY
 * ============================================================ */
spinBtn.addEventListener('click', async () => {
  // Bắt buộc đăng ký trước khi quay
  if (!isRegistered()){
    statusEl.textContent = 'Vui lòng đăng ký để quay.';
    openRegModal();
    return;
  }
  if (spinsRemaining === 0){
    statusEl.textContent = 'Bạn đã hết lượt.';
    return;
  }

  spinBtn.disabled = true;
  statusEl.textContent = 'Đang quay...';

  try{
    await audio.resumeIfNeeded();
    audio.startWhoosh();

    // Gọi BE lấy kết quả (giữ nguyên endpoint)
    const res = await fetch('/api/spin', { method:'POST' }).then(r=>r.json());
    if (res.error) throw new Error(res.error);

    const targetIndex = res.index;
    const label       = res.label;

    // Góc tâm lát trúng, đưa lên đỉnh (-90°)
    const targetCenterAngle = targetIndex * sliceAngle + sliceAngle/2;
    let targetRotation = -Math.PI/2 - targetCenterAngle;
    while (targetRotation <= rotation + 4*Math.PI) targetRotation += 2*Math.PI;

    await animateTo(targetRotation, 2300);
    statusEl.textContent = `Kết quả: ${label}`;

    // Sau khi quay xong => lượt về 0
    spinsRemaining = 0;
    localStorage.setItem(LS_SPINS, '0');
    updateSpinsUI();
  }catch(e){
    console.error(e);
    statusEl.textContent = 'Có lỗi, thử lại sau.';
  }finally{
    if (spinsRemaining !== 0) spinBtn.disabled = false;
  }
});

/* ===== Modal form submit ===== */
regForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name  = regNameEl.value.trim();
  const phone = regPhoneEl.value.trim();

  if (!name || !phone){
    alert('Vui lòng nhập đủ Họ tên và Số điện thoại.');
    return;
  }

  // 👉 Nếu có BE: gọi /api/register ở đây
  // const ok = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, phone }) }).then(r=>r.ok);
  // if (!ok) { alert('Đăng ký thất bại, thử lại.'); return; }

  // Demo FE: lưu localStorage
  saveUser({ name, phone, registeredAt: Date.now() });

  closeRegModal();
  statusEl.textContent = 'Đăng ký thành công! Bạn có thể quay ngay.';
});
regCancel.addEventListener('click', ()=>{
  // Bắt buộc đăng ký; nhưng vẫn cho đóng modal nếu cần
  closeRegModal();
});

/* ============================================================
 * 🎨 VẼ LỚP QUAY (#wheel)
 * ============================================================ */
function drawWheel(rot){
  const { width, height } = wrap.getBoundingClientRect();
  const cx = width/2, cy = height/2;
  const rOuter = Math.min(width, height)/2;

  const rim = 18, bevel = 8;
  const rWheel  = rOuter - 6;
  const rRimOut = rWheel;
  const rRimIn  = rWheel - rim;
  const rSlices = rRimIn - 2;
  const rHubOut = Math.max(42, rSlices*0.20);
  const rHubIn  = rHubOut*0.55;

  const ctx = ctxWheel;
  ctx.clearRect(0,0,width,height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  ring(ctx, 0,0, rRimIn, rRimOut, goldGradient(ctx, -rRimOut, -rRimOut, rRimOut*2, rRimOut*2));
  ring(ctx, 0,0, rRimIn - bevel, rRimIn, '#8c6e24');

  for (let i=0;i<N;i++){
    const start = i*sliceAngle;
    const end   = start + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0, rSlices, start, end);
    ctx.closePath();

    const base = sliceColor(i);
    const grad = ctx.createRadialGradient(0,0, rSlices*0.10, 0,0, rSlices);
    grad.addColorStop(0,   lighten(base, 0.18));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1,   darken(base, 0.12));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    const mid = start + sliceAngle/2;
    ctx.rotate(mid);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px system-ui';
    wrapText(ctx, slices[i]?.label ?? `Lát ${i+1}`, rSlices*0.65, 86, 16);
    ctx.restore();
  }

  ring(ctx, 0,0, rHubIn*0.9, rHubOut,      chromeGradient(ctx, rHubOut));
  ring(ctx, 0,0, rHubIn*0.6, rHubIn*0.9,   '#b7b7b7');
  ring(ctx, 0,0, 0,          rHubIn*0.6,   chromeGradient(ctx, rHubIn*0.8));

  ctx.restore();
}

/* ============================================================
 * 🎨 VẼ LỚP FX ĐỨNG YÊN (#fx)
 * ============================================================ */
function drawFx(){
  const { width, height } = wrap.getBoundingClientRect();
  const cx = width/2, cy = height/2;
  const r  = Math.min(width, height)/2;

  const ctx = ctxFx;
  ctx.clearRect(0,0,width,height);

  const radial = ctx.createRadialGradient(cx - r*0.25, cy - r*0.30, r*0.05, cx - r*0.20, cy - r*0.35, r*0.85);
  radial.addColorStop(0, 'rgba(255,255,255,0.25)');
  radial.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = radial;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.96, 0, 2*Math.PI); ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy - r*0.35, r*0.85, r*0.25, 0, 0, Math.PI, true);
  ctx.closePath();
  const sheen = ctx.createLinearGradient(cx, cy - r*0.6, cx, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0.40)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen; ctx.fill();

  const pTopY = cy - r + 6;
  ctx.beginPath();
  ctx.moveTo(cx, pTopY);
  ctx.lineTo(cx - 16, pTopY + 34);
  ctx.lineTo(cx + 16, pTopY + 34);
  ctx.closePath();
  const pointerGrad = ctx.createLinearGradient(cx, pTopY, cx, pTopY+34);
  pointerGrad.addColorStop(0, '#f6d676');
  pointerGrad.addColorStop(1, '#c4962a');
  ctx.fillStyle = pointerGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a6f1f';
  ctx.stroke();
}

/* ============================================================
 * 🧭 ANIMATE VỀ GÓC MỤC TIÊU (tick + whoosh)
 * ============================================================ */
function animateTo(target, durationMs){
  return new Promise(resolve=>{
    const startRot = rotation;
    const delta    = target - startRot;
    const startT   = performance.now();

    let prevPhaseFloor = Math.floor(( -rotation - Math.PI/2 ) / sliceAngle);
    let lastTickAt = 0; const TICK_GAP_MS = 70;

    let prevTime = startT;
    let prevRot  = startRot;

    function frame(now){
      const t     = Math.min(1, (now - startT) / durationMs);
      const eased = easeOutCubic(t);

      rotation = startRot + delta * eased;
      drawWheel(rotation);

      // whoosh theo vận tốc góc
      const dt    = Math.max(1, now - prevTime) / 1000;
      const dA    = Math.abs(rotation - prevRot);
      const omega = dA / dt;
      const s     = Math.max(0, Math.min(1, omega / 18));
      audio.updateWhoosh({ gain: 0.20 + 0.40*s, rate: 0.9 + 0.5*s });

      prevTime = now; prevRot = rotation;

      // tick qua ranh lát (kim tại -90°)
      const phase     = (-rotation - Math.PI/2) / sliceAngle;
      const currFloor = Math.floor(phase);
      const crossings = currFloor - prevPhaseFloor;
      if (crossings !== 0){
        const nowMs = now;
        const times = Math.min(3, Math.abs(crossings));
        for (let i=0;i<times;i++){
          if (nowMs - lastTickAt >= TICK_GAP_MS){
            audio.playTick();
            lastTickAt = nowMs;
          }
        }
        prevPhaseFloor = currFloor;
      }

      if (t < 1) requestAnimationFrame(frame);
      else { audio.stopWhooshSmooth(); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

/* ============================================================
 * 🎨 HELPERS — Vẽ & Màu
 * ============================================================ */
function ring(ctx, x, y, rInner, rOuter, fill){
  ctx.beginPath();
  ctx.arc(x, y, rOuter, 0, 2*Math.PI);
  ctx.arc(x, y, rInner, 0, 2*Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function goldGradient(ctx, x, y, w, h){
  const g = ctx.createLinearGradient(x, y, x+w, y+h);
  g.addColorStop(0.00, '#6d5415');
  g.addColorStop(0.15, '#b08b2b');
  g.addColorStop(0.32, '#f6d676');
  g.addColorStop(0.50, '#caa43d');
  g.addColorStop(0.68, '#f6e08f');
  g.addColorStop(0.85, '#a27f25');
  g.addColorStop(1.00, '#6d5415');
  return g;
}
function chromeGradient(ctx, r){
  const g = ctx.createRadialGradient(0,0, r*0.2, 0,0, r);
  g.addColorStop(0,   '#ffffff');
  g.addColorStop(0.3, '#d9d9d9');
  g.addColorStop(0.6, '#9f9f9f');
  g.addColorStop(1,   '#eaeaea');
  return g;
}
function sliceColor(i){
  const palette = ['#f7c56c','#66d2c3','#f27aa7','#7fb0ff','#f39e8b',
    '#8fe089','#cba7ff','#8dd7f3','#f7b4d9','#f4dd82'];
  return palette[i % palette.length];
}
function lighten(hex, amt=0.15){ return shade(hex, +amt); }
function darken (hex, amt=0.15){ return shade(hex, -amt); }
function shade(hex, amt){
  let c = hex.replace('#','');
  if (c.length===3) c = c.split('').map(x=>x+x).join('');
  const num = parseInt(c,16);
  let r = (num>>16)       + Math.round(255*amt);
  let g = (num>>8 & 255)  + Math.round(255*amt);
  let b = (num     & 255) + Math.round(255*amt);
  r = Math.max(0,Math.min(255,r));
  g = Math.max(0,Math.min(255,g));
  b = Math.max(0,Math.min(255,b));
  return '#' + (1<<24 | r<<16 | g<<8 | b).toString(16).slice(1);
}
function wrapText(ctx, text, r, maxWidth, lineHeight){
  const words = (text||'').split(' ');
  let line = ''; const lines = [];
  for (const w of words){
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth){ if (line) lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  ctx.save(); ctx.translate(r - 10, 0);
  for (let i=0;i<lines.length;i++){
    ctx.fillText(lines[i], 0, -((lines.length-1)*lineHeight)/2 + i*lineHeight);
  }
  ctx.restore();
}
