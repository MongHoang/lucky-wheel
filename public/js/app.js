// ====== Setup ======
const wrap = document.querySelector('.wheel-wrap');
const wheelCanvas = document.getElementById('wheel');
const fxCanvas    = document.getElementById('fx');
const ctxWheel = wheelCanvas.getContext('2d');
const ctxFx    = fxCanvas.getContext('2d');

const spinBtn  = document.getElementById('spinBtn');
const statusEl = document.getElementById('status');

let slices = [];
let rotation = 0;          // radian
let N = 0;
let sliceAngle = 0;

// HiDPI resize => ảnh sắc nét
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

  drawFx();          // highlight/pointer (đứng yên)
  drawWheel(rotation);
}

init();
window.addEventListener('resize', () => {
  // giữ nguyên rotation hiện tại khi responsive
  resize();
});

// ====== Init ======
async function init(){
  const data = await fetch('/api/wheel').then(r => r.json());
  slices = data.slices || [];
  N = Math.max(1, slices.length || 10);
  sliceAngle = (2*Math.PI)/N;

  resize();
  statusEl.textContent = 'Sẵn sàng';
}

// ====== Interaction ======
spinBtn.addEventListener('click', async () => {
  if (spinBtn.disabled) return;
  spinBtn.disabled = true;
  statusEl.textContent = 'Đang quay...';

  try{
    const res = await fetch('/api/spin', { method:'POST' }).then(r=>r.json());
    if (res.error) throw new Error(res.error);

    const targetIndex = res.index;
    const label       = res.label;

    // Tính góc tâm lát trúng (radian)
    const targetCenterAngle = targetIndex * sliceAngle + sliceAngle/2;

    // khiến tâm lát trúng đi lên "đỉnh" (kim ở -90°)
    let targetRotation = -Math.PI/2 - targetCenterAngle;

    // quay thêm nhiều vòng cho đã mắt (>= 4π từ góc hiện tại)
    while (targetRotation <= rotation + 4*Math.PI) targetRotation += 2*Math.PI;

    await animateTo(targetRotation, 2300); // ease-out
    statusEl.textContent = `Kết quả: ${label}`;
  }catch(e){
    console.error(e);
    statusEl.textContent = 'Có lỗi, thử lại sau.';
  }finally{
    spinBtn.disabled = false;
  }
});

// ====== Drawing (WHEEL LAYER - QUAY) ======
function drawWheel(rot){
  const { width, height } = wrap.getBoundingClientRect();
  const cx = width/2, cy = height/2;
  const rOuter = Math.min(width, height)/2;

  const rim = 18;          // bề rộng vành vàng ngoài
  const bevel = 8;         // rãnh bevel trong
  const rWheel = rOuter - 6;     // dùng 6px làm lề
  const rRimOuter = rWheel;
  const rRimInner = rWheel - rim;
  const rSlices   = rRimInner - 2;  // mặt lát
  const rHubOuter = Math.max(42, rSlices*0.20);
  const rHubInner = rHubOuter*0.55;

  const ctx = ctxWheel;
  ctx.clearRect(0,0,width,height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  // --- Rim vàng (gradient kim loại) ---
  // vòng ngoài
  ring(ctx, 0, 0, rRimInner, rRimOuter, goldGradient(ctx, -rRimOuter, -rRimOuter, rRimOuter*2, rRimOuter*2));
  // rãnh tối mảnh sát trong (bevel)
  ring(ctx, 0, 0, rRimInner - bevel, rRimInner, '#8c6e24');

  // --- Lát với radial gradient (sáng ở tâm, tối dần ra rìa) ---
  for (let i=0;i<N;i++){
    const start = i*sliceAngle;
    const end   = start + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0, rSlices, start, end);
    ctx.closePath();

    const base = sliceColor(i);
    const grad = ctx.createRadialGradient(0,0, rSlices*0.10, 0,0, rSlices);
    grad.addColorStop(0, lighten(base, 0.18));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, darken(base, 0.12));
    ctx.fillStyle = grad;
    ctx.fill();

    // viền lát mảnh cho sắc nét
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // nhãn
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

  // --- Hubcap (mâm) 3 vòng: sáng–tối–sáng ---
  ring(ctx, 0, 0, rHubInner*0.9, rHubOuter, chromeGradient(ctx, rHubOuter));
  ring(ctx, 0, 0, rHubInner*0.6, rHubInner*0.9, '#b7b7b7');
  ring(ctx, 0, 0, 0, rHubInner*0.6, chromeGradient(ctx, rHubInner*0.8));

  ctx.restore();
}

// ====== Drawing (FX LAYER - ĐỨNG YÊN) ======
function drawFx(){
  const { width, height } = wrap.getBoundingClientRect();
  const cx = width/2, cy = height/2;
  const r  = Math.min(width, height)/2;

  const ctx = ctxFx;
  ctx.clearRect(0,0,width,height);

  // Specular highlight lệch tâm (mảng sáng trắng mờ)
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

  // Pointer cố định ở đỉnh
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

// ====== Animate ======
function animateTo(target, durationMs){
  return new Promise(resolve=>{
    const startRot = rotation;
    const delta    = target - startRot;
    const startT   = performance.now();

    function frame(now){
      const t = Math.min(1, (now - startT) / durationMs);
      const eased = easeOutCubic(t);

      rotation = startRot + delta * eased;
      drawWheel(rotation);

      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

// ====== Helpers: shapes & color ======
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
  // bảng 10 màu nhẹ nhàng (có thể thay)
  const palette = ['#f7c56c','#66d2c3','#f27aa7','#7fb0ff','#f39e8b',
    '#8fe089','#cba7ff','#8dd7f3','#f7b4d9','#f4dd82'];
  return palette[i % palette.length];
}

function lighten(hex, amt=0.15){ return shade(hex, +amt); }
function darken(hex, amt=0.15){ return shade(hex, -amt); }
function shade(hex, amt){
  let c = hex.replace('#','');
  if (c.length===3) c = c.split('').map(x=>x+x).join('');
  const num = parseInt(c,16);
  let r = (num>>16) + Math.round(255*amt);
  let g = (num>>8 & 0xff) + Math.round(255*amt);
  let b = (num & 0xff) + Math.round(255*amt);
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
    if (ctx.measureText(test).width > maxWidth){ if(line) lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  ctx.save(); ctx.translate(r - 10, 0);
  for (let i=0;i<lines.length;i++){
    ctx.fillText(lines[i], 0, -((lines.length-1)*lineHeight)/2 + i*lineHeight);
  }
  ctx.restore();
}
