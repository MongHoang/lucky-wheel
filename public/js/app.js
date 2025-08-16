/* Lucky Wheel 3D — "Suspense + Contact FAB + Ticker + eSMS notify"
   - 1-pha easing, đầu nhanh hơn, cuối hãm dài hơn (EASE_POWER=2.4, 13s, 6 vòng)
   - Kim đỏ ở dưới, viền vàng + bóng đèn chớp, chân đế đẹp
   - Popup trúng: confetti + âm vỗ tay
   - Nút QUAY in hoa
   - FAB Zalo/Messenger nổi góc phải (icon)
   - Banner chạy, online ngẫu nhiên
   - Form đăng ký: thêm Tỉnh/TP dropdown, SĐT kiểu số
   - Gọi API backend /api/notify-win để server gọi eSMS (bảo mật key)
*/
(() => {
  // ===== Config & keys =====
  const LS_USER='lw_user', LS_SPINS='lw_spins', LS_SHARED='lw_shared_awarded';
  const API_WHEEL='/api/wheel', API_SPIN='/api/spin';
  const API_NOTIFY='/api/notify-win'; // <-- server của bạn sẽ gọi eSMS

  // Spin timing — 1-pha (đầu nhanh hơn, cuối hãm dài hơn)
  const SPIN_TOTAL_MS = 13000;   // 13s
  const EXTRA_TURNS   = 6;       // thêm vòng nhanh để cảm giác "vèo"
  const EASE_POWER    = 2.4;     // >2 → tốc đầu lớn hơn, hãm dài
  const POINTER_ANGLE = Math.PI/2; // kim ở DƯỚI, chĩa lên trong

  // Bóng đèn
  const BULB_COUNT=28;
  const BLINK_MS=520;

  // Tối ưu khi đang quay
  const BLINK_DURING_SPIN = false;
  const REDUCE_SHADOWS_WHILE_SPIN = true;
  const STROKE_TEXT_WHILE_SPIN = false;

  // Liên hệ
  const ZALO_URL='https://zalo.me/yourZaloID';
  const MESSENGER_URL='https://m.me/yourPageID';

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

  // Ticker
  const ticker=document.getElementById('ticker');
  const tickerTrack=document.getElementById('tickerTrack');

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
  const modTau=a=>{const TAU=Math.PI*2; return ((a%TAU)+TAU)%TAU;}
  const TAU=Math.PI*2;
  const easeOut = t => 1 - Math.pow(1 - t, EASE_POWER);
  const q=new URLSearchParams(location.search);
  const DEV_MODE=q.has('dev'); const DEV_SPINS=q.get('spins')?parseInt(q.get('spins'),10):null;

  // Palette
  const PALETTE = ['#FF8A80','#9CC7FF','#B7E27A','#FFB285','#CFA9FF','#8ED1FF','#FFD166','#EF476F'];

  // VN Provinces (63)
  const VN_PROVINCES=[
    "An Giang","Bà Rịa - Vũng Tàu","Bắc Giang","Bắc Kạn","Bạc Liêu","Bắc Ninh","Bến Tre","Bình Định","Bình Dương",
    "Bình Phước","Bình Thuận","Cà Mau","Cần Thơ","Cao Bằng","Đà Nẵng","Đắk Lắk","Đắk Nông","Điện Biên","Đồng Nai",
    "Đồng Tháp","Gia Lai","Hà Giang","Hà Nam","Hà Nội","Hà Tĩnh","Hải Dương","Hải Phòng","Hậu Giang","Hòa Bình",
    "Hưng Yên","Khánh Hòa","Kiên Giang","Kon Tum","Lai Châu","Lâm Đồng","Lạng Sơn","Lào Cai","Long An","Nam Định",
    "Nghệ An","Ninh Bình","Ninh Thuận","Phú Thọ","Phú Yên","Quảng Bình","Quảng Nam","Quảng Ngãi","Quảng Ninh",
    "Quảng Trị","Sóc Trăng","Sơn La","Tây Ninh","Thái Bình","Thái Nguyên","Thanh Hóa","Thừa Thiên Huế","Tiền Giang",
    "TP. Hồ Chí Minh","Trà Vinh","Tuyên Quang","Vĩnh Long","Vĩnh Phúc","Yên Bái"
  ];

  // ===== Storage =====
  const loadUser=()=>{try{const r=localStorage.getItem(LS_USER);return r?JSON.parse(r):null;}catch{return null}};
  const saveUser=u=>localStorage.setItem(LS_USER,JSON.stringify(u));
  const loadSpins=()=>{const v=parseInt(localStorage.getItem(LS_SPINS)||'NaN',10);return Number.isFinite(v)?v:null};
  const saveSpins=v=>localStorage.setItem(LS_SPINS,String(v));
  const loadSharedAwarded=()=>localStorage.getItem(LS_SHARED)==='1';
  const saveSharedAwarded=v=>localStorage.setItem(LS_SHARED, v?'1':'0');

  // ===== UI =====
  function updateGreeting(){const u=loadUser(); elGreeting.textContent=u?`Xin chào, ${u.name}!`:'Chưa đăng ký';}
  function updateSpinsUI(){elSpins.textContent=`Lượt còn: ${spins}`; spinBtn.disabled=isSpinning||spins<=0;}
  const setStatus=msg=>elStatus.textContent=msg;

  // ===== Modal helpers =====
  const openModal=()=>{regModal.classList.remove('hidden'); regNameInp.focus({preventScroll:true});}
  const closeModal=()=>regModal.classList.add('hidden');

  // ===== Win popup + confetti =====
  function launchConfetti(ms=3400, count=240){
    const c=document.createElement('canvas');
    c.className='confetti-layer'; document.body.appendChild(c);
    const ctx=c.getContext('2d');
    const scale=Math.max(1, window.devicePixelRatio||1);
    function size(){ c.width=innerWidth*scale; c.height=innerHeight*scale; c.style.width=innerWidth+'px'; c.style.height=innerHeight+'px'; }
    size(); window.addEventListener('resize', size, {once:true});
    const colors=['#FFD166','#F4978E','#9CDBFF','#B5D99C','#FF4D6D','#F8ED62'];
    const pcs=Array.from({length:count},()=>({
      x:(innerWidth*scale)/2, y:-20*scale,
      vx:(Math.random()*2-1)*(4.8*scale),
      vy:(4+Math.random()*6)*scale*(-1),
      rot:Math.random()*Math.PI, vr:(Math.random()-0.5)*0.25,
      s:(6+Math.random()*10)*scale, color:colors[(Math.random()*colors.length)|0],
      tri:Math.random()<0.5
    }));
    const g=0.12*scale, air=0.996, t0=performance.now();
    (function f(now){
      const t=now-t0; ctx.clearRect(0,0,c.width,c.height);
      for(const p of pcs){
        p.vx*=air; p.vy=p.vy*air+g; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.color;
        if(p.tri){ ctx.beginPath(); ctx.moveTo(-p.s/2,p.s/2); ctx.lineTo(0,-p.s/2); ctx.lineTo(p.s/2,p.s/2); ctx.closePath(); ctx.fill(); }
        else ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*0.66);
        ctx.restore();
      }
      if(t<ms) requestAnimationFrame(f); else c.remove();
    })(t0);
  }
  function openWinModal(text){
    winText.textContent = text || 'Bạn trúng thưởng!';
    winModal.classList.remove('hidden');
    launchConfetti(3600, 260);
    playApplause();
  }
  function closeWinModal(){ winModal.classList.add('hidden'); }

  // ===== Audio =====
  async function ensureAudioCtx(){ if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext; if(AC) audioCtx=new AC();} if(audioCtx&&audioCtx.state==='suspended'){try{await audioCtx.resume()}catch{}}}
  async function loadBuffer(url){ try{const r=await fetch(url); if(!r.ok) throw 0; const arr=await r.arrayBuffer(); return await new Promise((res,rej)=>audioCtx.decodeAudioData(arr,res,rej)); }catch{return null}}
  async function initAudio(){ await ensureAudioCtx(); if(!audioCtx) return; if(!tickBuf) tickBuf=await loadBuffer('/sfx/tick.wav'); if(!applauseBuf) applauseBuf=await loadBuffer('/sfx/applause.wav'); }
  function playTick(){ if(!audioCtx||!tickBuf) return; const s=audioCtx.createBufferSource(); s.buffer=tickBuf; s.connect(audioCtx.destination); try{s.start()}catch{} }
  function playApplause(){ if(!audioCtx||!applauseBuf) return; const s=audioCtx.createBufferSource(); s.buffer=applauseBuf; s.connect(audioCtx.destination); try{s.start()}catch{} }

  // ===== Canvas sizing =====
  function resizeCanvas(){
    const rect=cvsWheel.getBoundingClientRect();
    const size=Math.floor(Math.min(rect.width, rect.height||rect.width)*dpr);
    if(size<=0) return;
    for(const c of [cvsBg,cvsWheel,cvsFx]){
      c.width=size; c.height=size; c.style.width=c.style.height=(size/dpr)+'px';
    }
    drawAll(true);
  }

  // ===== Label helper (uppercase + stroke) =====
  function drawWrappedLabel(ctx,text,x,y,maxWidth,lineHeight,fontPx){
    const t=String(text).toUpperCase();
    const words=t.split(/\s+/); let line=''; const lines=[];
    for(const w of words){const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxWidth && line){lines.push(line); line=w;} else line=test;}
    if(line) lines.push(line);
    const used=Math.min(lines.length,3); const startY=y-((used-1)*lineHeight)/2;
    ctx.lineJoin='round'; ctx.miterLimit=2;
    ctx.fillStyle='#fff';
    for(let i=0;i<used;i++){
      const yy=startY+i*lineHeight;
      if(!isSpinning || STROKE_TEXT_WHILE_SPIN){
        ctx.strokeStyle='rgba(0,0,0,.65)';
        ctx.lineWidth=Math.max(2*dpr,fontPx*0.12);
        ctx.strokeText(lines[i],x,yy);
      }
      ctx.fillText(lines[i],x,yy);
    }
  }

  // ===== Drawing: wheel + bulbs =====
  function drawWheel(){
    const w=cvsWheel.width,h=cvsWheel.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr;
    const rimWidth=18*dpr;
    const rFace=rOuter - rimWidth*0.8;
    const rHub=rFace*0.18;

    ctxWheel.clearRect(0,0,w,h);
    if(!segments.length) return;

    const n=segments.length, arc=TAU/n;

    ctxWheel.save(); ctxWheel.translate(cx,cy); ctxWheel.rotate(rotation);

    // Viền vàng
    const rimGrad = ctxWheel.createLinearGradient(0,-rOuter,0,rOuter);
    rimGrad.addColorStop(0.00, '#FFF7CC'); rimGrad.addColorStop(0.30, '#FFD34D');
    rimGrad.addColorStop(0.60, '#E0A72A'); rimGrad.addColorStop(1.00, '#A87610');
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rOuter - rimWidth/2, 0, TAU);
    ctxWheel.strokeStyle = rimGrad; ctxWheel.lineWidth = rimWidth; ctxWheel.lineCap = 'round'; ctxWheel.stroke();

    // highlight đỉnh rim
    const highlightWidth = rimWidth*0.38, highlightAngle = 0.23*Math.PI;
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rOuter - rimWidth/2, -highlightAngle, +highlightAngle);
    ctxWheel.strokeStyle='rgba(255,255,255,.68)'; ctxWheel.lineWidth=highlightWidth; ctxWheel.stroke();

    // Lát + text
    for(let i=0;i<n;i++){
      const a0=i*arc, a1=a0+arc, mid=a0+arc/2;

      ctxWheel.beginPath(); ctxWheel.moveTo(0,0); ctxWheel.arc(0,0,rFace,a0,a1); ctxWheel.closePath();
      ctxWheel.fillStyle = PALETTE[i % PALETTE.length]; ctxWheel.fill();

      // bevel
      ctxWheel.save(); ctxWheel.clip();
      const bevel = ctxWheel.createLinearGradient(-rFace,0,rFace,0);
      bevel.addColorStop(0.00,'rgba(255,255,255,.16)'); bevel.addColorStop(0.50,'rgba(255,255,255,0)'); bevel.addColorStop(1.00,'rgba(0,0,0,.16)');
      ctxWheel.fillStyle = bevel; ctxWheel.fillRect(-rFace,-rFace,rFace*2,rFace*2); ctxWheel.restore();

      // outer ring
      ctxWheel.save(); ctxWheel.clip(); ctxWheel.beginPath(); ctxWheel.arc(0,0,rFace-2*dpr,0,TAU);
      ctxWheel.strokeStyle='rgba(255,255,255,.22)'; ctxWheel.lineWidth=6*dpr; ctxWheel.stroke(); ctxWheel.restore();

      // ranh lát
      ctxWheel.beginPath(); ctxWheel.moveTo(0,0); ctxWheel.arc(0,0,rFace,a0,a1); ctxWheel.closePath();
      ctxWheel.lineWidth = 2*dpr; ctxWheel.strokeStyle = 'rgba(255,255,255,.82)'; ctxWheel.stroke();

      // text
      ctxWheel.save(); ctxWheel.rotate(mid); ctxWheel.translate(rFace*0.68,0); ctxWheel.rotate(Math.PI/2);
      ctxWheel.textAlign='center'; ctxWheel.textBaseline='middle';
      const fontPx = Math.round(Math.max(16*dpr, Math.min(24*dpr, rFace*0.095)));
      ctxWheel.font=`800 ${fontPx}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      drawWrappedLabel(ctxWheel, segments[i].label||`Prize ${i+1}`, 0, 0, rFace*0.52, fontPx*1.12, fontPx);
      ctxWheel.restore();
    }

    // Vignette
    ctxWheel.save(); ctxWheel.beginPath(); ctxWheel.arc(0,0,rFace,0,TAU); ctxWheel.clip();
    const shade = ctxWheel.createRadialGradient(0,0,rFace*0.10, 0,0,rFace);
    shade.addColorStop(0.00,'rgba(255,255,255,.18)'); shade.addColorStop(0.60,'rgba(255,255,255,0)'); shade.addColorStop(1.00,'rgba(0,0,0,.28)');
    ctxWheel.fillStyle = shade; ctxWheel.fillRect(-rFace,-rFace,rFace*2,rFace*2); ctxWheel.restore();

    // Hub
    const hub = ctxWheel.createRadialGradient(-rHub*0.35,-rHub*0.35, rHub*0.1, 0,0, rHub);
    hub.addColorStop(0.00,'#ffffff'); hub.addColorStop(0.25,'#ecf0f5'); hub.addColorStop(0.62,'#b9c4d1'); hub.addColorStop(1.00,'#8d97a4');
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rHub,0,TAU); ctxWheel.fillStyle=hub; ctxWheel.fill();
    ctxWheel.lineWidth=3*dpr; ctxWheel.strokeStyle='rgba(0,0,0,.18)'; ctxWheel.stroke();
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rHub*0.62,0,TAU); ctxWheel.strokeStyle='rgba(255,255,255,.65)';
    ctxWheel.lineWidth=2*dpr; ctxWheel.stroke();

    // Bóng đèn chớp tắt
    const rb = rOuter - rimWidth/2, bulbR = rimWidth*0.33;
    const blinkParity = Math.floor(performance.now()/BLINK_MS) % 2;
    const bulbsStaticOn = (isSpinning && !BLINK_DURING_SPIN);
    for(let i=0;i<BULB_COUNT;i++){
      const a = (i/BULB_COUNT)*TAU, x = Math.cos(a)*rb, y = Math.sin(a)*rb;
      const on = bulbsStaticOn ? true : ((i % 2) === blinkParity);
      ctxWheel.save(); ctxWheel.translate(x,y);

      if(on){
        if(!(isSpinning && REDUCE_SHADOWS_WHILE_SPIN)){
          ctxWheel.shadowColor='rgba(255,219,77,.55)'; ctxWheel.shadowBlur=bulbR*2.2;
        }else{
          ctxWheel.shadowBlur=0;
        }
        const g=ctxWheel.createRadialGradient(0,0,bulbR*0.15,0,0,bulbR);
        g.addColorStop(0,'#ffffff'); g.addColorStop(0.45,'#FFF6C6'); g.addColorStop(1,'#F2B614');
        ctxWheel.beginPath(); ctxWheel.arc(0,0,bulbR,0,TAU); ctxWheel.fillStyle=g; ctxWheel.fill();
        ctxWheel.lineWidth=bulbR*0.35; ctxWheel.strokeStyle='rgba(255,255,255,.55)'; ctxWheel.stroke();
      }else{
        ctxWheel.beginPath(); ctxWheel.arc(0,0,bulbR*0.88,0,TAU);
        ctxWheel.fillStyle='rgba(180,140,40,.65)'; ctxWheel.fill();
      }
      ctxWheel.restore();
    }

    ctxWheel.restore();
  }

  // ===== Base (chân đế) =====
  function drawBase(){
    const w=cvsBg.width,h=cvsBg.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr;
    ctxBg.clearRect(0,0,w,h);

    // Bóng elip
    const shadowY = cy + rOuter*0.98;
    ctxBg.save(); ctxBg.beginPath(); ctxBg.ellipse(cx, shadowY + rOuter*0.18, rOuter*0.70, rOuter*0.11, 0, 0, TAU);
    ctxBg.fillStyle='rgba(0,0,0,.35)'; ctxBg.fill(); ctxBg.restore();

    // Cổ đế
    const neckTop = cy + rOuter*0.80, neckH=rOuter*0.14, neckTopW=rOuter*0.36, neckBotW=rOuter*0.64;
    const gradNeck = ctxBg.createLinearGradient(0,neckTop,0,neckTop+neckH);
    gradNeck.addColorStop(0,'#2d3340'); gradNeck.addColorStop(0.5,'#171a22'); gradNeck.addColorStop(1,'#0b0d13');
    ctxBg.save(); ctxBg.beginPath();
    ctxBg.moveTo(cx-neckTopW/2, neckTop); ctxBg.lineTo(cx+neckTopW/2, neckTop);
    ctxBg.lineTo(cx+neckBotW/2, neckTop+neckH); ctxBg.lineTo(cx-neckBotW/2, neckTop+neckH); ctxBg.closePath();
    ctxBg.fillStyle=gradNeck;
    if(!(isSpinning && REDUCE_SHADOWS_WHILE_SPIN)){
      ctxBg.shadowColor='rgba(0,0,0,.45)'; ctxBg.shadowBlur=14*dpr; ctxBg.shadowOffsetY=4*dpr;
    }
    ctxBg.fill(); ctxBg.restore();

    // Bệ trên
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

    // Bệ dưới
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
    ctxBg.closePath(); ctxBg.fillStyle=gradBot;
    if(!(isSpinning && REDUCE_SHADOWS_WHILE_SPIN)){
      ctxBg.shadowColor='rgba(0,0,0,.6)'; ctxBg.shadowBlur=24*dpr; ctxBg.shadowOffsetY=6*dpr;
    }
    ctxBg.fill(); ctxBg.restore();
  }

  // ===== FX: kim đỏ tam giác (dưới) =====
  function drawFx(){
    const w=cvsFx.width,h=cvsFx.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr, rimWidth=18*dpr, rFace=rOuter - rimWidth*0.8;

    ctxFx.clearRect(0,0,w,h);

    ctxFx.save(); ctxFx.translate(cx,cy); ctxFx.rotate(POINTER_ANGLE);
    const baseW = Math.max(rFace*0.22, 60*dpr);
    const tipL  = Math.max(rFace*0.14, 44*dpr);
    const baseX = rFace + 6*dpr;
    const grad = ctxFx.createLinearGradient(baseX, -baseW/2, baseX - tipL, baseW/2);
    grad.addColorStop(0,'#ff3b2f'); grad.addColorStop(1,'#b50f08');
    ctxFx.beginPath(); ctxFx.moveTo(baseX, -baseW/2); ctxFx.lineTo(baseX, baseW/2); ctxFx.lineTo(baseX - tipL, 0); ctxFx.closePath();
    ctxFx.fillStyle=grad;
    if(!(isSpinning && REDUCE_SHADOWS_WHILE_SPIN)){ ctxFx.shadowColor='rgba(0,0,0,.45)'; ctxFx.shadowBlur=12*dpr; }
    else { ctxFx.shadowBlur=0; }
    ctxFx.fill();
    // viền sáng
    ctxFx.beginPath(); ctxFx.moveTo(baseX - 2*dpr, -baseW/2 + 2*dpr); ctxFx.lineTo(baseX - tipL + 3*dpr, 0); ctxFx.lineTo(baseX - 2*dpr, baseW/2 - 2*dpr);
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

  // ===== Data =====
  function fallbackSegments(){ return [
    {label:'Voucher 10k'},{label:'Chúc may mắn'},{label:'Voucher 20k'},{label:'Chúc may mắn'},
    {label:'Voucher 50k'},{label:'Chúc may mắn'},{label:'Voucher 100k'},{label:'Chúc may mắn'},
  ];}
  async function getWheel(){ try{const r=await fetch(API_WHEEL,{cache:'no-store'}); if(r.ok){const d=await r.json(); if(Array.isArray(d)&&d.length) return d;} }catch{} return fallbackSegments(); }
  async function postSpin(){ try{const r=await fetch(API_SPIN,{method:'POST'}); if(r.ok){const d=await r.json(); if(typeof d?.index==='number') return d;} }catch{} const i=Math.floor(Math.random()*segments.length); return {index:i,label:segments[i]?.label??''}; }

  // ===== Notify backend (server gọi eSMS) =====
  async function notifyWin(prize){
    const u=loadUser()||{};
    try{
      await fetch(API_NOTIFY, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name: u.name||'',
          phone: u.phone||'',
          province: u.province||'',
          prize: prize||''
        })
      });
    }catch(err){ /* im lặng */ }
  }

  // ===== Spin engine (1-pha) =====
  function setRotation(angle){
    const old=rotation; rotation=angle;
    // tick khi qua ranh
    const n=segments.length; if(n>0){ const arc=(TAU)/n; const prev=Math.floor(modTau(old)/arc); const curr=Math.floor(modTau(rotation)/arc); if(curr!==prev) playTick(); }
    drawBase(); drawWheel(); drawFx();
  }
  function finishSpin(idx){
    isSpinning=false;
    spins=clamp((spins|0)-1,0,99); saveSpins(spins); updateSpinsUI();
    const prize=segments[idx]?.label??'';
    setStatus(prize?`Bạn trúng: ${prize}`:'Hoàn tất!');
    openWinModal(prize?`Bạn trúng: ${prize}`:'Bạn đã hoàn tất lượt quay!');
    notifyWin(prize); // <-- gọi backend để SMS qua eSMS
    // bật lại loop nháy
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
      const t=Math.max(0, Math.min(1,(now-t0)/dur));   // 0..1
      const e=easeOut(t);                               // 1-pha
      setRotation(start + (target-start)*e);
      if(t<1) requestAnimationFrame(step); else finishSpin(idx);
    };
    requestAnimationFrame(step);
  }

  // ===== Share =====
  function openShare(){
    if(loadSharedAwarded()){ setStatus('Bạn đã nhận +1 từ chia sẻ.'); return; }
    const w=window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(SHARE_TARGET_URL),'_blank','width=600,height=500');
    const iv=setInterval(()=>{ if(!w || w.closed){ clearInterval(iv);
      if(!loadSharedAwarded()){
        spins=clamp(spins+1,0,99); saveSpins(spins); saveSharedAwarded(true);
        updateSpinsUI(); setStatus('Đã cộng +1 lượt nhờ chia sẻ. Chúc bạn may mắn!');
      }
    }},600);
  }

  // ===== Ticker (banner chạy) =====
  function buildTickerItems(){
    const names=["Nguyễn An","Trần Bình","Lê Chi","Phạm Dũng","Huỳnh Giang","Võ Hạnh","Đặng Khôi","Bùi Linh","Đỗ Minh","Phan Ngọc","Trương Oanh","Hồ Phúc","Tạ Quân","Ngô Ri","Dương Sơn","Lý Trang","Vũ Uyên","Kiều Vy","Châu Yến","Mai Gia"];
    const prizes=(segments.length?segments.map(s=>s.label):["Voucher 10k","Voucher 20k","Voucher 50k","Voucher 100k","Chúc may mắn"]).filter(Boolean);
    const pick=()=>names[(Math.random()*names.length)|0]+" vừa trúng "+prizes[(Math.random()*prizes.length)|0];
    const items=Array.from({length:12},()=>pick());
    const html=items.map(t=>`<span class="ticker__item">🔔 ${t}</span>`).join("");
    tickerTrack.innerHTML = html + html; // nhân đôi để scroll vô hạn êm
  }
  function refreshTickerPeriodically(){
    setInterval(buildTickerItems, 20000);
  }

  // ===== Online (random + dao động nhẹ) =====
  function initOnline(){
    let online=40+Math.floor(Math.random()*120); // 40..159
    const render=()=>{ elOnline.textContent=`Đang online: ${online}`; };
    render();
    setInterval(()=>{ online = clamp(online + (Math.random()<0.5?-1:1)*(1+Math.floor(Math.random()*2)), 20, 300); render(); }, 8000);
  }

  // ===== Init form (province + số điện thoại số) =====
  function initForm(){
    for(const p of VN_PROVINCES){
      const opt=document.createElement('option'); opt.value=opt.textContent=p; regProvinceSel.appendChild(opt);
    }
    regPhoneInp.addEventListener('input', ()=>{ regPhoneInp.value = regPhoneInp.value.replace(/\D/g,''); });
  }

  // ===== Init =====
  async function init(){
    fabZalo.href = ZALO_URL;
    fabMess.href = MESSENGER_URL;

    segments=await getWheel();

    const stored=loadSpins();
    spins=(DEV_MODE && Number.isInteger(DEV_SPINS)) ? DEV_SPINS : (Number.isInteger(stored)?stored:1);
    saveSpins(spins);

    updateGreeting(); updateSpinsUI(); setStatus('Sẵn sàng');

    initForm();
    initOnline();
    buildTickerItems();
    refreshTickerPeriodically();

    resizeCanvas(); window.addEventListener('resize', resizeCanvas, {passive:true});

    spinBtn.addEventListener('click', async ()=>{
      if(isSpinning) return;
      if(!loadUser()){ openModal(); setStatus('Vui lòng đăng ký để quay.'); return; }
      if(spins<=0){ setStatus('Bạn đã hết lượt.'); return; }
      const res=await postSpin();
      const idx=clamp(res.index|0,0,segments.length-1);
      spinToIndex(idx);
    });

    shareBtn.addEventListener('click', openShare);
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

    if(DEV_MODE){
      devPanel.classList.add('show');
      devPanel.addEventListener('click', e=>{
        const act=e.target?.getAttribute('data-act'); if(!act) return;
        if(act==='add') spins=clamp(spins+1,0,999);
        if(act==='zero') spins=0;
        if(act==='reset'){ localStorage.removeItem(LS_USER); localStorage.removeItem(LS_SPINS); localStorage.removeItem(LS_SHARED); spins=1; }
        saveSpins(spins); updateSpinsUI(); updateGreeting(); setStatus('DEV: cập nhật xong');
      });
      window.addEventListener('keydown', ev=>{
        if(ev.key==='='){spins=clamp(spins+1,0,999); saveSpins(spins); updateSpinsUI();}
        if(ev.key==='-'){spins=clamp(spins-1,0,999); saveSpins(spins); updateSpinsUI();}
        if(ev.key==='0'){spins=0; saveSpins(spins); updateSpinsUI();}
        if(ev.key.toLowerCase()==='r'){ localStorage.removeItem(LS_USER); localStorage.removeItem(LS_SPINS); localStorage.removeItem(LS_SHARED); spins=1; saveSpins(spins); updateSpinsUI(); updateGreeting(); setStatus('DEV: reset localStorage'); }
      });
    }

    // idle: nháy bóng
    animId=requestAnimationFrame(function loop(){ drawWheel(); drawFx(); animId=requestAnimationFrame(loop); });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
