// ===================== 공통: 유틸 =====================
const $ = s=>document.querySelector(s);
const esc = s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const clone = o=>JSON.parse(JSON.stringify(o));
const rnd = n=>{try{const u=new Uint32Array(1);crypto.getRandomValues(u);return u[0]%n}catch(e){return Math.floor(Math.random()*n)}};
const shuffle = a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function toast(m){const t=$('#toast');if(!t)return;t.innerHTML='<div class="toast">'+esc(m)+'</div>';clearTimeout(toast._t);toast._t=setTimeout(()=>t.innerHTML='',2200)}
const PCOL=['#ff9f43','#4fa3ff','#5fd38d','#f368e0','#feca57','#ff6b6b','#48dbfb','#c8d6e5','#a29bfe','#1dd1a1'];
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

// ===================== 공통: P2P 네트워크 (방장 폰이 서버) =====================
let CFG=null, G=null, room=null, unsub=null;
let peer=null, conns=[], hostConn=null, isHost=false, DOC=null, docListeners=[], acks={}, active=false, netState='';
const myId = lsGet('gm_uid') || (()=>{const v='p'+Math.random().toString(36).slice(2,10);lsSet('gm_uid',v);return v})();
function mergeDeep(a,b){for(const k in b){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==='object')mergeDeep(a[k],b[k]);else a[k]=b[k]}return a}
function mkSnap(){ const d=DOC; return {exists:!!d, data:()=>d}; }
function emitDoc(){ docListeners.slice().forEach(f=>f(mkSnap())); }
function setNet(s){ netState=s; document.querySelectorAll('.net').forEach(el=>el.textContent=s); }
function hostNetText(){ return '방장 · 친구 '+conns.filter(c=>c.open).length+'명 연결'; }
function storeKey(){ return 'gdoc_'+CFG.id+'_'+room; }
function hostApply(m){
  if(m.op==='set'){ if(DOC && m.data && DOC.v!==undefined && m.data.v!==DOC.v+1) return false; DOC=m.data; }
  else if(m.op==='update'){ if(!DOC) return false; mergeDeep(DOC,m.data); }
  else if(m.op==='delete'){ DOC=null; }
  else return false;
  if(room) lsSet(storeKey(), DOC?JSON.stringify(DOC):'');
  conns.forEach(c=>{ if(c.open) c.send({type:'doc',doc:DOC}); });
  emitDoc(); return true;
}
function send(m){
  if(isHost) return hostApply(clone(m)) ? Promise.resolve() : Promise.reject({message:'게임 상태가 바뀌었어요. 다시 시도해 주세요.'});
  if(!hostConn || !hostConn.open) return Promise.reject({message:'방장과 연결이 끊겨 있어요'});
  const rid=Math.random().toString(36).slice(2);
  return new Promise((res,rej)=>{ acks[rid]={res,rej}; hostConn.send({...clone(m),rid});
    setTimeout(()=>{ if(acks[rid]){ delete acks[rid]; rej({message:'응답이 없어요 (방장 연결 확인)'}); } },8000); });
}
const db = { doc:()=>({
  get: async()=>mkSnap(),
  set: d=>send({op:'set',data:d}), update: d=>send({op:'update',data:d}), delete: ()=>send({op:'delete'}),
  onSnapshot: f=>{ docListeners.push(f); setTimeout(()=>f(mkSnap()),0); return ()=>{ docListeners=docListeners.filter(x=>x!==f); }; }
})};
function leaveNet(){ active=false; docListeners=[]; DOC=null; conns=[]; hostConn=null; isHost=false; if(peer){ try{peer.destroy()}catch(e){} peer=null; } }
function peerId(code){ return 'bgm-'+CFG.id+'-v1-'+code; }
function startHost(code, initial){
  leaveNet(); active=true; isHost=true; DOC=initial;
  return new Promise((res,rej)=>{
    let opened=false; peer=new Peer(peerId(code));
    peer.on('open',()=>{ opened=true; setNet(hostNetText()); res(); });
    peer.on('error',e=>{ if(!opened){ leaveNet(); rej(e); } else setNet('연결 문제: '+e.type); });
    peer.on('disconnected',()=>{ if(active){ setNet('서버 재연결 중…'); try{peer.reconnect()}catch(e){} } });
    peer.on('connection',c=>{
      c.on('open',()=>{ conns.push(c); c.send({type:'doc',doc:DOC}); setNet(hostNetText()); });
      c.on('data',m=>{ if(m && m.op){ const ok=hostApply(m); c.send({type:'ack',rid:m.rid,ok}); } });
      c.on('close',()=>{ conns=conns.filter(x=>x!==c); setNet(hostNetText()); });
      c.on('error',()=>{});
    });
  });
}
function startClient(code){
  leaveNet(); active=true; isHost=false;
  return new Promise((res,rej)=>{
    let first=true, timer;
    const fail=msg=>{ if(first){ first=false; clearTimeout(timer); leaveNet(); rej(new Error(msg)); } };
    timer=setTimeout(()=>fail('연결 시간이 초과됐어요. 방 코드와 방장 접속 상태를 확인해 주세요.'),15000);
    peer=new Peer();
    function connect(){
      if(!active||!peer||peer.destroyed) return;
      const c=peer.connect(peerId(code),{reliable:true}); hostConn=c;
      c.on('open',()=>setNet('연결됨'));
      c.on('data',m=>{
        if(m.type==='doc'){ DOC=m.doc; emitDoc(); if(first){ first=false; clearTimeout(timer); res(); } }
        else if(m.type==='ack' && acks[m.rid]){ const a=acks[m.rid]; delete acks[m.rid]; m.ok?a.res():a.rej({message:'게임 상태가 바뀌었어요. 다시 시도해 주세요.'}); }
      });
      c.on('close',()=>{ if(active && hostConn===c){ setNet('방장과 재연결 중…'); setTimeout(connect,3000); } });
      c.on('error',()=>{});
    }
    peer.on('open',connect);
    peer.on('error',e=>{
      if(e.type==='peer-unavailable'){ if(first) fail('그런 방이 없거나 방장이 접속해 있지 않아요.'); else { setNet('방장 기다리는 중…'); setTimeout(connect,4000); } }
      else if(first) fail('연결 실패 ('+e.type+')');
    });
    peer.on('disconnected',()=>{ if(active){ try{peer.reconnect()}catch(e){} } });
  });
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && peer && peer.disconnected && active){ try{peer.reconnect()}catch(e){} } });

// ===================== 공통: 사람·색·로그 =====================
function playersSortedFrom(p){ return Object.entries(p||{}).sort((a,b)=>a[1].joined-b[1].joined).map(x=>x[0]); }
function nameOf(id){ return G?.players?.[id]?.name || '플레이어'; }
function pcol(id){ const list=G?.order||playersSortedFrom(G?.players); const i=list.indexOf(id); return i<0?'#aaa':PCOL[i%PCOL.length]; }
function addLog(d,msg,p){ d.log=(d.log||[]).concat(p?{p,t:msg}:{t:msg}).slice(-40); }
function logHTML(l){
  if(!l.p) return `<div class="sys">${esc(l.t)}</div>`;
  const me=l.p===myId, col=pcol(l.p);
  return `<div class="${me?'mine':''}"><i class="dot" style="background:${col}"></i><b style="color:${col}">${esc(nameOf(l.p))}${me?' (나)':''}</b> ${esc(l.t)}</div>`;
}
function banner(id, text){
  const b=$('#banner'); if(!b) return;
  b.innerHTML=`<div class="bn" style="--pc:${id?pcol(id):'#e8b923'}">${id?`<i class="dot" style="background:${pcol(id)}"></i><b>${esc(nameOf(id))}${id===myId?' (나)':''}</b>`:''} ${esc(text)}</div>`;
  clearTimeout(banner._t); banner._t=setTimeout(()=>b.innerHTML='',2600);
}
function floatAt(el, text, color){
  if(!el) return; const r=el.getBoundingClientRect(); if(!r.width) return;
  const f=document.createElement('div'); f.className='float'; f.textContent=text; f.style.color=color||'#fff';
  f.style.left=(r.left+r.width/2)+'px'; f.style.top=(r.top+Math.min(r.height/2,30))+'px';
  document.body.appendChild(f); setTimeout(()=>f.remove(),1400);
}
function pulseEl(el,col){ if(!el) return; el.style.setProperty('--pc',col||'#fff'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
function shakeEl(el){ if(!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

// ===================== 공통: 모달 =====================
function openModal(html, locked){ $('#modal').innerHTML=`<div class="sheet-bg" id="bg"><div class="sheet">${html}</div></div>`; $('#bg').onclick=e=>{ if(e.target.id==='bg' && !locked) closeModal(); }; }
function closeModal(){ $('#modal').innerHTML=''; }

// ===================== 공통: 홈 / 대기실 =====================
function boot(cfg){
  CFG=cfg; document.title=cfg.title+' — 호섯의 보드게임방';
  if(typeof Peer==='undefined'){ $('#app').innerHTML='<h1>'+esc(cfg.title)+'</h1><div class="card-box">연결 모듈을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</div>'; return; }
  const h=(location.hash||'').replace('#','').toUpperCase();
  if(/^[A-Z]{4}$/.test(h)) lsSet('gm_room_'+cfg.id,h);
  renderHome();
}
function renderHome(err){
  stopListen(); leaveNet(); G=null; room=null; const pn=$('#panel'); if(pn) pn.innerHTML='';
  const nick=lsGet('gm_nick')||''; const last=lsGet('gm_room_'+CFG.id)||'';
  $('#app').innerHTML = `
    <a class="back" href="./">← 게임 목록</a>
    <h1>${esc(CFG.title)}</h1><div class="sub">${esc(CFG.sub)}</div>
    <div class="card-box">
      <label>내 닉네임</label><input id="nick" maxlength="10" value="${esc(nick)}" placeholder="예: 철수">
      <button class="btn" id="mk">새 방 만들기 (내가 방장)</button>
    </div>
    <div class="card-box">
      <label>방 코드로 참가</label>
      <input id="code" maxlength="4" value="${esc(last)}" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:6px;text-align:center">
      <button class="btn sec" id="jn">참가하기</button>
      <div class="err">${esc(err||'')}</div>
    </div>
    <div class="card-box help"><b>규칙 요약</b><ul>${CFG.rules}<li>방장 폰이 게임 서버 역할을 해요. 게임 중엔 방장이 이 화면을 계속 켜 두세요.</li></ul></div>`;
  $('#mk').onclick=()=>createRoom();
  $('#jn').onclick=()=>joinRoom($('#code').value.trim().toUpperCase());
}
function getNick(){ const n=($('#nick')?.value||lsGet('gm_nick')||'플레이어').trim().slice(0,10)||'플레이어'; lsSet('gm_nick',n); return n; }
function busy(msg){ $('#app').innerHTML='<h1>'+esc(CFG.title)+'</h1><div class="sub">'+esc(msg)+'</div>'; }
async function createRoom(){
  const nick=getNick(); const L='ABCDEFGHJKLMNPQRSTUVWXYZ'; busy('방 만드는 중…');
  for(let tries=0;tries<4;tries++){
    let code=''; for(let i=0;i<4;i++) code+=L[rnd(L.length)];
    const data={code, game:CFG.id, host:myId, status:'lobby', v:1, players:{[myId]:{name:nick,joined:Date.now()}}, opts:CFG.defaultOpts?CFG.defaultOpts():{}};
    try{ room=code; await startHost(code,data); lsSet(storeKey(),JSON.stringify(data)); lsSet('gm_hostof_'+CFG.id,code); return enterRoom(code); }
    catch(e){ room=null; if(e.type!=='unavailable-id') return renderHome('방 만들기 실패: 인터넷 연결을 확인해 주세요 ('+(e.type||e.message)+')'); }
  }
  renderHome('방 코드를 만들지 못했어요. 다시 시도해 주세요.');
}
async function joinRoom(code){
  if(!/^[A-Z]{4}$/.test(code)) return renderHome('4글자 방 코드를 입력해 주세요.');
  const nick=getNick();
  room=code; const saved=lsGet(storeKey()); room=null;
  if(saved && lsGet('gm_hostof_'+CFG.id)===code){
    busy('내 방을 다시 여는 중…');
    try{ room=code; await startHost(code, JSON.parse(saved)); return enterRoom(code); }
    catch(e){ room=null; return renderHome(e.type==='unavailable-id'?'잠시 후 다시 시도해 주세요 (이전 연결이 아직 남아 있어요).':'방 다시 열기 실패 ('+(e.type||e.message)+')'); }
  }
  busy('방장에게 연결 중…');
  try{ room=code; await startClient(code); }catch(e){ room=null; return renderHome(e.message); }
  const d=DOC; if(!d) return renderHome('그런 방이 없어요.');
  if(!d.players?.[myId]){
    if(d.status!=='lobby') return renderHome('이미 시작한 게임이에요.');
    if(Object.keys(d.players||{}).length>=CFG.max) return renderHome(`방이 꽉 찼어요 (최대 ${CFG.max}명).`);
    try{ await db.doc().update({players:{[myId]:{name:nick,joined:Date.now()}}}); }catch(e){ return renderHome('참가 실패: '+e.message); }
  }
  enterRoom(code);
}
function stopListen(){ if(unsub){unsub();unsub=null} }
function enterRoom(code){
  stopListen(); room=code; lsSet('gm_room_'+CFG.id,code);
  try{ history.replaceState(null,'',location.pathname+'#'+code); }catch(e){}
  unsub=db.doc().onSnapshot(s=>{
    if(!s.exists){ renderHome('방이 닫혔어요.'); return; }
    const prev=G; G=clone(s.data());
    if(G.status==='lobby') return renderLobby();
    CFG.render(prev);
    if(prev && prev.status==='lobby' && G.status==='playing') showOrder();
  });
}
function renderLobby(){
  const pn=$('#panel'); if(pn) pn.innerHTML='';
  const ids=playersSortedFrom(G.players); const host=G.host===myId;
  const link=location.origin+location.pathname+'#'+G.code;
  $('#app').innerHTML=`
    <h1>${esc(CFG.title)}</h1>
    <div class="card-box" style="text-align:center">
      <div class="muted">친구에게 코드나 초대 링크를 보내 주세요</div>
      <div class="code">${esc(G.code)}</div>
      <div class="row"><button class="btn sec" id="cp" style="margin:0">코드 복사</button><button class="btn" id="cl" style="margin:0">초대 링크 복사</button></div>
    </div>
    <div class="card-box"><b>참가자 ${ids.length}/${CFG.max}</b> <span class="tiny net">${esc(netState)}</span>
      <div class="plist">${ids.map((id,i)=>`<div style="--pc:${PCOL[i%PCOL.length]}"><span>${esc(G.players[id].name)}${id===myId?' (나)':''}</span><span class="pill">${id===G.host?'방장':'대기'}</span></div>`).join('')}</div>
      ${CFG.lobbyOpts?CFG.lobbyOpts(G,host):''}
      <div class="muted" style="margin-top:8px">🎲 차례 순서는 시작할 때 랜덤으로 정해져요.</div>
      ${host?`<button class="btn" id="st" ${ids.length<CFG.min?'disabled':''}>게임 시작</button>
        <div class="muted" style="margin-top:6px">${ids.length<CFG.min?CFG.min+'명 이상 모이면 시작할 수 있어요.':''}</div>
        <div class="muted" style="margin-top:8px">⚠️ 당신 폰이 게임 서버예요. 게임이 끝날 때까지 이 화면을 켜 두세요. (나가면 방이 닫혀요)</div>`
           :`<div class="muted" style="margin-top:10px">방장이 시작하기를 기다리는 중…</div>`}
      <button class="btn sec" id="lv">나가기</button>
    </div>`;
  $('#cp').onclick=async()=>{ try{ await navigator.clipboard.writeText(G.code); toast('코드를 복사했어요'); }catch(e){ toast('코드: '+G.code) } };
  $('#cl').onclick=async()=>{ try{ await navigator.clipboard.writeText(link); toast('초대 링크를 복사했어요. 단톡방에 붙여 넣으세요!'); }catch(e){ toast(link) } };
  $('#lv').onclick=leaveLobby;
  if(host){
    $('#st') && ($('#st').onclick=startGame);
    document.querySelectorAll('[data-opt]').forEach(el=>el.onclick=async()=>{
      const [k,v]=el.dataset.opt.split('='); const val=isNaN(+v)?(v==='true'?true:v==='false'?false:v):+v;
      try{ await db.doc().update({opts:{[k]:val}}); }catch(e){ toast(e.message) }
    });
  }
}
function optButtons(G,host,key,choices){ // choices: [[value,label,desc],...]
  return `<div class="row">${choices.map(([v,l,s])=>`<button class="mode ${G.opts?.[key]===v?'on':''}" data-opt="${key}=${v}" ${host?'':'disabled'}><b>${l}</b><span>${s||''}</span></button>`).join('')}</div>`;
}
async function leaveLobby(){
  if(G.status==='lobby' && G.players[myId]){
    const p=clone(G.players); delete p[myId];
    try{
      if(isHost){ await db.doc().delete(); lsSet('gm_hostof_'+CFG.id,''); }
      else { const d=clone(G); d.players=p; d.v++; await db.doc().set(d); }
    }catch(e){}
  }
  lsSet('gm_room_'+CFG.id,''); try{ history.replaceState(null,'',location.pathname); }catch(e){}
  renderHome();
}
async function startGame(){
  const d=clone(DOC); const ids=shuffle(playersSortedFrom(d.players));
  if(ids.length<CFG.min) return toast(CFG.min+'명 이상 필요해요');
  d.order=ids; d.status='playing'; d.turn=0; d.round=1; d.last=null;
  d.log=[{t:'🎲 순서 랜덤 결정: '+ids.map(i=>d.players[i].name).join(' → ')}];
  CFG.setup(d);
  d.v=(d.v||0)+1;
  try{ await db.doc().set(d); }catch(e){ toast('시작 실패: '+e.message) }
}
async function commit(d){
  try{
    const cur=DOC;
    if(!cur || cur.v!==G.v){ toast('게임 상태가 바뀌었어요. 다시 시도해 주세요.'); return false; }
    d.v=(G.v||0)+1;
    await db.doc().set(d); return true;
  }catch(e){ toast('전송 실패: '+(e.message||e.code)); return false; }
}
async function restartToLobby(){
  const d=clone(G);
  const keep={code:d.code,game:d.game,host:d.host,status:'lobby',v:(d.v||0)+1,players:d.players,opts:d.opts||{}};
  try{ await db.doc().set(keep); }catch(e){ toast(e.message) }
}
function showOrder(){
  const el=document.createElement('div'); el.className='order-pop';
  el.innerHTML=`<div class="op-in"><div class="op-t">🎲 순서 결정!</div>${G.order.map((id,i)=>`<div class="op-r" style="--pc:${pcol(id)};animation-delay:${.35+i*.35}s"><b>${i+1}</b> ${esc(nameOf(id))}${id===myId?' (나)':''}</div>`).join('')}<div class="tiny" style="margin-top:8px">탭하면 닫혀요</div></div>`;
  el.onclick=()=>el.remove(); document.body.appendChild(el);
  setTimeout(()=>el.remove(),1600+G.order.length*350);
}
function openMenu(extra=''){
  const host=G.host===myId;
  openModal(`<h3>메뉴</h3>
    <div class="muted">방 코드: <b style="color:var(--accent)">${esc(G.code)}</b> · <span class="net">${esc(netState)}</span></div>
    <div class="help"><ul>${CFG.rules}</ul></div>
    ${extra}
    ${host&&G.status==='playing'?'<button class="btn sec" id="m-rst">게임 그만하고 대기실로</button>':''}
    <button class="btn sec" id="m-out">${isHost?'방 나가기 (같은 폰에서 코드로 다시 열 수 있어요)':'방 나가기 (코드로 다시 참가 가능)'}</button>
    <button class="btn" id="m-cl">닫기</button>`);
  $('#m-cl').onclick=closeModal;
  $('#m-out').onclick=()=>{ closeModal(); try{history.replaceState(null,'',location.pathname)}catch(e){} renderHome(); };
  $('#m-rst')&&($('#m-rst').onclick=()=>{ closeModal(); restartToLobby(); });
}
function endBoxHTML(rows){
  return `<div class="card-box"><div style="font-size:22px;font-weight:800;color:var(--accent);text-align:center">🏆 ${esc(nameOf(rows[0].id))} 우승!</div>
    ${rows.map((r,i)=>`<div class="row" style="justify-content:space-between;margin-top:6px"><span style="color:${pcol(r.id)}">${i+1}. ${esc(nameOf(r.id))}${r.id===myId?' (나)':''}</span><span class="tiny">${esc(r.txt)}</span></div>`).join('')}
    ${G.host===myId?'<button class="btn" id="again">같은 멤버로 다시 하기</button>':'<div class="muted" style="margin-top:8px">방장이 다시 시작할 수 있어요.</div>'}
    <a class="btn sec" href="./" style="text-align:center;text-decoration:none">게임 목록으로</a></div>`;
}
