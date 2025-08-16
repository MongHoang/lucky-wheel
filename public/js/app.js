/* Lucky Wheel 3D — slices with stronger 3D, bigger pointer; spin ~10s (easeOutCubic) */
(() => {
  // ===== Config & keys =====
  const LS_USER='lw_user', LS_SPINS='lw_spins', LS_SHARED='lw_shared_awarded';
  const API_WHEEL='/api/wheel', API_SPIN='/api/spin';

  // Spin timing
  const SPIN_TOTAL_MS=10000;       // ~10s
  const EXTRA_TURNS=6;             // số vòng trọn trước khi hạ tốc
  const POINTER_ANGLE=-Math.PI/2;  // kim cố định ở đỉnh

  // Share target (đổi sang bài thực tế)
  const SHARE_TARGET_URL='https://example.com/your-post';

  // ===== DOM =====
  const cvsWheel=document.getElementById('wheel');
  const cvsFx=document.getElementById('fx');
  const spinBtn=document.getElementById('spinBtn');
  const shareBtn=document.getElementById('shareBtn');
  const devPanel=document.getElementById('devPanel');
  const elGreeting=document.getElementById('greeting');
  const elSpins=document.getElementById('spins');
  const elStatus=document.getElementById('status');
  const regModal=document.getElementById('regModal');
  const regForm=document.getElementById('regForm');
  const regCancel=document.getElementById('regCancel');
  const regNameInp=document.getElementById('regName');
  const regPhoneInp=document.getElementById('regPhone');

  // ===== Canvas =====
  const dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
  const ctxWheel=cvsWheel.getContext('2d');
  const ctxFx=cvsFx.getContext('2d');

  // ===== State =====
  let segments=[], rotation=0, isSpinning=false, spins=0;
  let audioCtx=null, whooshBuf=null, tickBuf=null, whooshNode=null;

  // ===== Utils =====
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const easeOutCubic=t=>1-Math.pow(1-t,3);
  const modTau=a=>{const TAU=Math.PI*2; return ((a%TAU)+TAU)%TAU;}
  const q=new URLSearchParams(location.search);
  const DEV_MODE=q.has('dev'); const DEV_SPINS=q.get('spins')?parseInt(q.get('spins'),10):null;

  // ===== Palette (đậm & tương phản giống giao diện cũ) =====
  const PALETTE = [
    '#FF8A80','#9CC7FF','#B7E27A','#FFB285',
    '#CFA9FF','#8ED1FF','#FFD166','#EF476F'
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

  // ===== Canvas sizing =====
  function resizeCanvas(){
    const rect=cvsWheel.getBoundingClientRect();
    const size=Math.floor(Math.min(rect.width, rect.height||rect.width)*dpr);
    if(size<=0) return;
    for(const c of [cvsWheel,cvsFx]){
      c.width=size; c.height=size; c.style.width=c.style.height=(size/dpr)+'px';
    }
    drawAll();
  }

  // ===== Drawing (3D) =====
  function drawWheel(){
    const w=cvsWheel.width,h=cvsWheel.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr;           // mép ngoài vàng
    const rimWidth=18*dpr;                         // dày viền vàng
    const rFace=rOuter - rimWidth*0.8;             // bán kính mặt lát
    const rHub=rFace*0.18;

    ctxWheel.clearRect(0,0,w,h);
    if(!segments.length) return;

    const n=segments.length, arc=(Math.PI*2)/n;

    ctxWheel.save();
    ctxWheel.translate(cx,cy);
    ctxWheel.rotate(rotation);

    // --- RIM kim loại (vàng) ---
    const rimGrad = ctxWheel.createLinearGradient(0,-rOuter,0,rOuter);
    rimGrad.addColorStop(0.00, '#FFF7CC');
    rimGrad.addColorStop(0.30, '#FFD34D');
    rimGrad.addColorStop(0.60, '#E0A72A');
    rimGrad.addColorStop(1.00, '#A87610');

    ctxWheel.beginPath();
    ctxWheel.arc(0,0,rOuter - rimWidth/2, 0, Math.PI*2);
    ctxWheel.strokeStyle = rimGrad;
    ctxWheel.lineWidth = rimWidth;
    ctxWheel.lineCap = 'round';
    ctxWheel.stroke();

    // highlight đỉnh rim (to hơn theo yêu cầu)
    const highlightWidth = rimWidth*0.38;
    const highlightAngle = 0.23*Math.PI;
    ctxWheel.beginPath();
    ctxWheel.arc(0,0,rOuter - rimWidth/2, -highlightAngle, +highlightAngle);
    ctxWheel.strokeStyle='rgba(255,255,255,.68)';
    ctxWheel.lineWidth=highlightWidth;
    ctxWheel.stroke();

    // --- LÁT (3D từng lát) ---
    for(let i=0;i<n;i++){
      const a0=i*arc, a1=a0+arc, mid=a0+arc/2;

      // 1) Base color
      ctxWheel.beginPath();
      ctxWheel.moveTo(0,0);
      ctxWheel.arc(0,0,rFace,a0,a1);
      ctxWheel.closePath();
      ctxWheel.fillStyle = PALETTE[i % PALETTE.length];
      ctxWheel.fill();

      // 2) “Bevel” theo phương tiếp tuyến: trái sáng, phải tối (nhẹ)
      ctxWheel.save();
      ctxWheel.clip();
      const bevel = ctxWheel.createLinearGradient(-rFace,0,rFace,0);
      bevel.addColorStop(0.00,'rgba(255,255,255,.16)');
      bevel.addColorStop(0.50,'rgba(255,255,255,0)');
      bevel.addColorStop(1.00,'rgba(0,0,0,.16)');
      ctxWheel.fillStyle = bevel;
      ctxWheel.fillRect(-rFace,-rFace,rFace*2,rFace*2);
      ctxWheel.restore();

      // 3) Outer highlight ring (mỏng) trong lát → mép ngoài sáng bóng
      ctxWheel.save();
      ctxWheel.clip();
      ctxWheel.beginPath();
      ctxWheel.arc(0,0,rFace-2*dpr,0,Math.PI*2);
      ctxWheel.strokeStyle='rgba(255,255,255,.22)';
      ctxWheel.lineWidth=6*dpr;
      ctxWheel.stroke();
      ctxWheel.restore();

      // 4) Đường chia lát (trắng đậm) để nổi khối
      ctxWheel.beginPath();
      ctxWheel.moveTo(0,0);
      ctxWheel.arc(0,0,rFace,a0,a1);
      ctxWheel.closePath();
      ctxWheel.lineWidth = 2*dpr;
      ctxWheel.strokeStyle = 'rgba(255,255,255,.82)';
      ctxWheel.stroke();

      // 5) Text
      ctxWheel.save();
      ctxWheel.rotate(mid);
      ctxWheel.translate(rFace*0.68,0);
      ctxWheel.rotate(Math.PI/2);
      ctxWheel.fillStyle='#fff';
      ctxWheel.textAlign='center';
      ctxWheel.textBaseline='middle';
      ctxWheel.font=`${Math.round(14*dpr)}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      wrapText(ctxWheel, segments[i].label||`Prize ${i+1}`, 0, 0, rFace*0.52, 18*dpr);
      ctxWheel.restore();
    }

    // 6) Vignette toàn mặt: tâm sáng / rìa tối (chiều sâu tổng thể)
    ctxWheel.save();
    ctxWheel.beginPath(); ctxWheel.arc(0,0,rFace,0,Math.PI*2); ctxWheel.clip();
    const shade = ctxWheel.createRadialGradient(0,0,rFace*0.10, 0,0,rFace);
    shade.addColorStop(0.00,'rgba(255,255,255,.18)');
    shade.addColorStop(0.60,'rgba(255,255,255,0)');
    shade.addColorStop(1.00,'rgba(0,0,0,.28)');
    ctxWheel.fillStyle = shade;
    ctxWheel.fillRect(-rFace,-rFace,rFace*2,rFace*2);
    ctxWheel.restore();

    // --- HUB kim loại ---
    const hub = ctxWheel.createRadialGradient(-rHub*0.35,-rHub*0.35, rHub*0.1, 0,0, rHub);
    hub.addColorStop(0.00,'#ffffff');
    hub.addColorStop(0.25,'#ecf0f5');
    hub.addColorStop(0.62,'#b9c4d1');
    hub.addColorStop(1.00,'#8d97a4');
    ctxWheel.beginPath();
    ctxWheel.arc(0,0,rHub,0,Math.PI*2);
    ctxWheel.fillStyle=hub; ctxWheel.fill();
    ctxWheel.lineWidth=3*dpr; ctxWheel.strokeStyle='rgba(0,0,0,.18)'; ctxWheel.stroke();

    // Gloss ring
    ctxWheel.beginPath();
    ctxWheel.arc(0,0,rHub*0.62,0,Math.PI*2);
    ctxWheel.strokeStyle='rgba(255,255,255,.65)';
    ctxWheel.lineWidth=2*dpr; ctxWheel.stroke();

    ctxWheel.restore();
  }

  function drawFx(){
    const w=cvsFx.width,h=cvsFx.height,cx=w/2,cy=h/2;
    const rOuter=Math.min(cx,cy)-8*dpr;
    const rimWidth=18*dpr;
    const rFace=rOuter - rimWidth*0.8;

    ctxFx.clearRect(0,0,w,h);

    // === Pointer vàng: to hơn, kiểu kim loại, có highlight giữa ===
    ctxFx.save(); ctxFx.translate(cx,cy); ctxFx.rotate(POINTER_ANGLE);

    // Tỷ lệ theo bán kính để “bự hơn”
    const base = Math.max(rFace*0.11, 30*dpr);   // bề ngang gốc (px)
    const tip  = Math.max(rFace*0.09, 36*dpr);   // chiều dài nhô ra (px)

    const grad = ctxFx.createLinearGradient(rFace-6*dpr,-base/2, rFace+tip, base/2);
    grad.addColorStop(0,'#FFF1B3');
    grad.addColorStop(0.5,'#FFD34D');
    grad.addColorStop(1,'#C8901A');

    ctxFx.beginPath();
    ctxFx.moveTo(rFace + tip, 0);      // đỉnh nhọn
    ctxFx.lineTo(rFace - 6*dpr,  base/2);
    ctxFx.lineTo(rFace - 6*dpr, -base/2);
    ctxFx.closePath();
    ctxFx.fillStyle=grad;
    ctxFx.shadowColor='rgba(0,0,0,.35)'; ctxFx.shadowBlur=12*dpr; ctxFx.fill();

    // đường highlight giữa pointer (cho cảm giác bevel)
    ctxFx.beginPath();
    ctxFx.moveTo(rFace + tip - 6*dpr, 0);
    ctxFx.lineTo(rFace - 6*dpr + 2*dpr, 0);
    ctxFx.strokeStyle='rgba(255,255,255,.9)';
    ctxFx.lineWidth=2*dpr;
    ctxFx.stroke();

    ctxFx.restore();

    // Glow nhẹ ở tâm
    ctxFx.beginPath(); ctxFx.arc(cx,cy,rFace*0.25,0,Math.PI*2);
    const glow=ctxFx.createRadialGradient(cx,cy,0,cx,cy,rFace*0.25);
    glow.addColorStop(0,'rgba(255,255,255,.16)');
    glow.addColorStop(1,'rgba(255,255,255,0)');
    ctxFx.fillStyle=glow; ctxFx.fill();
  }

  function drawAll(){ drawWheel(); drawFx(); }

  function wrapText(ctx,text,x,y,maxWidth,lineHeight){
    const words=String(text).split(/\s+/); let line=''; const lines=[];
    for(const w of words){const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxWidth && line){lines.push(line); line=w;} else line=t;}
    if(line) lines.push(line);
    const maxLines=3, startY=y-((Math.min(lines.length,maxLines)-1)*lineHeight)/2;
    for(let i=0;i<Math.min(lines.length,maxLines);i++) ctx.fillText(lines[i],x,startY+i*lineHeight);
  }

  // ===== Audio (degrade an toàn) =====
  async function ensureAudioCtx(){ if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext; if(AC) audioCtx=new AC();} if(audioCtx&&audioCtx.state==='suspended'){try{await audioCtx.resume()}catch{}}}
  async function loadBuffer(url){ try{const r=await fetch(url); if(!r.ok) throw 0; const arr=await r.arrayBuffer(); return await new Promise((res,rej)=>audioCtx.decodeAudioData(arr,res,rej)); }catch{return null}}
  async function initAudio(){ await ensureAudioCtx(); if(!audioCtx) return; if(!whooshBuf) whooshBuf=await loadBuffer('/sfx/whoosh.loop.wav'); if(!tickBuf) tickBuf=await loadBuffer('/sfx/tick.wav'); }
  function playWhoosh(){ if(!audioCtx||!whooshBuf) return; stopWhoosh(); whooshNode=audioCtx.createBufferSource(); whooshNode.buffer=whooshBuf; whooshNode.loop=true; whooshNode.connect(audioCtx.destination); try{whooshNode.start()}catch{} }
  function stopWhoosh(){ if(whooshNode){try{whooshNode.stop()}catch{} whooshNode.disconnect()} whooshNode=null; }
  function playTick(){ if(!audioCtx||!tickBuf) return; const s=audioCtx.createBufferSource(); s.buffer=tickBuf; s.connect(audioCtx.destination); try{s.start()}catch{} }

  // ===== Data =====
  function fallbackSegments(){ return [
    {label:'Voucher 10k'},{label:'Chúc may mắn'},{label:'Voucher 20k'},{label:'Chúc may mắn'},
    {label:'Voucher 50k'},{label:'Chúc may mắn'},{label:'Voucher 100k'},{label:'Chúc may mắn'},
  ];}
  async function getWheel(){ try{const r=await fetch(API_WHEEL,{cache:'no-store'}); if(r.ok){const d=await r.json(); if(Array.isArray(d)&&d.length) return d;} }catch{} return fallbackSegments(); }
  async function postSpin(){ try{const r=await fetch(API_SPIN,{method:'POST'}); if(r.ok){const d=await r.json(); if(typeof d?.index==='number') return d;} }catch{} const i=Math.floor(Math.random()*segments.length); return {index:i,label:segments[i]?.label??''}; }

  // ===== Spin engine (10s) =====
  function setRotation(angle){
    const old=rotation; rotation=angle;
    // tick khi qua ranh
    const n=segments.length; if(n>0){ const arc=(Math.PI*2)/n; const prev=Math.floor(modTau(old)/arc); const curr=Math.floor(modTau(rotation)/arc); if(curr!==prev) playTick(); }
    drawAll();
  }
  function finishSpin(idx){
    isSpinning=false;
    spins=clamp((spins|0)-1,0,99); saveSpins(spins); updateSpinsUI();
    const prize=segments[idx]?.label??''; setStatus(prize?`Bạn trúng: ${prize}`:'Hoàn tất!');
  }
  async function spinToIndex(idx){
    if(isSpinning) return; isSpinning=true; updateSpinsUI(); setStatus('Đang quay...');
    await initAudio(); playWhoosh();

    const n=segments.length, arc=(Math.PI*2)/n;
    const segCenter=idx*arc+arc/2;               // tâm lát
    const needed=modTau(POINTER_ANGLE - segCenter);
    const start=rotation, target=start + EXTRA_TURNS*(Math.PI*2) + needed;
    const t0=performance.now(), dur=SPIN_TOTAL_MS;

    const step=now=>{
      const t=clamp((now-t0)/dur,0,1), e=easeOutCubic(t);
      setRotation(start + (target-start)*e);
      if(t<1) requestAnimationFrame(step); else { stopWhoosh(); finishSpin(idx); }
    };
    requestAnimationFrame(step);
  }

  // ===== Share FB +1 lượt =====
  function openShare(){
    if(loadSharedAwarded()){ setStatus('Bạn đã nhận +1 từ chia sẻ.'); return; }
    const w=window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(SHARE_TARGET_URL),'_blank','width=600,height=500');
    const iv=setInterval(()=>{
      if(!w || w.closed){ clearInterval(iv);
        if(!loadSharedAwarded()){
          spins=clamp(spins+1,0,99); saveSpins(spins); saveSharedAwarded(true);
          updateSpinsUI(); setStatus('Đã cộng +1 lượt nhờ chia sẻ. Chúc bạn may mắn!');
        }
      }
    },600);
  }

  // ===== Init =====
  async function init(){
    segments=await getWheel();

    // khởi tạo lượt: vào trang = 1 (nếu chưa từng có); DEV có thể override
    const stored=loadSpins();
    if(DEV_MODE && Number.isInteger(DEV_SPINS)) spins=DEV_SPINS;
    else spins=Number.isInteger(stored)?stored:1;
    saveSpins(spins);

    updateGreeting(); updateSpinsUI(); setStatus('Sẵn sàng');

    // canvas
    resizeCanvas(); window.addEventListener('resize', resizeCanvas, {passive:true});

    // events
    spinBtn.addEventListener('click', async ()=>{
      if(isSpinning) return;
      if(!loadUser()){ openModal(); setStatus('Vui lòng đăng ký để quay.'); return; }
      if(spins<=0){ setStatus('Bạn đã hết lượt.'); return; }
      await ensureAudioCtx();
      const res=await postSpin();
      const idx=clamp(res.index|0,0,segments.length-1);
      spinToIndex(idx);
    });

    shareBtn.addEventListener('click', openShare);
    regCancel.addEventListener('click', ()=>closeModal());
    regForm.addEventListener('submit', e=>{
      e.preventDefault();
      const name=regNameInp.value.trim(), phone=regPhoneInp.value.trim();
      if(!name||!phone) return;
      saveUser({name,phone}); updateGreeting(); closeModal();
      setStatus('Đăng ký thành công! Bạn có thể quay.');
    });

    // Dev panel
    if(DEV_MODE){
      devPanel.classList.add('show');
      devPanel.addEventListener('click', e=>{
        const act=e.target?.getAttribute('data-act'); if(!act) return;
        if(act==='add') spins=clamp(spins+1,0,999);
        if(act==='zero') spins=0;
        if(act==='reset'){
          localStorage.removeItem(LS_USER);
          localStorage.removeItem(LS_SPINS);
          localStorage.removeItem(LS_SHARED);
          spins=1;
        }
        saveSpins(spins); updateSpinsUI(); updateGreeting(); setStatus('DEV: cập nhật xong');
      });
      window.addEventListener('keydown', ev=>{
        if(ev.key==='='){spins=clamp(spins+1,0,999); saveSpins(spins); updateSpinsUI();}
        if(ev.key==='-'){spins=clamp(spins-1,0,999); saveSpins(spins); updateSpinsUI();}
        if(ev.key==='0'){spins=0; saveSpins(spins); updateSpinsUI();}
        if(ev.key.toLowerCase()==='r'){
          localStorage.removeItem(LS_USER); localStorage.removeItem(LS_SPINS); localStorage.removeItem(LS_SHARED);
          spins=1; saveSpins(spins); updateSpinsUI(); updateGreeting(); setStatus('DEV: reset localStorage');
        }
      });
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
