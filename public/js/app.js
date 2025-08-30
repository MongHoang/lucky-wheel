/* Lucky Wheel 3D — Responsive */
(() => {
  // ====== NÚM VẶN CHÍNH ======
  const SPIN_TOTAL_MS = 13000;
  const EXTRA_TURNS   = 6;
  const EASE_POWER    = 2.4;
  const POINTER_ANGLE = Math.PI/2;

  // Đèn viền
  const BULB_COUNT=28;
  const BLINK_MS=520;

  // Tối ưu khi quay
  const BLINK_DURING_SPIN = false;
  const REDUCE_SHADOWS_WHILE_SPIN = true;

  // Text (đẩy ra ngoài + khoá ngang + chống tràn)
  const TEXT_RADIAL = 0.7;          // 0=tâm, 1=sát viền. Tăng 0.66/0.68 nếu muốn ra ngoài nữa
  const TEXT_MAX_W_RATIO = 0.48;     // bề rộng tối đa cho wrap
  const TEXT_LINE_H = 1.08;
  const TEXT_STROKE_SCALE = 0.14;
  const TEXT_DYNAMIC_COLOR = true;

  const TEXT_LOCK_HORIZONTAL = false; // KHÔNG xoay chữ theo bánh khi quay
  const TEXT_OUTER_MARGIN_PX = 26;   // cách viền ngoài (px)
  const TEXT_FADE_WHILE_SPIN = 0.95; // mờ nhẹ khi quay (1 = không mờ)

  // Khe giữa lát (cho cảm giác tách lát, tránh chữ dính vạch)
  const SLICE_GAP_RATIO = 0.035;

  // Liên hệ
  const ZALO_URL='https://zalo.me/0974123724';
  const MESSENGER_URL='https://m.me/kin.quang';

  // API & LS
  const LS_USER='lw_user', LS_SPINS='lw_spins', LS_SHARED='lw_shared_awarded';
  const API_WHEEL='/api/wheel', API_SPIN='/api/spin';
  const API_NOTIFY='/api/notify-win';
  const SHARE_TARGET_URL='https://example.com/your-post';

  // ===== DOM =====
  const cvsBg=document.getElementById('bg');
  const cvsWheel=document.getElementById('wheel');
  const cvsFx=document.getElementById('fx');
  const spinBtn=document.getElementById('spinBtn');
  const shareBtn=document.getElementById('shareBtn');
  const devPanel=document.getElementById('devPanel');
  const elGreeting=document.getElementById('greeting');
  const elSpins=document.getElementById('spins');
  const elStatus=document.getElementById('status');
  const elOnline=document.getElementById('online');
  const regModal=document.getElementById('regModal');
  const regForm=document.getElementById('regForm');
  const regCancel=document.getElementById('regCancel');
  const regNameInp=document.getElementById('regName');
  const regPhoneInp=document.getElementById('regPhone');
  const regProvinceSel=document.getElementById('regProvince');
  const winModal=document.getElementById('winModal');
  const winText=document.getElementById('winText');
  const winOk=document.getElementById('winOk');
  const fabZalo=document.getElementById('fabZalo');
  const fabMess=document.getElementById('fabMess');
  const tickerTrack=document.getElementById('tickerTrack');

  const wheelWrap = document.querySelector('.wheel-wrap');
  const wheelCard = document.querySelector('.wheel-card');

  // ===== Canvas =====
  const dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
  const ctxBg=cvsBg.getContext('2d');
  const ctxWheel=cvsWheel.getContext('2d');
  const ctxFx=cvsFx.getContext('2d');

  // ===== State =====
  let segments=[], rotation=0, isSpinning=false, spins=0;
  let audioCtx=null, tickBuf=null, applauseBuf=null;
  let animId=null;

  // ===== Utils =====
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TAU=Math.PI*2;
  const modTau=a=>((a%TAU)+TAU)%TAU;
  const easeOut = t => 1 - Math.pow(1 - t, EASE_POWER);
  const q=new URLSearchParams(location.search);
  const DEV_MODE=q.has('dev'); const DEV_SPINS=q.get('spins')?parseInt(q.get('spins'),10):null;

  const PALETTE = ['#FF8A80','#9CC7FF','#B7E27A','#FFB285','#CFA9FF','#8ED1FF','#FFD166','#EF476F'];
  const normalizeHex = (h) => {
    if (!h) return null;
    h = String(h).trim();
    if (!h) return null;
    if (!h.startsWith('#')) h = '#' + h;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return h;
    return null;
  };
  const getSliceColor = (i) => normalizeHex(segments[i]?.color) || PALETTE[i % PALETTE.length];
  const hexToRgb = (h)=>{ h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; };
  const brightness = ({r,g,b}) => 0.299*r + 0.587*g + 0.114*b;

  const VN_PROVINCES=[ "An Giang","Bà Rịa - Vũng Tàu","Bắc Giang","Bắc Kạn","Bạc Liêu","Bắc Ninh","Bến Tre","Bình Định","Bình Dương",
    "Bình Phước","Bình Thuận","Cà Mau","Cần Thơ","Cao Bằng","Đà Nẵng","Đắk Lắk","Đắk Nông","Điện Biên","Đồng Nai",
    "Đồng Tháp","Gia Lai","Hà Giang","Hà Nam","Hà Nội","Hà Tĩnh","Hải Dương","Hải Phòng","Hậu Giang","Hòa Bình",
    "Hưng Yên","Khánh Hòa","Kiên Giang","Kon Tum","Lai Châu","Lâm Đồng","Lạng Sơn","Lào Cai","Long An","Nam Định",
    "Nghệ An","Ninh Bình","Ninh Thuận","Phú Thọ","Phú Yên","Quảng Bình","Quảng Nam","Quảng Ngãi","Quảng Ninh",
    "Quảng Trị","Sóc Trăng","Sơn La","Tây Ninh","Thái Bình","Thái Nguyên","Thanh Hóa","Thừa Thiên Huế","Tiền Giang",
    "TP. Hồ Chí Minh","Trà Vinh","Tuyên Quang","Vĩnh Long","Vĩnh Phúc","Yên Bái" ];

  const loadUser=()=>{try{const r=localStorage.getItem(LS_USER);return r?JSON.parse(r):null;}catch{return null}};
  const saveUser=u=>localStorage.setItem(LS_USER,JSON.stringify(u));
  const loadSpins=()=>{const v=parseInt(localStorage.getItem(LS_SPINS)||'NaN',10);return Number.isFinite(v)?v:null};
  const saveSpins=v=>localStorage.setItem(LS_SPINS,String(v));
  const loadSharedAwarded=()=>localStorage.getItem(LS_SHARED)==='1';
  const saveSharedAwarded=v=>localStorage.setItem(LS_SHARED, v?'1':'0');

  function updateGreeting(){const u=loadUser(); elGreeting.textContent=u?`Xin chào, ${u.name}!`:'Chưa đăng ký';}
  function updateSpinsUI(){elSpins.textContent=`Lượt còn: ${spins}`; spinBtn.disabled=isSpinning||spins<=0;}
  const setStatus=msg=>elStatus.textContent=msg;

  const openModal=()=>{regModal.classList.remove('hidden'); regNameInp.focus({preventScroll:true});}
  const closeModal=()=>regModal.classList.add('hidden');

  // ===== Confetti + Win modal =====
  function launchConfetti(ms=3400, count=240){
    const c=document.createElement('canvas'); c.className='confetti-layer'; document.body.appendChild(c);
    const ctx=c.getContext('2d'); const scale=Math.max(1, window.devicePixelRatio||1);
    function size(){ c.width=innerWidth*scale; c.height=innerHeight*scale; c.style.width=innerWidth+'px'; c.style.height=innerHeight+'px'; }
    size(); window.addEventListener('resize', size, {once:true});
    const colors=['#FFD166','#F4978E','#9CDBFF','#B5D99C','#FF4D6D','#F8ED62'];
    const pcs=Array.from({length:count},()=>({x:(innerWidth*scale)/2,y:-20*scale,vx:(Math.random()*2-1)*(4.8*scale),vy:(4+Math.random()*6)*scale*(-1),rot:Math.random()*Math.PI,vr:(Math.random()-0.5)*0.25,s:(6+Math.random()*10)*scale,color:colors[(Math.random()*colors.length)|0],tri:Math.random()<0.5}));
    const g=0.12*scale, air=0.996, t0=performance.now();
    (function f(now){ const t=now-t0; ctx.clearRect(0,0,c.width,c.height);
      for(const p of pcs){ p.vx*=air; p.vy=p.vy*air+g; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.color;
        if(p.tri){ ctx.beginPath(); ctx.moveTo(-p.s/2,p.s/2); ctx.lineTo(0,-p.s/2); ctx.lineTo(p.s/2,p.s/2); ctx.closePath(); ctx.fill(); }
        else ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*0.66); ctx.restore(); }
      if(t<ms) requestAnimationFrame(f); else c.remove(); })(t0);
  }
  function openWinModal(text){ winText.textContent = text || 'Bạn trúng thưởng!'; winModal.classList.remove('hidden'); launchConfetti(3600, 260); playApplause(); }
  function closeWinModal(){ winModal.classList.add('hidden'); }

  async function ensureAudioCtx(){ if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext; if(AC) audioCtx=new AC();} if(audioCtx&&audioCtx.state==='suspended'){try{await audioCtx.resume()}catch{}}}
  async function loadBuffer(url){ try{const r=await fetch(url); if(!r.ok) throw 0; const arr=await r.arrayBuffer(); return await new Promise((res,rej)=>audioCtx.decodeAudioData(arr,res,rej)); }catch{return null}}
  async function initAudio(){ await ensureAudioCtx(); if(!audioCtx) return; if(!tickBuf) tickBuf=await loadBuffer('/sfx/tick.wav'); if(!applauseBuf) applauseBuf=await loadBuffer('/sfx/applause.wav'); }
  function playTick(){ if(!audioCtx||!tickBuf) return; const s=audioCtx.createBufferSource(); s.buffer=tickBuf; s.connect(audioCtx.destination); try{s.start()}catch{} }
  function playApplause(){ if(!audioCtx||!applauseBuf) return; const s=audioCtx.createBufferSource(); s.buffer=applauseBuf; s.connect(audioCtx.destination); try{s.start()}catch{} }

  // ===== Canvas sizing =====
  function resizeCanvas(){
    if (!wheelWrap) return;
    const rect = wheelWrap.getBoundingClientRect();
    const size = Math.floor(rect.width * dpr);
    if (size <= 0) return;
    for (const c of [cvsBg, cvsWheel, cvsFx]) {
      c.width = size; c.height = size;
      c.style.width = '100%'; c.style.height = '100%';
    }
    drawAll(true);
  }

  // === Fit wheel to viewport (desktop: bảo đảm thấy chân đế + nút share) ===
  function fitWheelToViewport() {
    if (!wheelCard || !wheelWrap) return;

    const hero   = document.querySelector('.hero');
    const ticker = document.querySelector('.ticker');

    const vh = window.innerHeight;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const isDesktop = vw >= 900;

    // Hero absolute trên desktop -> không trừ
    const heroAbs = hero && getComputedStyle(hero).position === 'absolute';
    const heroH   = (hero && !heroAbs) ? hero.getBoundingClientRect().height : 0;
    const tickerH = ticker ? ticker.getBoundingClientRect().height : 0;

    // Phần dưới bánh
    const actions = wheelCard.querySelector('.actions');
    const legal   = wheelCard.querySelector('.legal');
    const actionsH = actions ? Math.ceil(actions.getBoundingClientRect().height) : 0;
    const legalH   = legal   ? Math.ceil(legal.getBoundingClientRect().height)   : 0;

    // Padding card
    const cs = getComputedStyle(wheelCard);
    const padT = parseFloat(cs.paddingTop)    || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const padL = parseFloat(cs.paddingLeft)   || 0;
    const padR = parseFloat(cs.paddingRight)  || 0;

    // ======= NÚM VẶN DỄ NHỚ =======
    const DESKTOP_MAX_PX = 1080;     // chỉnh 1120/1100/1080/1060... để to/nhỏ tổng thể
    const MOBILE_MAX_PX  = 860;

    const TOP_SAFE  = isDesktop ? 8  : 8;   // khoảng trống phía trên
    const BOTTOM_SAFE_DESKTOP = 18;         // giữ chân đế & nút share
    const BOTTOM_SAFE_MOBILE  = 12;
    const BOTTOM_SAFE = isDesktop ? BOTTOM_SAFE_DESKTOP : BOTTOM_SAFE_MOBILE;

    // Chiều cao cho card
    const availableForCard = vh - heroH - tickerH - TOP_SAFE;

    // Trừ actions + legal để không bị cắt phía dưới
    let wheelSize = availableForCard - padT - padB - actionsH - legalH - BOTTOM_SAFE;

    // Giới hạn theo ngang + trần px
    wheelSize = Math.min(
        wheelSize,
        vw * (isDesktop ? 0.90 : 0.96),
        isDesktop ? DESKTOP_MAX_PX : MOBILE_MAX_PX
    );
    wheelSize = Math.max(320, wheelSize);

    // Card rộng hơn bánh một chút
    const cardW = Math.min(vw * 0.98, wheelSize + padL + padR + 8);
    wheelCard.style.width = cardW + 'px';
    wheelWrap.style.width = wheelSize + 'px';

    resizeCanvas();
  }

  // ===== Vẽ chữ nhiều dòng =====
  function drawWrappedLabel(ctx, text, x, y, maxWidth, lineHeight, fontPx, strokeScale=0.12){
    const t=String(text).toUpperCase();
    const words=t.split(/\s+/); let line=''; const lines=[];
    for(const w of words){const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxWidth && line){lines.push(line); line=w;} else line=test;}
    if(line) lines.push(line);
    const used=Math.min(lines.length,3); const startY=y-((used-1)*lineHeight)/2;
    ctx.lineJoin='round'; ctx.miterLimit=2;
    for(let i=0;i<used;i++){
      const yy=startY+i*lineHeight;
      ctx.lineWidth=Math.max(2*dpr, fontPx*strokeScale);
      ctx.strokeText(lines[i],x,yy);
      ctx.fillText(lines[i],x,yy);
    }
  }

  // ===== Vẽ bánh =====
  function drawWheel(){
    const w=cvsWheel.width,h=cvsWheel.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr;
    const rimWidth=18*dpr;
    const rFace=rOuter - rimWidth*0.8;
    const rHub=rFace*0.18;

    ctxWheel.clearRect(0,0,w,h);
    if(!segments.length) return;

    const n=segments.length, arc=TAU/n, gap=arc*SLICE_GAP_RATIO;

    // --- phần quay chung (viền + lát) ---
    ctxWheel.save();
    ctxWheel.translate(cx,cy);
    ctxWheel.rotate(rotation);

    // Viền vàng
    const rimGrad = ctxWheel.createLinearGradient(0,-rOuter,0,rOuter);
    rimGrad.addColorStop(0.00, '#FFF7CC'); rimGrad.addColorStop(0.30, '#FFD34D');
    rimGrad.addColorStop(0.60, '#E0A72A'); rimGrad.addColorStop(1.00, '#A87610');
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rOuter - rimWidth/2, 0, TAU);
    ctxWheel.strokeStyle = rimGrad; ctxWheel.lineWidth = rimWidth; ctxWheel.lineCap='round'; ctxWheel.stroke();

    // highlight
    const highlightWidth = rimWidth*0.38, highlightAngle = 0.23*Math.PI;
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rOuter - rimWidth/2, -highlightAngle, +highlightAngle);
    ctxWheel.strokeStyle='rgba(255,255,255,.68)'; ctxWheel.lineWidth=highlightWidth; ctxWheel.stroke();

    // Lát
    for(let i=0;i<n;i++){
      const a0=i*arc + gap/2, a1=(i+1)*arc - gap/2;

      ctxWheel.beginPath(); ctxWheel.moveTo(0,0); ctxWheel.arc(0,0,rFace,a0,a1); ctxWheel.closePath();
      ctxWheel.fillStyle = getSliceColor(i); ctxWheel.fill();

      // bevel sáng -> tối
      ctxWheel.save(); ctxWheel.clip();
      const bevel = ctxWheel.createLinearGradient(-rFace,0,rFace,0);
      bevel.addColorStop(0.00,'rgba(255,255,255,.16)');
      bevel.addColorStop(0.50,'rgba(255,255,255,0)');
      bevel.addColorStop(1.00,'rgba(0,0,0,.16)');
      ctxWheel.fillStyle = bevel; ctxWheel.fillRect(-rFace,-rFace,rFace*2,rFace*2);
      ctxWheel.restore();

      // viền trong
      ctxWheel.save(); ctxWheel.clip(); ctxWheel.beginPath(); ctxWheel.arc(0,0,rFace-2*dpr,0,TAU);
      ctxWheel.strokeStyle='rgba(255,255,255,.22)'; ctxWheel.lineWidth=6*dpr; ctxWheel.stroke(); ctxWheel.restore();

      // đường viền lát
      ctxWheel.beginPath(); ctxWheel.moveTo(0,0); ctxWheel.arc(0,0,rFace,a0,a1); ctxWheel.closePath();
      ctxWheel.lineWidth = 2*dpr; ctxWheel.strokeStyle = 'rgba(255,255,255,.82)'; ctxWheel.stroke();
    }

    // vignette
    ctxWheel.save(); ctxWheel.beginPath(); ctxWheel.arc(0,0,rFace,0,TAU); ctxWheel.clip();
    const shade = ctxWheel.createRadialGradient(0,0,rFace*0.10, 0,0,rFace);
    shade.addColorStop(0.00,'rgba(255,255,255,.18)'); shade.addColorStop(0.60,'rgba(255,255,255,0)'); shade.addColorStop(1.00,'rgba(0,0,0,.24)');
    ctxWheel.fillStyle = shade; ctxWheel.fillRect(-rFace,-rFace,rFace*2,rFace*2);
    ctxWheel.restore();

    ctxWheel.restore(); // <-- kết thúc phần quay chung

    // --- Vẽ CHỮ theo toạ độ MÀN HÌNH (khóa orientation) ---
    for (let i = 0; i < n; i++) {
      const mid = i*arc + arc/2;          // góc tâm lát (không quay)
      const aAbs = rotation + mid;        // góc tuyệt đối sau khi quay
      const rText = Math.min(rFace * TEXT_RADIAL, rFace - TEXT_OUTER_MARGIN_PX * dpr);

      const x = cx + Math.cos(aAbs) * rText;
      const y = cy + Math.sin(aAbs) * rText;

      ctxWheel.save();
      // reset transform để vẽ theo màn hình, không chịu ảnh hưởng của rotation
      ctxWheel.setTransform(1,0,0,1,0,0);
      ctxWheel.translate(x, y);
      if (!TEXT_LOCK_HORIZONTAL) {
        // nếu muốn chữ xoay theo bán kính: bật nhánh này
        ctxWheel.rotate(aAbs + Math.PI/2);
      }

      ctxWheel.textAlign='center';
      ctxWheel.textBaseline='middle';
      const fontPx = Math.round(Math.max(14*dpr, Math.min(22*dpr, rFace*0.072)));

      // màu chữ thích ứng nền lát
      let fillColor = '#fff', strokeColor = 'rgba(0,0,0,.68)';
      const rgb=hexToRgb(getSliceColor(i));
      if(TEXT_DYNAMIC_COLOR && brightness(rgb) > 185){ fillColor = '#1b2230'; strokeColor = 'rgba(255,255,255,.72)'; }
      ctxWheel.font=`800 ${fontPx}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      ctxWheel.fillStyle = fillColor; ctxWheel.strokeStyle = strokeColor;

      if (isSpinning && TEXT_FADE_WHILE_SPIN < 1) ctxWheel.globalAlpha = TEXT_FADE_WHILE_SPIN;

      drawWrappedLabel(
          ctxWheel,
          segments[i].label||`Prize ${i+1}`,
          0, 0,
          rFace * TEXT_MAX_W_RATIO,
          fontPx * TEXT_LINE_H,
          fontPx,
          TEXT_STROKE_SCALE
      );

      if (isSpinning && TEXT_FADE_WHILE_SPIN < 1) ctxWheel.globalAlpha = 1;

      ctxWheel.restore();
    }

    // hub (nút giữa)
    ctxWheel.save();
    ctxWheel.translate(cx, cy);
    const hub = ctxWheel.createRadialGradient(-rHub*0.35,-rHub*0.35, rHub*0.1, 0,0, rHub);
    hub.addColorStop(0.00,'#ffffff'); hub.addColorStop(0.25,'#ecf0f5'); hub.addColorStop(0.62,'#b9c4d1'); hub.addColorStop(1.00,'#8d97a4');
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rHub,0,TAU); ctxWheel.fillStyle=hub; ctxWheel.fill();
    ctxWheel.lineWidth=3*dpr; ctxWheel.strokeStyle='rgba(0,0,0,.18)'; ctxWheel.stroke();
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rHub*0.62,0,TAU); ctxWheel.strokeStyle='rgba(255,255,255,.65)'; ctxWheel.lineWidth=2*dpr; ctxWheel.stroke();
    ctxWheel.restore();

    // bulbs (đèn viền)
    ctxWheel.save();
    ctxWheel.translate(cx, cy);
    const rb = rOuter - 18*dpr/2, bulbR = 18*dpr*0.33;
    const blinkParity = Math.floor(performance.now()/BLINK_MS) % 2;
    const bulbsStaticOn = (isSpinning && !BLINK_DURING_SPIN);
    for(let i=0;i<BULB_COUNT;i++){
      const a = (i/BULB_COUNT)*TAU, x2 = Math.cos(a)*rb, y2 = Math.sin(a)*rb;
      const on = bulbsStaticOn ? true : ((i % 2) === blinkParity);
      ctxWheel.save(); ctxWheel.translate(x2,y2);
      if(on){
        if(!(isSpinning && REDUCE_SHADOWS_WHILE_SPIN)){ ctxWheel.shadowColor='rgba(255,219,77,.55)'; ctxWheel.shadowBlur=bulbR*2.2; }
        else { ctxWheel.shadowBlur=0; }
        const g=ctxWheel.createRadialGradient(0,0,bulbR*0.15,0,0,bulbR);
        g.addColorStop(0,'#ffffff'); g.addColorStop(0.45,'#FFF6C6'); g.addColorStop(1,'#F2B614');
        ctxWheel.beginPath(); ctxWheel.arc(0,0,bulbR,0,TAU); ctxWheel.fillStyle=g; ctxWheel.fill();
        ctxWheel.lineWidth=bulbR*0.35; ctxWheel.strokeStyle='rgba(255,255,255,.55)'; ctxWheel.stroke();
      } else {
        ctxWheel.beginPath(); ctxWheel.arc(0,0,bulbR*0.88,0,TAU); ctxWheel.fillStyle='rgba(180,140,40,.65)'; ctxWheel.fill();
      }
      ctxWheel.restore();
    }
    ctxWheel.restore();
  }

  // ===== Đế + nền =====
  function drawBase(){
    const w=cvsBg.width,h=cvsBg.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr;
    ctxBg.clearRect(0,0,w,h);

    const shadowY = cy + rOuter*0.98;
    ctxBg.save(); ctxBg.beginPath(); ctxBg.ellipse(cx, shadowY + rOuter*0.18, rOuter*0.70, rOuter*0.11, 0, 0, TAU);
    ctxBg.fillStyle='rgba(0,0,0,.35)'; ctxBg.fill(); ctxBg.restore();

    const neckTop = cy + rOuter*0.80, neckH=rOuter*0.14, neckTopW=rOuter*0.36, neckBotW=rOuter*0.64;
    const gradNeck = ctxBg.createLinearGradient(0,neckTop,0,neckTop+neckH);
    gradNeck.addColorStop(0,'#2d3340'); gradNeck.addColorStop(0.5,'#171a22'); gradNeck.addColorStop(1,'#0b0d13');
    ctxBg.save(); ctxBg.beginPath();
    ctxBg.moveTo(cx-neckTopW/2, neckTop); ctxBg.lineTo(cx+neckTopW/2, neckTop);
    ctxBg.lineTo(cx+neckBotW/2, neckTop+neckH); ctxBg.lineTo(cx-neckBotW/2, neckTop+neckH); ctxBg.closePath();
    ctxBg.fillStyle=gradNeck; ctxBg.fill(); ctxBg.restore();

    const baseTopY=neckTop+neckH-1*dpr, baseTopH=rOuter*0.11, baseTopW=rOuter*1.18, radTop=12*dpr;
    const gradTop = ctxBg.createLinearGradient(0,baseTopY,0,baseTopY+baseTopH);
    gradTop.addColorStop(0,'#171a22'); gradTop.addColorStop(1,'#0a0c12');
    ctxBg.save(); ctxBg.beginPath();
    ctxBg.moveTo(cx-baseTopW/2+radTop, baseTopY);
    ctxBg.lineTo(cx+baseTopW/2-radTop, baseTopY);
    ctxBg.quadraticCurveTo(cx+baseTopW/2, baseTopY, cx+baseTopW/2, baseTopY+radTop);
    ctxBg.lineTo(cx+baseTopW/2, baseTopY+baseTopH-radTop);
    ctxBg.quadraticCurveTo(cx+baseTopW/2, baseTopY+baseTopH, cx+baseTopW/2-radTop, baseTopY+baseTopH);
    ctxBg.lineTo(cx-baseTopW/2+radTop, baseTopY+baseTopH);
    ctxBg.quadraticCurveTo(cx-baseTopW/2, baseTopY+baseTopH, cx-baseTopW/2, baseTopY+baseTopH-radTop);
    ctxBg.lineTo(cx-baseTopW/2, baseTopY+radTop);
    ctxBg.quadraticCurveTo(cx-baseTopW/2, baseTopY, cx-baseTopW/2+radTop, baseTopY);
    ctxBg.closePath(); ctxBg.fillStyle=gradTop; ctxBg.fill(); ctxBg.restore();

    const baseBotY=baseTopY+baseTopH-2*dpr, baseBotH=rOuter*0.12, baseBotW=rOuter*1.55, radBot=14*dpr;
    const gradBot = ctxBg.createLinearGradient(0,baseBotY,0,baseBotY+baseBotH);
    gradBot.addColorStop(0,'#0f1218'); gradBot.addColorStop(0.5,'#080a0e'); gradBot.addColorStop(1,'#000');
    ctxBg.save(); ctxBg.beginPath();
    ctxBg.moveTo(cx-baseBotW/2+radBot, baseBotY);
    ctxBg.lineTo(cx+baseBotW/2-radBot, baseBotY);
    ctxBg.quadraticCurveTo(cx+baseBotW/2, baseBotY, cx+baseBotW/2, baseBotY+radBot);
    ctxBg.lineTo(cx+baseBotW/2, baseBotY+baseBotH-radBot);
    ctxBg.quadraticCurveTo(cx+baseBotW/2, baseBotY+baseBotH, cx+baseBotW/2-radBot, baseBotY+baseBotH);
    ctxBg.lineTo(cx-baseBotW/2+radBot, baseBotY+baseBotH);
    ctxBg.quadraticCurveTo(cx-baseBotW/2, baseBotY+baseBotH, cx-baseBotW/2, baseBotY+baseBotH-radBot);
    ctxBg.lineTo(cx-baseBotW/2, baseBotY+radBot);
    ctxBg.quadraticCurveTo(cx-baseBotW/2, baseBotY, cx-baseBotW/2+radBot, baseBotY);
    ctxBg.closePath(); ctxBg.fillStyle=gradBot; ctxBg.fill(); ctxBg.restore();
  }

  // ===== Kim (ngoài mép, mũi ngắn để không che chữ) =====
  function drawFx(){
    const w=cvsFx.width,h=cvsFx.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr, rimWidth=18*dpr, rFace=rOuter - rimWidth*0.8;

    ctxFx.clearRect(0,0,w,h);
    ctxFx.save(); ctxFx.translate(cx,cy); ctxFx.rotate(POINTER_ANGLE);

    const baseW = Math.max(rFace*0.20, 56*dpr);
    const tipL  = Math.max(rFace*0.06, 24*dpr);
    const baseX = rOuter - rimWidth*0.30;

    const grad = ctxFx.createLinearGradient(baseX, -baseW/2, baseX - tipL, baseW/2);
    grad.addColorStop(0,'#ff3b2f'); grad.addColorStop(1,'#b50f08');

    ctxFx.beginPath();
    ctxFx.moveTo(baseX, -baseW/2);
    ctxFx.lineTo(baseX,  baseW/2);
    ctxFx.lineTo(baseX - tipL, 0);
    ctxFx.closePath();
    ctxFx.fillStyle=grad;
    ctxFx.shadowColor='rgba(0,0,0,.45)'; ctxFx.shadowBlur=12*dpr;
    ctxFx.fill();

    ctxFx.beginPath();
    ctxFx.moveTo(baseX - 2*dpr, -baseW/2 + 2*dpr);
    ctxFx.lineTo(baseX - tipL + 3*dpr, 0);
    ctxFx.lineTo(baseX - 2*dpr,  baseW/2 - 2*dpr);
    ctxFx.strokeStyle='rgba(255,255,255,.85)'; ctxFx.lineWidth=2*dpr; ctxFx.stroke();

    ctxFx.restore();
  }

  function drawAll(skipBlinkLoop){
    drawBase(); drawWheel(); drawFx();
    if(!skipBlinkLoop && !isSpinning){
      if(animId) cancelAnimationFrame(animId);
      const loop=()=>{ drawWheel(); drawFx(); animId=requestAnimationFrame(loop); };
      animId=requestAnimationFrame(loop);
    }
  }

  function fallbackSegments(){ return [
    {label:'Voucher 10k'},{label:'Chúc may mắn'},{label:'Voucher 20k'},{label:'Chúc may mắn'},
    {label:'Voucher 50k'},{label:'Chúc may mắn'},{label:'Voucher 100k'},{label:'Chúc may mắn'},
  ]; }
  async function getWheel(){ try{const r=await fetch(API_WHEEL,{cache:'no-store'}); if(r.ok){const d=await r.json(); if(Array.isArray(d)&&d.length) return d;} }catch{} return fallbackSegments(); }
  async function postSpin(){ try{const r=await fetch(API_SPIN,{method:'POST'}); if(r.ok){const d=await r.json(); if(typeof d?.index==='number') return d;} }catch{} const i=Math.floor(Math.random()*segments.length); return {index:i,label:segments[i]?.label??''}; }

  async function notifyWin(prize){
    const u=loadUser()||{};
    try{
      await fetch(API_NOTIFY, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:u.name||'', phone:u.phone||'', province:u.province||'', prize:prize||'' })
      });
    }catch(err){}
  }

  function setRotation(angle){
    const old=rotation; rotation=angle;
    const n=segments.length; if(n>0){
      const arc=(TAU)/n;
      const prev=Math.floor(modTau(old)/arc);
      const curr=Math.floor(modTau(rotation)/arc);
      if(curr!==prev) playTick();
    }
    drawBase(); drawWheel(); drawFx();
  }
  function finishSpin(idx){
    isSpinning=false;
    spins=clamp((spins|0)-1,0,99); saveSpins(spins); updateSpinsUI();
    const prize=segments[idx]?.label??'';
    setStatus(prize?`Bạn trúng: ${prize}`:'Hoàn tất!');
    openWinModal(prize?`Bạn trúng: ${prize}`:'Bạn đã hoàn tất lượt quay!');
    notifyWin(prize);
    if(animId) cancelAnimationFrame(animId);
    animId=requestAnimationFrame(function loop(){ drawWheel(); drawFx(); animId=requestAnimationFrame(loop); });
  }
  async function spinToIndex(idx){
    if(isSpinning) return; isSpinning=true; updateSpinsUI(); setStatus('Đang quay...');
    await initAudio();
    if(animId){ cancelAnimationFrame(animId); animId=null; }
    const n=segments.length, arc=(TAU)/n;
    const segCenter=idx*arc + arc/2;
    const start=rotation, startMod=modTau(start);
    const deltaToHit = modTau(POINTER_ANGLE - segCenter - startMod);
    const target=start + EXTRA_TURNS*TAU + deltaToHit;
    const t0=performance.now(), dur=SPIN_TOTAL_MS;
    const step=now=>{
      const t=Math.max(0, Math.min(1,(now-t0)/dur));
      const e=easeOut(t);
      setRotation(start + (target-start)*e);
      if(t<1) requestAnimationFrame(step); else finishSpin(idx);
    };
    requestAnimationFrame(step);
  }

  function buildTickerItems(){
    const names=["Nguyễn An","Trần Bình","Lê Chi","Phạm Dũng","Huỳnh Giang","Võ Hạnh","Đặng Khôi","Bùi Linh","Đỗ Minh","Phan Ngọc","Trương Oanh","Hồ Phúc","Tạ Quân","Ngô Ri","Dương Sơn","Lý Trang","Vũ Uyên","Kiều Vy","Châu Yến","Mai Gia"];
    const prizes=(segments.length?segments.map(s=>s.label):["Voucher 10k","Voucher 20k","Voucher 50k","Voucher 100k","Chúc may mắn"]).filter(Boolean);
    const pick=()=>names[(Math.random()*names.length)|0]+" vừa trúng "+prizes[(Math.random()*prizes.length)|0];
    const items=Array.from({length:12},()=>pick());
    const html=items.map(t=>`<span class="ticker__item">🔔 ${t}</span>`).join("");
    tickerTrack.innerHTML = html + html;
  }
  function refreshTickerPeriodically(){ setInterval(buildTickerItems, 20000); }

  function initOnline(){
    let online=40+Math.floor(Math.random()*120);
    const render=()=>{ elOnline.textContent=`Đang online: ${online}`; };
    render();
    setInterval(()=>{ online = clamp(online + (Math.random()<0.5?-1:1)*(1+Math.floor(Math.random()*2)), 20, 300); render(); }, 8000);
  }

  function initForm(){
    for(const p of VN_PROVINCES){
      const opt=document.createElement('option'); opt.value=opt.textContent=p; regProvinceSel.appendChild(opt);
    }
    regPhoneInp.addEventListener('input', ()=>{ regPhoneInp.value = regPhoneInp.value.replace(/\D/g,''); });
  }

  async function init(){
    fabZalo.href = ZALO_URL; fabMess.href = MESSENGER_URL;

    segments=await getWheel();
    const stored=loadSpins();
    spins=(DEV_MODE && Number.isInteger(DEV_SPINS)) ? DEV_SPINS : (Number.isInteger(stored)?stored:1);
    saveSpins(spins);

    updateGreeting(); updateSpinsUI(); setStatus('Sẵn sàng');

    initForm(); initOnline(); buildTickerItems(); refreshTickerPeriodically();

    // Cập nhật biến --ticker-h theo thực tế
    const t = document.querySelector('.ticker');
    if (t) {
      const h = Math.ceil(t.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--ticker-h', h + 'px');
    }

    fitWheelToViewport();
    window.addEventListener('resize', fitWheelToViewport, {passive:true});
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(fitWheelToViewport);
      const hero   = document.querySelector('.hero');
      const ticker = document.querySelector('.ticker');
      if (hero)   ro.observe(hero);
      if (ticker) ro.observe(ticker);
    }

    spinBtn.addEventListener('click', async ()=>{
      if(isSpinning) return;
      if(!loadUser()){ openModal(); setStatus('Vui lòng đăng ký để quay.'); return; }
      if(spins<=0){ setStatus('Bạn đã hết lượt.'); return; }
      const res=await postSpin(); const idx=clamp(res.index|0,0,segments.length-1);
      spinToIndex(idx);
    });

    shareBtn.addEventListener('click', ()=>{
      if(loadSharedAwarded()){ setStatus('Bạn đã nhận +1 từ chia sẻ.'); return; }
      const w=window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(SHARE_TARGET_URL),'_blank','width=600,height=500');
      const iv=setInterval(()=>{ if(!w || w.closed){ clearInterval(iv);
        if(!loadSharedAwarded()){
          spins=clamp(spins+1,0,99); saveSpins(spins); saveSharedAwarded(true);
          updateSpinsUI(); setStatus('Đã cộng +1 lượt nhờ chia sẻ. Chúc bạn may mắn!');
        }
      }},600);
    });

    regCancel.addEventListener('click', ()=>closeModal());
    regForm.addEventListener('submit', e=>{
      e.preventDefault();
      const name=regNameInp.value.trim(), phone=regPhoneInp.value.trim(), prov=regProvinceSel.value;
      if(!name||!phone||!prov) return;
      saveUser({name,phone,province:prov}); updateGreeting(); closeModal();
      setStatus('Đăng ký thành công! Bạn có thể quay.');
    });

    winOk.addEventListener('click', closeWinModal);
    winModal.addEventListener('click', (e)=>{ if(e.target===winModal) closeWinModal(); });

    animId=requestAnimationFrame(function loop(){ drawWheel(); drawFx(); animId=requestAnimationFrame(loop); });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
