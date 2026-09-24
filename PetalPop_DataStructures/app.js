
let pythonSession=null, pythonPhotoIds=[], syncingEdit=false, editDebounce=null;
async function dsCall(endpoint,body){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Python server request failed');return data;
}
async function startPythonSession(){
  const result=await dsCall('/api/sessions',{layout:layout[0].replace('×','x'),color,timer:+$('timer').value});
  pythonSession=result.id;pythonPhotoIds=[];return result;
}
function currentEditorState(){return {slots:[...slots],filter,stickers:stickers.map(x=>({...x})),caption:$('editCaption').value}}
function syncEditor(){if(!pythonSession||syncingEdit)return;clearTimeout(editDebounce);editDebounce=setTimeout(async()=>{
  try{const result=await dsCall('/api/sessions/'+pythonSession+'/edit',currentEditorState());$('dsStatus').textContent='Python edit stack: '+result.undo_depth+' undo steps'}
  catch(e){$('dsStatus').textContent='Could not save edit: '+e.message}
},250)}
async function undoPythonEdit(){if(!pythonSession)return;clearTimeout(editDebounce);try{
  syncingEdit=true;const result=await dsCall('/api/sessions/'+pythonSession+'/undo',{});const e=result.editor;
  slots=e.slots;filter=e.filter;stickers=e.stickers;selected=-1;$('editCaption').value=e.caption;
  renderEditor();$('dsStatus').textContent='Python edit stack: '+result.undo_depth+' undo steps';
}catch(error){$('dsStatus').textContent=error.message}finally{syncingEdit=false}}
const $=id=>document.getElementById(id);const layouts=[['1×4',1,4],['2×4',2,4],['2×3',2,3],['1×3',1,3],['2×2',2,2],['3×3',3,3],['1×2',1,2],['3×2',3,2]];let layout=layouts[0],color='#ffc7de',shots=[],slots=[],filter='none',stickers=[],selected=-1,retakes=0,stream=null,facing='user',busy=false,flashOn=false,captureCancelled=false,cameraSession=0,previewRevision=0,torchSupported=false;const colors=['#ffc7de','#f8a5c2','#ffffff','#1f1c24','#d9c3f7','#b8e8d0','#c8dfff','#fff0ad','#f6bca5'];const filterMap={none:'none',bw:'grayscale(1)',vintage:'sepia(.65) contrast(.9)',dreamy:'saturate(1.3) brightness(1.12)',cool:'hue-rotate(20deg) saturate(.8)',warm:'sepia(.25) saturate(1.25)',fade:'contrast(.8) brightness(1.13)',dramatic:'contrast(1.45) saturate(.85)'};function go(page){if(page!=='shoot')captureCancelled=true;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===page));$('progress').textContent=({home:'♡ welcome',setup:'01 / design',shoot:'02 / camera',edit:'03 / decorate',print:'04 / memories'})[page];if(page==='shoot')startCamera();else stopCamera();window.scrollTo(0,0)}document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('start').onclick=()=>go('setup');function total(){return layout[1]*layout[2]}function allowed(){return Math.max(2,Math.ceil(total()/2))}function setupUI(){$('layouts').innerHTML=layouts.map((l,i)=>`<button class="layout-option ${l===layout?'selected':''}" data-layout="${i}"><div class="layout-icon" style="grid-template-columns:repeat(${l[1]},1fr);grid-template-rows:repeat(${l[2]},1fr)">${Array(l[1]*l[2]).fill('<span></span>').join('')}</div><strong>${l[0]}</strong><small>${l[1]*l[2]} photos</small></button>`).join('');document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{layout=layouts[+b.dataset.layout];setupUI()});$('swatches').innerHTML=colors.map(c=>`<button class="swatch ${c===color?'selected':''}" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('');document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;$('customColor').value=color;setupUI()});$('layoutPreview').innerHTML=`<div style="background:${color};padding:8px;display:grid;grid-template-columns:repeat(${layout[1]},15px);gap:3px">${Array(total()).fill('<span style="background:#fff;height:19px"></span>').join('')}</div><span>${layout[0]} · ${total()} photos · ${allowed()} retakes</span>`}$('customColor').oninput=e=>{color=e.target.value;setupUI()};setupUI();$('toCamera').onclick=async()=>{const b=$('toCamera');b.disabled=true;try{await startPythonSession();shots=[];slots=[];imageCache.clear();retakes=allowed();go('shoot');renderShots()}catch(e){alert('Python session could not start: '+e.message)}finally{b.disabled=false}};async function startCamera(){stopCamera();const session=++cameraSession;$('cameraError').classList.add('hidden');if(!navigator.mediaDevices?.getUserMedia){$('cameraError').classList.remove('hidden');return}try{const newStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:960}}});if(session!==cameraSession){newStream.getTracks().forEach(t=>t.stop());return}stream=newStream;$('video').srcObject=stream;await $('video').play();await detectRearTorch();updateFlashButton()}catch(e){$('cameraError').classList.remove('hidden');$('cameraError').firstChild.textContent='Camera access failed. Please allow camera access and open this site over HTTPS or localhost. '}}function stopCamera(){$('selfieFlash').classList.add('hidden');cameraSession++;captureCancelled=true;flashOn=false;torchSupported=false;updateFlashButton();if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$('video').srcObject=null}$('retryCamera').onclick=startCamera;$('flip').onclick=()=>{if(busy)return;facing=facing==='user'?'environment':'user';startCamera()};
async function detectRearTorch(){
  torchSupported=false;
  if(facing!=='environment'||!stream)return;
  const track=stream.getVideoTracks()[0];
  try{torchSupported=!!track.getCapabilities?.().torch}catch(e){}
  // iOS Safari may omit the capability even on phones with a rear LED.
  // A successful constraint application is the only reliable confirmation.
}
function updateFlashButton(){
  const control=$('flash'),status=$('flashStatus');if(!control)return;
  const front=facing==='user',available=!!stream&&(front||torchSupported);
  control.disabled=!available||busy;
  control.value=flashOn&&available?'on':'off';
  if(!stream)status.textContent='Camera not ready';
  else if(front)status.textContent='Front camera: white screen flash '+(flashOn?'On':'Off');
  else if(torchSupported)status.textContent='Rear camera: LED torch '+(flashOn?'On':'Off');
  else status.textContent='Safari has not exposed the rear LED torch. Use your phone flashlight or another supported browser.';
}
$('flash').onchange=async e=>{
  const requested=e.target.value==='on',track=stream?.getVideoTracks()[0];
  if(!track){flashOn=false;updateFlashButton();return}
  if(facing==='user'){flashOn=requested;updateFlashButton();return}
  if(!torchSupported){flashOn=false;updateFlashButton();return}
  try{
    await track.applyConstraints({advanced:[{torch:requested}]});
    flashOn=requested;
  }catch(err){
    flashOn=false;torchSupported=false;
    $('flashStatus').textContent='Rear LED flash is blocked by this browser.';
  }
  updateFlashButton();
};
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function snapPhoto(){const screenFlash=facing==='user'&&flashOn;if(screenFlash){$('selfieFlash').classList.remove('hidden');await wait(180)}const v=$('video');if(!stream||!v.videoWidth){$('selfieFlash').classList.add('hidden');return false}const c=document.createElement('canvas');c.width=900;c.height=1200;const ctx=c.getContext('2d');const sourceW=v.videoWidth,sourceH=v.videoHeight,ratio=.75;let sw=sourceW,sh=sourceH;if(sw/sh>ratio)sw=sh*ratio;else sh=sw/ratio;ctx.save();if(facing==='user'){ctx.translate(c.width,0);ctx.scale(-1,1)}ctx.drawImage(v,(sourceW-sw)/2,(sourceH-sh)/2,sw,sh,0,0,c.width,c.height);ctx.restore();const photo=c.toDataURL('image/jpeg',.9);try{const record=await dsCall('/api/sessions/'+pythonSession+'/capture',{});pythonPhotoIds.push(record.photo_id);shots.push(photo)}catch(e){alert('Could not record photo in Python: '+e.message);if(screenFlash)$('selfieFlash').classList.add('hidden');return false}if(screenFlash){await wait(160);$('selfieFlash').classList.add('hidden')}renderShots();return true}
$('capture').onclick=async()=>{if(busy||shots.length>=total()||!stream||!$('video').videoWidth)return;busy=true;captureCancelled=false;const activeStream=stream;const seconds=+$('timer').value;const count=seconds?total()-shots.length:1;$('capture').disabled=true;$('flip').disabled=true;$('timer').disabled=true;updateFlashButton();try{for(let shot=0;shot<count;shot++){if(captureCancelled||stream!==activeStream)break;if(seconds){$('countdown').classList.remove('hidden');for(let i=seconds;i>0;i--){if(captureCancelled||stream!==activeStream)break;$('countdown').textContent=i;await wait(1000)}$('countdown').classList.add('hidden')}if(captureCancelled||stream!==activeStream)break;if(!await snapPhoto())break}}finally{$('countdown').classList.add('hidden');busy=false;$('flip').disabled=false;$('timer').disabled=false;renderShots();updateFlashButton()}};function renderShots(){$('shotCount').textContent=`${shots.length}/${total()}`;$('shootInfo').textContent=`Take ${total()} photos. You have ${retakes} retakes remaining.`;$('shotGrid').innerHTML=Array.from({length:total()},(_,i)=>`<div class="shot">${shots[i]?`<img src="${shots[i]}" alt="Shot ${i+1}"><button data-retake="${i}" ${retakes<=0?'disabled':''}>↻ Retake</button>`:`<span style="display:grid;place-items:center;height:100%;color:#d68aa9">${i+1}</span>`}</div>`).join('');document.querySelectorAll('[data-retake]').forEach(b=>b.onclick=async()=>{if(retakes<=0||busy)return;const index=+b.dataset.retake;b.disabled=true;try{const record=await dsCall('/api/sessions/'+pythonSession+'/retake',{index});shots.splice(index,1);pythonPhotoIds.splice(index,1);imageCache.clear();retakes=record.session.retakes;renderShots()}catch(e){alert('Retake failed: '+e.message);renderShots()}});$('retakeBar').textContent=`♡ ${retakes} retakes left · Retaking removes the chosen shot. Capture its replacement.`;$('capture').disabled=busy||shots.length>=total();$('toEdit').disabled=shots.length<total()}$('toEdit').onclick=()=>{slots=Array.from({length:total()},(_,i)=>i);$('editCaption').value=$('caption').value;$('editColor').value=color;renderEditor();go('edit');syncEditor()};const emojis=['🎀','🌸','💗','✨','♡','🐰','🧸','🍓','🌷','🦋','💌','⭐','🍒','☁️','🌼','💕'];function renderEditor(){$('slotChoices').innerHTML=slots.map((s,i)=>`<div class="slot-row"><label>Slot ${i+1}</label><select data-slot="${i}">${shots.map((_,j)=>`<option value="${j}" ${j===s?'selected':''}>Photo ${j+1}</option>`).join('')}</select></div>`).join('');document.querySelectorAll('[data-slot]').forEach(el=>el.onchange=()=>{slots[+el.dataset.slot]=+el.value;draw();syncEditor()});$('filters').innerHTML=Object.keys(filterMap).map(k=>`<button data-filter="${k}" class="${filter===k?'selected':''}">${({bw:'B&W',none:'Original'})[k]||k[0].toUpperCase()+k.slice(1)}</button>`).join('');document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.filter===filter));draw();syncEditor()});$('stickerChoices').innerHTML=emojis.map((e,i)=>`<button data-emoji="${i}" title="Add ${e}">${e}</button>`).join('');document.querySelectorAll('[data-emoji]').forEach(b=>b.onclick=()=>{stickers.push({emoji:emojis[+b.dataset.emoji],x:.5,y:.5,size:54});selected=stickers.length-1;renderStickers();syncEditor()});draw()}function dimensions(scale=1){let cols=layout[1],rows=layout[2],gap=+$('spacing').value*scale,pad=24*scale,w=cols*270*scale+(cols-1)*gap+pad*2,h=rows*360*scale+(rows-1)*gap+pad*2+66*scale;return{cols,rows,gap,pad,w,h,pw:270*scale,ph:360*scale,scale}}function filteredPixels(img,key){
  const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
  if(key==='none')return c;
  const pixels=ctx.getImageData(0,0,c.width,c.height),data=pixels.data;
  const clamp=n=>Math.max(0,Math.min(255,n));
  for(let i=0;i<data.length;i+=4){
    let r=data[i],g=data[i+1],b=data[i+2];
    const gray=.299*r+.587*g+.114*b;
    if(key==='bw'){r=g=b=gray}
    else if(key==='vintage'){const rr=.393*r+.769*g+.189*b,gg=.349*r+.686*g+.168*b,bb=.272*r+.534*g+.131*b;r=rr*.7+r*.3;g=gg*.7+g*.3;b=bb*.7+b*.3}
    else if(key==='dreamy'){r=(r-gray)*1.3+gray+20;g=(g-gray)*1.3+gray+20;b=(b-gray)*1.3+gray+20}
    else if(key==='cool'){r=r*.88;g=g*1.02+4;b=b*1.15+10}
    else if(key==='warm'){r=r*1.1+10;g=g*1.03;b=b*.87}
    else if(key==='fade'){r=(r-128)*.8+128+20;g=(g-128)*.8+128+20;b=(b-128)*.8+128+20}
    else if(key==='dramatic'){r=(r-128)*1.45+128;g=(g-128)*1.45+128;b=(b-128)*1.45+128}
    data[i]=clamp(r);data[i+1]=clamp(g);data[i+2]=clamp(b);
  }
  ctx.putImageData(pixels,0,0);return c;
}
const imageCache=new Map();
function loadShot(index){
  if(imageCache.has(index))return imageCache.get(index);
  const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=shots[index]});
  imageCache.set(index,promise);return promise;
}
async function draw(){
  if(!slots.length)return;
  const revision=++previewRevision;
  const d=dimensions(1),c=$('stripCanvas');
  let images;try{images=await Promise.all(slots.map(loadShot))}catch(e){return}
  if(revision!==previewRevision)return;
  c.width=d.w;c.height=d.h;
  const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,d.w,d.h);
  const processed=new Map();
  images.forEach((img,i)=>{
    const shot=slots[i];if(!processed.has(shot))processed.set(shot,filteredPixels(img,filter));
    const x=d.pad+(i%d.cols)*(d.pw+d.gap),y=d.pad+Math.floor(i/d.cols)*(d.ph+d.gap);
    ctx.drawImage(processed.get(shot),x,y,d.pw,d.ph);
  });
  ctx.fillStyle=color.toLowerCase()==='#1f1c24'?'#fff':'#7d4260';ctx.textAlign='center';
  ctx.font='600 22px Fredoka, sans-serif';ctx.fillText($('editCaption').value||'♡',d.w/2,d.h-28);
  renderStickers();
}
function renderStickers(){const layer=$('stickerLayer');layer.innerHTML='';stickers.forEach((s,i)=>{let el=document.createElement('div');el.className='sticker'+(i===selected?' selected':'');el.textContent=s.emoji;el.style.left=(s.x*100)+'%';el.style.top=(s.y*100)+'%';el.style.fontSize=(s.size/2)+'px';el.onpointerdown=e=>{selected=i;renderStickers();const active=layer.children[i];active.setPointerCapture(e.pointerId);active.onpointermove=ev=>{if(ev.buttons===0&&ev.pointerType==='mouse')return;let r=layer.getBoundingClientRect();s.x=Math.max(.02,Math.min(.98,(ev.clientX-r.left)/r.width));s.y=Math.max(.02,Math.min(.98,(ev.clientY-r.top)/r.height));active.style.left=s.x*100+'%';active.style.top=s.y*100+'%';syncEditor()};$('stickerSize').value=s.size};layer.appendChild(el)})}$('stickerSize').oninput=e=>{if(selected<0)return;stickers[selected].size=+e.target.value;renderStickers();syncEditor()};$('removeSticker').onclick=()=>{if(selected<0)return;stickers.splice(selected,1);selected=-1;renderStickers();syncEditor()};$('clearStickers').onclick=()=>{stickers=[];selected=-1;renderStickers();syncEditor()};$('editCaption').oninput=()=>{draw();syncEditor()};$('undoPython').onclick=undoPythonEdit;$('editColor').oninput=e=>{color=e.target.value;draw()};$('spacing').oninput=()=>{if(slots.length)draw()};async function finalRender(){
  const d=dimensions(2),c=document.createElement('canvas');c.width=d.w;c.height=d.h;
  const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,d.w,d.h);
  const imgs=await Promise.all(slots.map(loadShot)),processed=new Map();
  imgs.forEach((img,i)=>{
    const shot=slots[i];if(!processed.has(shot))processed.set(shot,filteredPixels(img,filter));
    const x=d.pad+(i%d.cols)*(d.pw+d.gap),y=d.pad+Math.floor(i/d.cols)*(d.ph+d.gap);
    ctx.drawImage(processed.get(shot),x,y,d.pw,d.ph);
  });
  ctx.fillStyle=color.toLowerCase()==='#1f1c24'?'white':'#7d4260';ctx.textAlign='center';
  ctx.font='600 44px sans-serif';ctx.fillText($('editCaption').value||'♡',d.w/2,d.h-56);
  stickers.forEach(s=>{ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${s.size*2}px 'Apple Color Emoji','Segoe UI Emoji',sans-serif`;ctx.fillText(s.emoji,s.x*d.w,s.y*d.h)});
  return c.toDataURL('image/png');
};
let finished='';$('toPrint').onclick=async()=>{let b=$('toPrint');b.disabled=true;b.textContent='Preparing your photos…';try{finished=await finalRender();$('finalImage').src=finished;go('print')}catch(e){alert('Could not create the strip. Please try again.')}finally{b.disabled=false;b.textContent='Finish →'}};$('download').onclick=async()=>{if(!finished)return;const button=$('download');button.disabled=true;const original=button.textContent;button.textContent='Preparing 300-DPI PNG…';try{const response=await fetch('/api/print-ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:finished,session_id:pythonSession})});if(!response.ok)throw Error('Server unavailable');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='PetalPop_Print_300DPI.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){const a=document.createElement('a');a.href=finished;a.download='PetalPop_Photos.png';a.click();alert('Downloaded your photo. The Python print service was unavailable, so 300-DPI metadata was not added.')}finally{button.disabled=false;button.textContent=original}};$('printBtn').onclick=()=>{if(!finished)return;const w=window.open('','_blank');if(!w){alert('Please allow pop-ups to print, or download your PNG first.');return}w.document.write('<!doctype html><html><head><title>Print PetalPop</title><style>@page{margin:8mm}body{margin:0;display:grid;place-items:center}img{display:block;max-width:100%;max-height:95vh;object-fit:contain}@media print{img{max-height:95vh}}</style></head><body><img id="photo" alt="Photo strip"></body></html>');const img=w.document.getElementById('photo');img.onload=()=>{w.focus();w.print()};img.src=finished;w.document.close()};$('restart').onclick=()=>{shots=[];slots=[];imageCache.clear();stickers=[];selected=-1;filter='none';finished='';go('home')};window.addEventListener('pagehide',stopCamera);
