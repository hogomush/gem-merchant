// ===================== 프로필 (닉네임 + 이모지/사진) — 모든 게임 공용 =====================
const PF_EMOJI=['🐯','🦊','🐻','🐼','🐨','🐸','🐵','🐶','🐱','🐰','🐹','🦁','🐮','🐷','🐔','🐧','🦄','🐲','🐙','🦖','👻','🤖','👽','😎','🤠','🥷','🧙','🎃','⚽','🍀'];
const PF_COLOR=['#ff9f43','#4fa3ff','#5fd38d','#f368e0','#feca57','#ff6b6b','#a29bfe','#1dd1a1','#576574','#e17055'];
function pfLs(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }
function pfEsc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
// 다른 사람이 보낸 프로필은 믿을 수 없으니 모양을 꼭 검사해요
function pfValid(av){
  if(!av||typeof av!=='object') return false;
  if(av.t==='i') return typeof av.d==='string' && av.d.length<60000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(av.d);
  if(av.t==='e') return typeof av.e==='string' && av.e.length>0 && av.e.length<=8 && /^#[0-9a-fA-F]{6}$/.test(av.c||'');
  return false;
}
function pfGet(){
  let av=null; try{ av=JSON.parse(pfLs('gm_av')||'null'); }catch(e){}
  if(!pfValid(av)) av={t:'e',e:'🐯',c:'#ff9f43'};
  return {name:(pfLs('gm_nick')||'').slice(0,10), av};
}
function pfAv(av,size=22,fallbackColor='#888'){
  if(!pfValid(av)) av={t:'e',e:'🙂',c:/^#[0-9a-fA-F]{6}$/.test(fallbackColor)?fallbackColor:'#888'};
  const st=`width:${size}px;height:${size}px;min-width:${size}px`;
  if(av.t==='i') return `<img class="av" alt="" src="${av.d}" style="${st}">`;
  return `<span class="av" style="${st};background:${av.c};font-size:${Math.round(size*.6)}px">${pfEsc(av.e)}</span>`;
}
function pfStyle(){
  if(document.getElementById('pf-css')) return;
  const st=document.createElement('style'); st.id='pf-css';
  st.textContent=`.av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;vertical-align:middle;object-fit:cover;border:2px solid rgba(255,255,255,.85);box-shadow:0 1px 3px rgba(0,0,0,.45);margin-right:5px;line-height:1;box-sizing:border-box;overflow:hidden}
  .who-n{display:inline-flex;align-items:center;max-width:100%}
  .pf-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:flex-end;justify-content:center}
  .pf-sh{background:#221c2d;color:#f3eee6;width:100%;max-width:520px;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));max-height:90vh;overflow:auto;font-family:'Noto Sans KR',sans-serif;border-top:1px solid #3d3450}
  .pf-sh h3{margin:0 0 12px}
  .pf-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .pf-top .av{margin:0;border-width:3px}
  .pf-top input{flex:1;padding:12px;border-radius:10px;border:1px solid #3d3450;background:#2c2539;color:#fff;font-size:16px;font-family:inherit}
  .pf-tabs{display:flex;gap:6px;margin-bottom:10px}
  .pf-tabs button{flex:1;padding:9px;border-radius:9px;border:1px solid #3d3450;background:#2c2539;color:#f3eee6;font-family:inherit;font-weight:700}
  .pf-tabs button.on{background:#e8b923;color:#2a1d00;border-color:#e8b923}
  .pf-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
  .pf-grid button{aspect-ratio:1;border-radius:12px;border:2px solid transparent;background:#2c2539;font-size:24px;cursor:pointer}
  .pf-grid button.on{border-color:#e8b923;background:#3a2f1a}
  .pf-cols{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
  .pf-cols button{width:30px;height:30px;border-radius:50%;border:3px solid transparent;cursor:pointer}
  .pf-cols button.on{border-color:#fff}
  .pf-photo{text-align:center;padding:14px;border:2px dashed #3d3450;border-radius:12px;color:#a99fba;font-size:13px}
  .pf-photo label{display:inline-block;margin-top:8px;padding:10px 16px;border-radius:10px;background:#2c2539;border:1px solid #3d3450;color:#fff;cursor:pointer;font-weight:700}
  .pf-btn{display:block;width:100%;padding:13px;border-radius:10px;border:0;font-size:15px;font-weight:700;background:#e8b923;color:#2a1d00;margin-top:12px;font-family:inherit}
  .pf-btn.sec{background:#2c2539;color:#f3eee6;border:1px solid #3d3450}`;
  document.head.appendChild(st);
}
pfStyle();
function pfShrink(file){ // 사진을 가운데 정사각형으로 잘라 작게 줄여요 (친구에게 보내기 가벼운 크기)
  return new Promise((res,rej)=>{
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=()=>{ const S=112, cv=document.createElement('canvas'); cv.width=S; cv.height=S; const cx=cv.getContext('2d');
      const m=Math.min(img.width,img.height); cx.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S,S);
      let q=.8, d=cv.toDataURL('image/jpeg',q); while(d.length>40000&&q>.3){ q-=.15; d=cv.toDataURL('image/jpeg',q); }
      URL.revokeObjectURL(url); res(d); };
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('사진을 불러오지 못했어요')); };
    img.src=url;
  });
}
function pfOpen(onSave){
  const cur=pfGet(); let av=JSON.parse(JSON.stringify(cur.av)); let tab=av.t==='i'?'i':'e';
  let lastEmoji = av.t==='e' ? av : {t:'e',e:'🐯',c:'#ff9f43'};
  const bg=document.createElement('div'); bg.className='pf-bg';
  function draw(){
    const name=(bg.querySelector('#pf-nick')||{}).value ?? cur.name;
    bg.innerHTML=`<div class="pf-sh"><h3>내 프로필</h3>
      <div class="pf-top"><span id="pf-prev">${pfAv(av,64)}</span><input id="pf-nick" maxlength="10" placeholder="닉네임 (최대 10자)" value="${pfEsc(name)}"></div>
      <div class="pf-tabs"><button data-tab="e" class="${tab==='e'?'on':''}">😀 캐릭터</button><button data-tab="i" class="${tab==='i'?'on':''}">📷 내 사진</button></div>
      ${tab==='e'?`<div class="pf-grid">${PF_EMOJI.map(e=>`<button data-e="${e}" class="${av.t==='e'&&av.e===e?'on':''}">${e}</button>`).join('')}</div>
        <div class="pf-cols">${PF_COLOR.map(c=>`<button data-c="${c}" class="${av.t==='e'&&av.c===c?'on':''}" style="background:${c}"></button>`).join('')}</div>`
      :`<div class="pf-photo">${av.t==='i'?'사진이 설정됐어요. 다른 사진으로 바꿀 수도 있어요.':'갤러리에서 사진을 고르면 가운데 부분을 동그랗게 잘라서 써요.'}<br><label>사진 고르기<input type="file" accept="image/*" id="pf-file" hidden></label><div id="pf-msg" style="margin-top:6px"></div></div>`}
      <button class="pf-btn" id="pf-save">저장</button><button class="pf-btn sec" id="pf-x">닫기</button></div>`;
    bg.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; if(tab==='e'&&av.t!=='e') av=JSON.parse(JSON.stringify(lastEmoji)); draw(); });
    bg.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{ av={t:'e',e:b.dataset.e,c:av.t==='e'?av.c:'#ff9f43'}; lastEmoji=av; draw(); });
    bg.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{ av={t:'e',e:av.t==='e'?av.e:'🐯',c:b.dataset.c}; lastEmoji=av; draw(); });
    const f=bg.querySelector('#pf-file'); if(f) f.onchange=async()=>{ const file=f.files[0]; if(!file) return; const m=bg.querySelector('#pf-msg'); m.textContent='줄이는 중…';
      try{ const d=await pfShrink(file); av={t:'i',d}; draw(); }catch(e){ m.textContent=e.message; } };
    bg.querySelector('#pf-x').onclick=()=>bg.remove();
    bg.querySelector('#pf-save').onclick=()=>{
      const n=bg.querySelector('#pf-nick').value.trim().slice(0,10);
      if(!n){ bg.querySelector('#pf-nick').focus(); bg.querySelector('#pf-nick').placeholder='닉네임을 입력해 주세요!'; return; }
      pfLs('gm_nick',n); pfLs('gm_av',JSON.stringify(av)); bg.remove(); onSave&&onSave(); };
  }
  bg.onclick=e=>{ if(e.target===bg) bg.remove(); };
  draw(); document.body.appendChild(bg);
}
