(function(){
const $=id=>document.getElementById(id);
const uzone=$('uzone'),finput=$('finput'),egrid=$('egrid'),sgrid=$('sgrid'),tbar=$('tbar'),soundInput=$('soundInput');
const genbtn=$('genbtn'),phint=$('phint'),pcanvas=$('pcanvas'),pwrap=$('pwrap'),pover=$('pover');
const ebadge=$('ebadge'),sbadge=$('sbadge'),toast=$('toast'),dhint=$('dhint');
const ctx=pcanvas.getContext('2d',{willReadFrequently:true});

let uploadedImage=null,selectedEffects=[],selectedSound=null,selectedSoundName='',isGenerating=false;
let activeTab=EMBEDDED_CATS[0]||'';
let activeFxCat='动态'; // 当前特效分类tab
// 本地音效存储
const localSoundData={};
// 实时预览状态
let previewRAF=null,previewFR=null,isPreviewRunning=false,previewStartTime=0;
const PREVIEW_CYCLE_MS=2000;
let playingAudio=null; // 音效预览播放器(互斥)
let effectSpeed=1.0,soundSpeed=1.0; // 特效/音效倍速
// 使用次数追踪(localStorage)
const USE_KEY='meme_use_count',DONATE_KEY='meme_donate_shown';
let useCount=parseInt(localStorage.getItem(USE_KEY)||'0');
const sdur={};
const TRY_MIMES=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];

const cicons={};
EMBEDDED_CATS.forEach((c,i)=>cicons[c]=['🎭','🔔','🔥','💬','🎵','🎶','💥','⭐','🎯','📢'][i%10]);
function cicon(c){return cicons[c]||'🔊'}

// ★ 可靠的音效时长获取: dataUrl → blob → objectURL → Audio
async function getRealDuration(dataUrl){
  try{
    const resp=await fetch(dataUrl);
    if(!resp.ok)return null;
    const blob=await resp.blob();
    const blobUrl=URL.createObjectURL(blob);
    const a=new Audio(blobUrl);a.volume=0;
    const dur=await new Promise(resolve=>{
      const cleanup=()=>{try{URL.revokeObjectURL(blobUrl);}catch(e){}};
      a.addEventListener('loadedmetadata',()=>{const d=a.duration;cleanup();resolve(isFinite(d)&&d>0.05?d:null);},{once:true});
      a.addEventListener('error',()=>{cleanup();resolve(null);},{once:true});
      setTimeout(()=>{cleanup();resolve(null);},6000);
    });
    if(a){try{a.pause();a.src='';}catch(e){}}
    return dur;
  }catch(e){return null;}
}

// ============ 音效 UI ============
function buildTabs(){
  tbar.innerHTML='';
  EMBEDDED_CATS.forEach(c=>{
    const b=document.createElement('button');b.className='tbtn'+(c===activeTab?' act':'');
    b.innerHTML=cicon(c)+' '+c+' <span class="cnt">('+(EMBEDDED_SOUNDS[c]||[]).length+')</span>';
    b.addEventListener('click',()=>{activeTab=c;buildTabs();renderSounds();});
    tbar.appendChild(b);
  });
}
function renderSounds(){
  sgrid.innerHTML='';
  (EMBEDDED_SOUNDS[activeTab]||[]).forEach(s=>{
    const d=sdur[s.name];
    let ds='';
    if(d===null||d===undefined)ds='⏳';
    else if(d>0)ds=(d>=1?d.toFixed(1)+'s':(d*1000).toFixed(0)+'ms');
    else ds='?';
    const el=document.createElement('div');el.className='scard';
    el.innerHTML='<div class="sicon">🔊</div><div class="slabel">'+s.name+'</div><div class="sdur">'+ds+'</div>';
    el.addEventListener('click',()=>selectSound(s.name,s.data,el));
    if(selectedSoundName===s.name)el.classList.add('sel');
    sgrid.appendChild(el);
  });
}
async function selectSound(name,dataUrl,el){
  if(isGenerating)return;
  selectedSound=dataUrl;selectedSoundName=name;
  sgrid.querySelectorAll('.scard').forEach(c=>c.classList.remove('sel'));
  if(el)el.classList.add('sel');
  sbadge.textContent='已选: '+name;sbadge.style.background='rgba(160,180,224,.15)';sbadge.style.color='#a0b4e0';sbadge.style.borderColor='rgba(160,180,224,.25)';
  if(playingAudio){try{playingAudio.pause();playingAudio.currentTime=0;}catch(e){}playingAudio=null;}
  try{
    const a=new Audio(dataUrl);a.volume=0.7;a.playbackRate=soundSpeed;playingAudio=a;
    a.play().catch(()=>{});
    a.addEventListener('ended',()=>{if(playingAudio===a)playingAudio=null;});
    a.addEventListener('error',()=>{if(playingAudio===a){playingAudio=null;toastMsg('⚠️ 音效解码失败，请尝试其他音效',true);}});
  }catch(e){playingAudio=null;toastMsg('⚠️ 音效播放失败',true);}
  if(sdur[name]===null||sdur[name]===undefined){
    sdur[name]=null;
    renderSounds();
    try{
      const dur=await getRealDuration(dataUrl);
      sdur[name]=dur||0;
    }catch(e){
      sdur[name]=0;
      console.warn('音效时长获取失败: '+name);
    }
    renderSounds();
  }
  updateDhint();
}
function updateDhint(){
  const d=sdur[selectedSoundName];
  if(d&&d>0)dhint.textContent='⏱ 音效时长 '+d.toFixed(1)+' 秒，视频将匹配该时长';
  else if(d===null||d===undefined)dhint.textContent='⏱ 正在获取音效时长…';
  else dhint.textContent='⚠️ 未能获取音效时长，将使用默认3秒';
}

// ============ 特效注册表 ============
// 新增特效只需在此数组中添加一个对象即可
// {k:'key', i:'图标', l:'名称', cat:'分类', fn:'FR方法名'}
const FX_CATEGORIES=['动态','滤镜','装饰'];
const effects=[
  // ──── 动态 (canvas变换/数学动画) ────
  {k:'wave',i:'〰️',l:'波浪扭曲',cat:'动态',fn:'_wv'},
  {k:'fisheye',i:'🔍',l:'鱼眼放大',cat:'动态',fn:'_fe'},
  {k:'swirl',i:'🌀',l:'漩涡扭曲',cat:'动态',fn:'_sw'},
  {k:'mosaic',i:'🟫',l:'马赛克流动',cat:'动态',fn:'_ms'},
  {k:'zoomIn',i:'💥',l:'突入',cat:'动态',fn:'_zi'},
  {k:'shake',i:'📳',l:'抖动',cat:'动态',fn:'_sh'},
  {k:'flipH',i:'🪞',l:'水平翻转',cat:'动态',fn:'_fh'},
  {k:'flipV',i:'🔃',l:'垂直翻转',cat:'动态',fn:'_fv'},
  {k:'rotate',i:'🔄',l:'旋转',cat:'动态',fn:'_rt'},
  {k:'bounceIn',i:'🏀',l:'弹入弹出',cat:'动态',fn:'_bi'},
  {k:'swing',i:'🔔',l:'摇摆',cat:'动态',fn:'_sg'},
  {k:'ripple',i:'💧',l:'水波纹',cat:'动态',fn:'_rp'},
  {k:'mirror',i:'🪞',l:'镜面反射',cat:'动态',fn:'_mr'},
  {k:'slideIn',i:'🚪',l:'滑入',cat:'动态',fn:'_si'},
  {k:'whiplash',i:'💫',l:'甩尾',cat:'动态',fn:'_wh'},
  // ──── 滤镜 (像素级处理) ────
  {k:'bw',i:'⬛',l:'黑白',cat:'滤镜',fn:'_bw'},
  {k:'negative',i:'🔄',l:'负片',cat:'滤镜',fn:'_neg'},
  {k:'warm',i:'☀️',l:'暖阳',cat:'滤镜',fn:'_warm'},
  {k:'cyberpunk',i:'🌆',l:'赛博朋克',cat:'滤镜',fn:'_cy'},
  {k:'vintage',i:'📽️',l:'复古胶片',cat:'滤镜',fn:'_vin'},
  {k:'pixelate',i:'🧱',l:'像素化',cat:'滤镜',fn:'_px'},
  {k:'blur',i:'💨',l:'毛玻璃',cat:'滤镜',fn:'_bl'},
  {k:'edgeGlow',i:'✨',l:'突出',cat:'滤镜',fn:'_eg'},
  {k:'chromatic',i:'🌈',l:'RGB分离',cat:'滤镜',fn:'_ch'},
  {k:'emboss',i:'🗿',l:'浮雕',cat:'滤镜',fn:'_em'},
  {k:'oilPaint',i:'🖼️',l:'油画',cat:'滤镜',fn:'_op'},
  {k:'sepia',i:'🟤',l:'老照片',cat:'滤镜',fn:'_sp'},
  {k:'posterize',i:'🎨',l:'海报化',cat:'滤镜',fn:'_pt'},
  {k:'solarize',i:'☢️',l:'曝光过度',cat:'滤镜',fn:'_sz'},
  {k:'comic',i:'💥',l:'漫画风',cat:'滤镜',fn:'_cm'},
  {k:'sketch',i:'✏️',l:'素描',cat:'滤镜',fn:'_sk'},
  {k:'neon',i:'💡',l:'霓虹灯',cat:'滤镜',fn:'_nn'},
  {k:'thermal',i:'🌡️',l:'热成像',cat:'滤镜',fn:'_th'},
  {k:'glitch',i:'📺',l:'故障艺术',cat:'滤镜',fn:'_gl'},
  {k:'duotone',i:'🎭',l:'双色调',cat:'滤镜',fn:'_dt'},
  // ──── 装饰 (叠加/合成) ────
  {k:'vignette',i:'🌑',l:'暗角',cat:'装饰',fn:'_vg'},
  {k:'scanlines',i:'📺',l:'扫描线',cat:'装饰',fn:'_sl'},
  {k:'noise',i:'📡',l:'噪点',cat:'装饰',fn:'_ns'},
  {k:'filmGrain',i:'🎞️',l:'胶片颗粒',cat:'装饰',fn:'_fg'},
  {k:'glowPulse',i:'🌟',l:'光晕脉动',cat:'装饰',fn:'_gp'},
  {k:'flash',i:'📸',l:'闪光灯',cat:'装饰',fn:'_fl'},
  {k:'gradientMap',i:'🌅',l:'渐变映射',cat:'装饰',fn:'_gm'},
  {k:'lensFlare',i:'🔆',l:'镜头耀斑',cat:'装饰',fn:'_lf'},
  {k:'dreamBlur',i:'🌫️',l:'梦幻柔焦',cat:'装饰',fn:'_db'},
  {k:'frosted',i:'🧊',l:'毛边边框',cat:'装饰',fn:'_fr'},
];
// 构建 key → effect 快速查找表
const _effectMap={};
effects.forEach(e=>{_effectMap[e.k]=e;});

// ============ 特效 UI ============
function getFxByCat(cat){return effects.filter(e=>e.cat===cat);}
function buildEffectTabs(){
  let bar=document.getElementById('eftabs');
  if(!bar){
    bar=document.createElement('div');bar.id='eftabs';
    egrid.parentNode.insertBefore(bar,egrid);
  }
  bar.innerHTML='';
  FX_CATEGORIES.forEach(cat=>{
    const count=getFxByCat(cat).length;
    const b=document.createElement('button');
    b.className='tbtn'+(cat===activeFxCat?' act':'');
    b.textContent=cat+' ('+count+')';
    b.addEventListener('click',()=>{activeFxCat=cat;buildEffectTabs();buildEffects();});
    bar.appendChild(b);
  });
}
function buildEffects(){
  egrid.innerHTML='';
  getFxByCat(activeFxCat).forEach(e=>{
    const c=document.createElement('div');c.className='ecard';c.dataset.k=e.k;
    c.innerHTML='<div class="eicon">'+e.i+'</div><div class="elabel">'+e.l+'</div>';
    c.addEventListener('click',()=>selectEffect(e.k,c));
    if(selectedEffects.includes(e.k)){c.classList.add('sel');setTimeout(()=>c.classList.remove('sel'),400);}
    egrid.appendChild(c);
  });
  // 更新标题中的特效总数（不动 ebadge 元素）
  const stitle=egrid.parentNode.querySelector('.stitle');
  if(stitle){
    const icon=stitle.querySelector('.icon');
    if(icon){
      const total=effects.length;
      // 保留 icon 和 badge，只更新中间文本
      icon.nextSibling.textContent=' 选择特效('+total+'种) ';
    }
  }
}
function selectEffect(k,el){
  if(isGenerating)return;
  // 双击=叠加
  if(el._clicked){
    clearTimeout(el._timer);el._clicked=false;
    el.classList.remove('pending');
    if(selectedEffects.includes(k)){toastMsg('该特效已在列表中',true);return;}
    selectedEffects.push(k);
    el.classList.add('sel');setTimeout(()=>el.classList.remove('sel'),300);
    ebadge.textContent='已叠加: '+selectedEffects.length+'个';
    ebadge.style.background='rgba(160,180,224,.15)';ebadge.style.color='#a0b4e0';ebadge.style.borderColor='rgba(160,180,224,.25)';vibrate([20,10,20]);
    renderStackBar();
    if(uploadedImage)startLivePreview();
    return;
  }
  // 单击=预览
  el._clicked=true;
  el.classList.add('pending');
  el._timer=setTimeout(()=>{
    el._clicked=false;el.classList.remove('pending');
    selectedEffects=[k];
    const ef=effects.find(e=>e.k===k);
    ebadge.textContent='预览: '+(ef?ef.l:k);
    ebadge.style.background='rgba(160,180,224,.15)';ebadge.style.color='#a0b4e0';ebadge.style.borderColor='rgba(160,180,224,.25)';vibrate(15);
    renderStackBar();
    if(uploadedImage)startLivePreview();
    else phint.textContent='📷 请先上传图片以预览特效';
  },250);
}
function removeStackedEffect(index){
  selectedEffects.splice(index,1);
  ebadge.textContent=selectedEffects.length?'已叠加: '+selectedEffects.length+'个':'未选';
  if(!selectedEffects.length)ebadge.style.background='';ebadge.style.color='';ebadge.style.borderColor='';
  renderStackBar();
  if(uploadedImage)startLivePreview();
}
function clearAllEffects(){
  selectedEffects=[];
  ebadge.textContent='未选';ebadge.style.background='';ebadge.style.color='';ebadge.style.borderColor='';
  renderStackBar();
  if(uploadedImage)startLivePreview();
  toastMsg('已清空全部特效');
}
function renderStackBar(){
  let bar=document.getElementById('stackbar');
  if(!bar){
    bar=document.createElement('div');bar.id='stackbar';
    bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;background:var(--c);border-radius:12px;margin:0 0 8px;align-items:center';
    egrid.parentNode.insertBefore(bar,egrid);
    const hint=document.createElement('div');hint.id='fxhint';
    hint.style.cssText='text-align:center;font-size:10px;color:var(--t3);margin-bottom:6px';
    hint.textContent='💡 单击预览 · 双击叠加 · 切换分类选择更多特效';
    egrid.parentNode.insertBefore(hint,egrid);
  }
  if(!selectedEffects.length){
    bar.innerHTML='<span style="color:var(--t3);font-size:12px;font-weight:600;width:100%;text-align:center">👆 单击预览 / 双击叠加 · 双击下方特效卡片添加</span>';
    return;
  }
  bar.innerHTML=selectedEffects.map((k,i)=>{
    const ef=effects.find(e=>e.k===k)||{i:'?',l:k};
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:#3a3a3a;padding:4px 6px 4px 10px;border-radius:20px;font-size:12px;font-weight:700;color:#e0e0e0;border:1px solid #555">'+ef.i+' '+ef.l+'<button data-ri="'+i+'" style="width:20px;height:20px;border-radius:50%;border:none;background:#555;color:#ccc;cursor:pointer;font-size:12px;line-height:1;padding:0;transition:all .15s" onmouseover="this.style.background=\'#FF6B6B\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#555\';this.style.color=\'#ccc\'">✕</button></span>';
  }).join('')+'<button id="clear-all-fx" style="margin-left:auto;padding:5px 12px;border-radius:14px;border:1.5px dashed var(--a);background:transparent;color:var(--a);font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap" onmouseover="this.style.background=\'var(--a)\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'var(--a)\'">🗑 清空</button>';
  bar.querySelectorAll('button[data-ri]').forEach(b=>{
    b.addEventListener('click',e=>{e.stopPropagation();removeStackedEffect(parseInt(b.dataset.ri));});
  });
  const clr=bar.querySelector('#clear-all-fx');
  if(clr)clr.addEventListener('click',e=>{e.stopPropagation();clearAllEffects();});
}

// ============ 图片 ============
uzone.addEventListener('click',e=>{if(isGenerating)return;if(uploadedImage&&e.target.tagName==='IMG')return;finput.click();});
finput.addEventListener('change',()=>{const f=finput.files[0];if(f)loadImage(f);finput.value='';});
uzone.addEventListener('dragover',e=>{e.preventDefault();if(!isGenerating)uzone.classList.add('drag-over');});
uzone.addEventListener('dragleave',()=>uzone.classList.remove('drag-over'));
uzone.addEventListener('drop',e=>{e.preventDefault();uzone.classList.remove('drag-over');if(isGenerating)return;const f=e.dataTransfer.files[0];if(f)loadImage(f);});

function loadImage(file){
  // 1. 格式校验
  if(!file.type.match(/image\/(jpeg|png)/)){toastMsg('格式不支持，请上传 JPG 或 PNG 图片',true);return;}
  // 2. 文件大小校验 (最大 20MB)
  if(file.size>20*1024*1024){toastMsg('图片太大了，请上传小于 20MB 的图片',true);return;}
  const r=new FileReader();
  r.onerror=()=>{toastMsg('文件读取失败，可能已损坏，请换一张图片试试',true);};
  r.onload=e=>{
    const img=new Image();
    img.onerror=()=>{toastMsg('图片解码失败，文件可能已损坏',true);};
    img.onload=()=>{uploadedImage=img;uzone.innerHTML='';uzone.classList.add('has-image');
      const t=document.createElement('img');t.src=e.target.result;uzone.appendChild(t);
      const tip=document.createElement('div');tip.className='ctip';tip.textContent='点击更换';uzone.appendChild(tip);
      setupCanvas();ctx.drawImage(img,0,0,pcanvas.width,pcanvas.height);
      pwrap.classList.add('on');pover.classList.add('off');updateGenBtn();toastMsg('图片已就绪 ✅');
          if(selectedEffects.length)startLivePreview();
    };img.src=e.target.result;
  };r.readAsDataURL(file);
}
function resetUzone(){
  uzone.classList.remove('has-image');
  uzone.innerHTML='<div class="uicon">📷</div><div class="utext">点这里上传图片</div><div class="uhint">或拖拽图片到这里 · JPG/PNG</div><input type="file" accept="image/jpeg,image/png" style="display:none">';
  const ni=uzone.querySelector('input');ni.addEventListener('change',()=>{const f=ni.files[0];if(f)loadImage(f);ni.value='';});
  uploadedImage=null;updateGenBtn();
}
let lpt;uzone.addEventListener('touchstart',()=>{if(!uploadedImage||isGenerating)return;lpt=setTimeout(()=>{if(confirm('换一张图片？'))resetUzone();},800);});
uzone.addEventListener('touchend',()=>clearTimeout(lpt));uzone.addEventListener('touchmove',()=>clearTimeout(lpt));
uzone.addEventListener('contextmenu',e=>{if(uploadedImage){e.preventDefault();if(confirm('换一张图片？'))resetUzone();}});

function setupCanvas(){
  if(!uploadedImage)return;const max=600;
  let w=uploadedImage.naturalWidth,h=uploadedImage.naturalHeight;
  if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.floor(w*r);h=Math.floor(h*r);}
  pcanvas.width=w;pcanvas.height=h;
}

// ============ 实时预览 ============
function stopLivePreview(){
  isPreviewRunning=false;
  if(previewRAF){cancelAnimationFrame(previewRAF);previewRAF=null;}
  previewFR=null;
}
function startLivePreview(){
  if(!uploadedImage||isGenerating)return;
  stopLivePreview();
  setupCanvas();
  previewFR=new FR(uploadedImage,selectedEffects,pcanvas,ctx);
  previewStartTime=performance.now();
  isPreviewRunning=true;
  pwrap.classList.add('on');pover.classList.add('off');
  const cycle=PREVIEW_CYCLE_MS/effectSpeed;
  phint.textContent='\u{1F441} 实时预览中 ('+(effectSpeed).toFixed(1)+'x)';
  function frame(now){
    if(!isPreviewRunning||isGenerating)return;
    const p=((now-previewStartTime)%cycle)/cycle;
    previewFR.cc();previewFR.r(p);
    previewRAF=requestAnimationFrame(frame);
  }
  previewRAF=requestAnimationFrame(frame);
}

// ============ 帧渲染器 FR (40种特效) ============
class FR{
  constructor(img,eks,canvas,ctx){
    this.img=img;this.eks=Array.isArray(eks)?eks:(eks?[eks]:[]);
    this.c=canvas;this.ctx=ctx;this.w=canvas.width;this.h=canvas.height;
    this.cx=this.w/2;this.cy=this.h/2;this.mr=Math.sqrt(this.cx*this.cx+this.cy*this.cy);
    this.oid=null;this.pc=null;this.pctx=null;this._cap=null;this._cctx=null;
  }
  gd(){if(!this.oid){this.ctx.clearRect(0,0,this.w,this.h);this.ctx.drawImage(this.img,0,0,this.w,this.h);this.oid=this.ctx.getImageData(0,0,this.w,this.h);}return new ImageData(new Uint8ClampedArray(this.oid.data),this.oid.width,this.oid.height);}
  _applyOne(ek,t){
    const ef=_effectMap[ek];
    if(ef&&typeof this[ef.fn]==='function'){this[ef.fn](t);}
    else{this.ctx.drawImage(this.img,0,0,this.w,this.h);}
  }
  r(p){
    const c=this.ctx,t=Math.min(1,p),origImg=this.img;
    c.clearRect(0,0,this.w,this.h);
    if(!this.eks.length){c.drawImage(origImg,0,0,this.w,this.h);return;}
    c.drawImage(origImg,0,0,this.w,this.h);
    for(let i=0;i<this.eks.length;i++){
      if(i>0){
        if(!this._cap){this._cap=document.createElement('canvas');this._cctx=this._cap.getContext('2d');}
        this._cap.width=this.w;this._cap.height=this.h;
        this._cctx.drawImage(this.c,0,0);
        this.img=this._cap;
      }
      this.oid=null;
      this._applyOne(this.eks[i],t);
    }
    this.img=origImg;
  }
  cc(){this.oid=null;}

  // ──── 原有20个特效 ────
  _bw(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){const g=d[i]*.299+d[i+1]*.587+d[i+2]*.114;o.data[i]=o.data[i+1]=o.data[i+2]=g;o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  _neg(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){o.data[i]=255-d[i];o.data[i+1]=255-d[i+1];o.data[i+2]=255-d[i+2];o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  _warm(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],gy=r*.299+g*.587+b*.114,s=1.6;o.data[i]=Math.min(255,gy+(r-gy)*s+25);o.data[i+1]=Math.min(255,gy+(g-gy)*s+5);o.data[i+2]=Math.min(255,gy+(b-gy)*s-15);o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  _cy(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){o.data[i]=Math.min(255,d[i]*1.3);o.data[i+1]=Math.min(255,d[i+1]*.5);o.data[i+2]=Math.min(255,d[i+2]*1.4);o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);this.ctx.fillStyle='rgba(80,0,180,.15)';this.ctx.fillRect(0,0,this.w,this.h);}
  _vin(){this.ctx.drawImage(this.img,0,0,this.w,this.h);const d=this.ctx.getImageData(0,0,this.w,this.h).data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){for(let j=0;j<3;j++){let v=d[i+j]/255;v=(v-.5)*1.8+.5;o.data[i+j]=Math.round(Math.min(1,Math.max(0,v))*255);}o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);const g=this.ctx.createRadialGradient(this.cx,this.cy,this.mr*.35,this.cx,this.cy,this.mr*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.75)');this.ctx.fillStyle=g;this.ctx.fillRect(0,0,this.w,this.h);const n=this.ctx.createImageData(this.w,this.h);for(let i=0;i<n.data.length;i+=4){const ns=(Math.random()-.5)*30;n.data[i]=128+ns;n.data[i+1]=100+ns*.8;n.data[i+2]=50+ns*.5;n.data[i+3]=25;}if(!this.pc){this.pc=document.createElement('canvas');this.pctx=this.pc.getContext('2d');}this.pc.width=this.w;this.pc.height=this.h;this.pctx.putImageData(n,0,0);this.ctx.drawImage(this.pc,0,0);}
  _wv(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),a=8,f=.04,ph=t*Math.PI*2*3;for(let y=0;y<this.h;y++){const dx=Math.sin(y*f+ph)*a;for(let x=0;x<this.w;x++){const sx=Math.round(x+dx),si=(Math.min(this.h-1,Math.max(0,y))*this.w+Math.min(this.w-1,Math.max(0,sx)))*4,di=(y*this.w+x)*4;if(si>=0&&si<s.data.length-3){o.data[di]=s.data[si];o.data[di+1]=s.data[si+1];o.data[di+2]=s.data[si+2];o.data[di+3]=s.data[si+3];}}}this.ctx.putImageData(o,0,0);}
  _fe(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),ti=t!=null?Math.min(1,t):1;for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const dx=(x-this.cx)/this.mr,dy=(y-this.cy)/this.mr,r=Math.sqrt(dx*dx+dy*dy);let nr=r<.01?0:Math.min(1,Math.sqrt(r)*.8+r*.2);nr=r+(nr-r)*ti;const sx=Math.round(this.cx+(r>0?(dx/r)*nr*this.mr:0)),sy=Math.round(this.cy+(r>0?(dy/r)*nr*this.mr:0)),si=(Math.min(this.h-1,Math.max(0,sy))*this.w+Math.min(this.w-1,Math.max(0,sx)))*4,di=(y*this.w+x)*4;if(si>=0&&si<s.data.length-3){o.data[di]=s.data[si];o.data[di+1]=s.data[si+1];o.data[di+2]=s.data[si+2];o.data[di+3]=s.data[si+3];}}this.ctx.putImageData(o,0,0);}
  _sw(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),st=t!=null?1+3*Math.min(1,t):4;for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const dx=x-this.cx,dy=y-this.cy,r=Math.sqrt(dx*dx+dy*dy),ang=Math.atan2(dy,dx)+((1-r/this.mr)*st),sx=Math.round(this.cx+Math.cos(ang)*r),sy=Math.round(this.cy+Math.sin(ang)*r),si=(Math.min(this.h-1,Math.max(0,sy))*this.w+Math.min(this.w-1,Math.max(0,sx)))*4,di=(y*this.w+x)*4;if(si>=0&&si<s.data.length-3){o.data[di]=s.data[si];o.data[di+1]=s.data[si+1];o.data[di+2]=s.data[si+2];o.data[di+3]=s.data[si+3];}}this.ctx.putImageData(o,0,0);}
  _px(){const bs=10,sw=Math.ceil(this.w/bs),sh=Math.ceil(this.h/bs);if(!this.pc){this.pc=document.createElement('canvas');this.pctx=this.pc.getContext('2d');}this.pc.width=sw;this.pc.height=sh;this.pctx.imageSmoothingEnabled=true;this.pctx.drawImage(this.img,0,0,sw,sh);this.ctx.imageSmoothingEnabled=false;this.ctx.drawImage(this.pc,0,0,this.w,this.h);this.ctx.imageSmoothingEnabled=true;}
  _ms(t){const bs=Math.max(2,Math.round(10-7*Math.sin(t*Math.PI*2))),sw=Math.ceil(this.w/bs),sh=Math.ceil(this.h/bs);if(!this.pc){this.pc=document.createElement('canvas');this.pctx=this.pc.getContext('2d');}this.pc.width=sw;this.pc.height=sh;this.pctx.imageSmoothingEnabled=true;this.pctx.drawImage(this.img,0,0,sw,sh);this.ctx.imageSmoothingEnabled=false;this.ctx.drawImage(this.pc,0,0,this.w,this.h);this.ctx.imageSmoothingEnabled=true;}
  _bl(t){const s=this.gd(),br=Math.round(2+3*Math.sin(t*Math.PI));let d=s.data;for(let p=0;p<3;p++){const o=new Uint8ClampedArray(d.length);for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){let rs=0,gs=0,bs=0,as=0,cnt=0;for(let dy=-br;dy<=br;dy++)for(let dx=-br;dx<=br;dx++){const i=(Math.min(this.h-1,Math.max(0,y+dy))*this.w+Math.min(this.w-1,Math.max(0,x+dx)))*4;rs+=d[i];gs+=d[i+1];bs+=d[i+2];as+=d[i+3];cnt++;}const di=(y*this.w+x)*4;o[di]=rs/cnt;o[di+1]=gs/cnt;o[di+2]=bs/cnt;o[di+3]=as/cnt;}d=o;}this.ctx.putImageData(new ImageData(new Uint8ClampedArray(d),this.w,this.h),0,0);}
  _zi(t){const ix=this.img.naturalWidth||this.img.width,iy=this.img.naturalHeight||this.img.height,icx=ix/2,icy=iy/2;let s;if(t<.7)s=1.6-t*.85;else{const tt=(t-.7)/.3;s=1+Math.sin(tt*Math.PI*2)*.08*(1-tt);}s=Math.max(.8,s);const sw=ix/s,sh=iy/s;this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.drawImage(this.img,icx-sw/2,icy-sh/2,sw,sh,0,0,this.w,this.h);this.ctx.restore();}
  _eg(t){this.ctx.drawImage(this.img,0,0,this.w,this.h);const d=this.ctx.getImageData(0,0,this.w,this.h),gy=new Float32Array(this.w*this.h);for(let i=0;i<this.w*this.h;i++)gy[i]=d.data[i*4]*.299+d.data[i*4+1]*.587+d.data[i*4+2]*.114;const em=new Float32Array(this.w*this.h);let me=0;for(let y=1;y<this.h-1;y++)for(let x=1;x<this.w-1;x++){const idx=y*this.w+x,gx=gy[idx-1]-gy[idx+1],gy2=gy[idx-this.w]-gy[idx+this.w],mg=Math.sqrt(gx*gx+gy2*gy2);em[idx]=mg;if(mg>me)me=mg;}const gi=.4+Math.sin(t*Math.PI*4)*.3,o=this.ctx.createImageData(this.w,this.h);for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const idx=y*this.w+x,di=idx*4;let e=me>0?em[idx]/me:0;if(e<.1&&x>0&&y>0&&x<this.w-1&&y<this.h-1)e=Math.max(em[idx-1]||0,em[idx+1]||0,em[idx-this.w]||0,em[idx+this.w]||0)/me*.5;const g=e*gi;o.data[di]=Math.min(255,d.data[di]+g*255);o.data[di+1]=Math.min(255,d.data[di+1]+g*200);o.data[di+2]=Math.min(255,d.data[di+2]+g*100);o.data[di+3]=d.data[di+3];}this.ctx.putImageData(o,0,0);}
  _sh(){const I=5,dx=(Math.random()-.5)*2*I,dy=(Math.random()-.5)*2*I;this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.translate(dx,dy);this.ctx.drawImage(this.img,0,0,this.w,this.h);this.ctx.restore();}
  _fh(t){const s=Math.cos(t*Math.PI);this.ctx.save();this.ctx.setTransform(1,0,0,1,0,0);this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.translate(this.cx,this.cy);this.ctx.scale(s||.001,1);this.ctx.drawImage(this.img,-this.w/2,-this.h/2,this.w,this.h);this.ctx.restore();}
  _fv(t){const s=Math.cos(t*Math.PI);this.ctx.save();this.ctx.setTransform(1,0,0,1,0,0);this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.translate(this.cx,this.cy);this.ctx.scale(1,s||.001);this.ctx.drawImage(this.img,-this.w/2,-this.h/2,this.w,this.h);this.ctx.restore();}
  _ch(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),sh=3+Math.sin(t*Math.PI)*4;for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const di=(y*this.w+x)*4,rx=Math.min(this.w-1,Math.max(0,x+sh)),bx=Math.min(this.w-1,Math.max(0,x-sh)),gi=(y*this.w+x)*4;o.data[di]=s.data[(y*this.w+rx)*4];o.data[di+1]=s.data[gi+1];o.data[di+2]=s.data[(y*this.w+bx)*4+2];o.data[di+3]=s.data[gi+3];}this.ctx.putImageData(o,0,0);}
  _em(){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h);for(let y=1;y<this.h-1;y++)for(let x=1;x<this.w-1;x++){const tl=((y-1)*this.w+(x-1))*4,tr=((y-1)*this.w+(x+1))*4,bl=((y+1)*this.w+(x-1))*4,br=((y+1)*this.w+(x+1))*4,di=(y*this.w+x)*4;for(let ch=0;ch<3;ch++){const v=128+(s.data[tl+ch]*-1+s.data[tr+ch]*1+s.data[bl+ch]*-1+s.data[br+ch]*1);o.data[di+ch]=Math.min(255,Math.max(0,v));}o.data[di+3]=255;}this.ctx.putImageData(o,0,0);}
  _op(){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),R=2,L=6,LL=L*L*L;for(let y=R;y<this.h-R;y++)for(let x=R;x<this.w-R;x++){const h=new Uint32Array(LL);let mc=0,mi=-1;for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const ii=((y+dy)*this.w+(x+dx))*4,ir=Math.floor(s.data[ii]/255*(L-1)),ig=Math.floor(s.data[ii+1]/255*(L-1)),ib=Math.floor(s.data[ii+2]/255*(L-1)),idx=(ir*L+ig)*L+ib;h[idx]++;if(h[idx]>mc){mc=h[idx];mi=ii;}}const di=(y*this.w+x)*4;if(mi>=0){o.data[di]=s.data[mi];o.data[di+1]=s.data[mi+1];o.data[di+2]=s.data[mi+2];}o.data[di+3]=255;}this.ctx.putImageData(o,0,0);}
  _rt(t){this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.translate(this.cx,this.cy);this.ctx.rotate(t*Math.PI*2);this.ctx.drawImage(this.img,-this.w/2,-this.h/2,this.w,this.h);this.ctx.restore();}

  // ──── 新增特效 (20个) ────

  // 动态: 弹入弹出
  _bi(t){const s=.85+Math.abs(Math.sin(t*Math.PI*2.5))*.3*(1-t*.5);this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.translate(this.cx,this.cy);this.ctx.scale(s,s);this.ctx.drawImage(this.img,-this.w/2,-this.h/2,this.w,this.h);this.ctx.restore();}
  // 动态: 摇摆
  _sg(t){const a=Math.sin(t*Math.PI*3)*.15*(1-t*.3);this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.translate(this.cx,this.cy);this.ctx.rotate(a);this.ctx.drawImage(this.img,-this.w/2,-this.h/2,this.w,this.h);this.ctx.restore();}
  // 动态: 水波纹
  _rp(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),f=.02,ph=t*Math.PI*2;for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const dx=x-this.cx,dy=y-this.cy,dist=Math.sqrt(dx*dx+dy*dy),off=Math.sin(dist*f-ph)*8*(1-t*.6),sx=Math.round(x+dx/(dist||1)*off),sy=Math.round(y+dy/(dist||1)*off),si=(Math.min(this.h-1,Math.max(0,sy))*this.w+Math.min(this.w-1,Math.max(0,sx)))*4,di=(y*this.w+x)*4;if(si>=0&&si<s.data.length-3){o.data[di]=s.data[si];o.data[di+1]=s.data[si+1];o.data[di+2]=s.data[si+2];o.data[di+3]=s.data[si+3];}}this.ctx.putImageData(o,0,0);}
  // 动态: 镜面反射 (取原图左半 → 左半画布 + 右半镜像)
  _mr(){const iw=this.img.naturalWidth||this.img.width,ih=this.img.naturalHeight||this.img.height;const shw=Math.floor(iw/2);this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.drawImage(this.img,0,0,shw,ih,0,0,this.w/2,this.h);this.ctx.save();this.ctx.translate(this.w,0);this.ctx.scale(-1,1);this.ctx.drawImage(this.img,0,0,shw,ih,0,0,this.w/2,this.h);this.ctx.restore();this.ctx.restore();}
  // 动态: 滑入
  _si(t){const ox=(1-t)*(1-t)*this.w*(t<.5?1:-1);this.ctx.save();this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.w,this.h);this.ctx.drawImage(this.img,ox,0,this.w,this.h);this.ctx.restore();}
  // 动态: 甩尾
  _wh(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h);for(let y=0;y<this.h;y++){const dx=Math.sin(y*.06+t*Math.PI*2)*10*(y/this.h);for(let x=0;x<this.w;x++){const sx=Math.round(x+dx),si=(Math.min(this.h-1,Math.max(0,y))*this.w+Math.min(this.w-1,Math.max(0,sx)))*4,di=(y*this.w+x)*4;if(si>=0&&si<s.data.length-3){o.data[di]=s.data[si];o.data[di+1]=s.data[si+1];o.data[di+2]=s.data[si+2];o.data[di+3]=s.data[si+3];}}}this.ctx.putImageData(o,0,0);}

  // 滤镜: 老照片
  _sp(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];o.data[i]=Math.min(255,r*.393+g*.769+b*.189);o.data[i+1]=Math.min(255,r*.349+g*.686+b*.168);o.data[i+2]=Math.min(255,r*.272+g*.534+b*.131);o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  // 滤镜: 海报化
  _pt(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h),L=5;for(let i=0;i<d.length;i+=4){for(let j=0;j<3;j++){o.data[i+j]=Math.round(d[i+j]/255*(L-1))/(L-1)*255;}o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  // 滤镜: 曝光过度
  _sz(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h),T=128;for(let i=0;i<d.length;i+=4){for(let j=0;j<3;j++){o.data[i+j]=d[i+j]>T?255-d[i+j]:d[i+j];}o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  // 滤镜: 漫画风 (边缘检测+量化)
  _cm(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h),L=4;for(let y=1;y<this.h-1;y++)for(let x=1;x<this.w-1;x++){const i=(y*this.w+x)*4,il=((y)*this.w+(x-1))*4,iu=((y-1)*this.w+(x))*4;let edge=0;for(let j=0;j<3;j++)edge+=Math.abs(d[i+j]-d[il+j])+Math.abs(d[i+j]-d[iu+j]);const q=edge>60?0:Math.round((d[i]+d[i+1]+d[i+2])/3/255*(L-1))/(L-1)*255;for(let j=0;j<3;j++)o.data[i+j]=edge>60?0:q;o.data[i+3]=255;}this.ctx.putImageData(o,0,0);}
  // 滤镜: 素描
  _sk(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let y=1;y<this.h-1;y++)for(let x=1;x<this.w-1;x++){const i=(y*this.w+x)*4,il=((y)*this.w+(x-1))*4,iu=((y-1)*this.w+(x))*4;let edge=0;for(let j=0;j<3;j++)edge+=Math.abs(d[i+j]-d[il+j])+Math.abs(d[i+j]-d[iu+j]);const g=255-Math.min(255,edge);o.data[i]=o.data[i+1]=o.data[i+2]=g;o.data[i+3]=255;}this.ctx.putImageData(o,0,0);}
  // 滤镜: 霓虹灯
  _nn(){this.ctx.drawImage(this.img,0,0,this.w,this.h);const d=this.ctx.getImageData(0,0,this.w,this.h);const gy=new Float32Array(this.w*this.h);for(let i=0;i<this.w*this.h;i++)gy[i]=d.data[i*4]*.299+d.data[i*4+1]*.587+d.data[i*4+2]*.114;const em=new Float32Array(this.w*this.h);for(let y=1;y<this.h-1;y++)for(let x=1;x<this.w-1;x++){const idx=y*this.w+x,gx=gy[idx-1]-gy[idx+1],gy2=gy[idx-this.w]-gy[idx+this.w];em[idx]=Math.sqrt(gx*gx+gy2*gy2);}const o=this.ctx.createImageData(this.w,this.h);for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const idx=y*this.w+x,di=idx*4,e=Math.min(1,em[idx]/40);o.data[di]=e*255;o.data[di+1]=e*50;o.data[di+2]=e*255;o.data[di+3]=255;}this.ctx.putImageData(o,0,0);}
  // 滤镜: 热成像
  _th(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);for(let i=0;i<d.length;i+=4){const v=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)/255;let r,g,b;if(v<.25){r=0;g=0;b=v*4*255;}else if(v<.5){r=0;g=(v-.25)*4*255;b=255;}else if(v<.75){r=(v-.5)*4*255;g=255;b=255-(v-.5)*4*255;}else{r=255;g=255-(v-.75)*4*128;b=0;}o.data[i]=r;o.data[i+1]=g;o.data[i+2]=b;o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}
  // 滤镜: 故障艺术
  _gl(t){const s=this.gd(),o=this.ctx.createImageData(this.w,this.h),sh=Math.floor(Math.sin(t*Math.PI*6)*6);for(let y=0;y<this.h;y++){const glitchRow=Math.sin(y*.4+t*10)>.5;const rs=glitchRow?Math.floor(Math.sin(y*.9+t*15)*14):sh;for(let x=0;x<this.w;x++){const di=(y*this.w+x)*4,rx=Math.min(this.w-1,Math.max(0,x+2+rs)),bx=Math.min(this.w-1,Math.max(0,x-2+rs)),gy=y;o.data[di]=s.data[(gy*this.w+rx)*4];o.data[di+1]=s.data[di+1];o.data[di+2]=s.data[(gy*this.w+bx)*4+2];o.data[di+3]=s.data[di+3];}}this.ctx.putImageData(o,0,0);}
  // 滤镜: 双色调
  _dt(){const d=this.gd().data,o=this.ctx.createImageData(this.w,this.h);const ca=[108,92,231],cb=[255,215,0];for(let i=0;i<d.length;i+=4){const lum=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)/255;for(let j=0;j<3;j++)o.data[i+j]=Math.round(ca[j]+(cb[j]-ca[j])*lum);o.data[i+3]=d[i+3];}this.ctx.putImageData(o,0,0);}

  // 装饰: 暗角
  _vg(){this.ctx.drawImage(this.img,0,0,this.w,this.h);const g=this.ctx.createRadialGradient(this.cx,this.cy,this.mr*.4,this.cx,this.cy,this.mr*.95);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.75)');this.ctx.fillStyle=g;this.ctx.fillRect(0,0,this.w,this.h);}
  // 装饰: 扫描线
  _sl(){this.ctx.drawImage(this.img,0,0,this.w,this.h);this.ctx.fillStyle='rgba(0,0,0,.12)';for(let y=0;y<this.h;y+=3)this.ctx.fillRect(0,y,this.w,1);}
  // 装饰: 噪点
  _ns(){this.ctx.drawImage(this.img,0,0,this.w,this.h);const d=this.ctx.getImageData(0,0,this.w,this.h);for(let i=0;i<d.data.length;i+=4){const ns=(Math.random()-.5)*50;d.data[i]=Math.min(255,Math.max(0,d.data[i]+ns));d.data[i+1]=Math.min(255,Math.max(0,d.data[i+1]+ns));d.data[i+2]=Math.min(255,Math.max(0,d.data[i+2]+ns));}this.ctx.putImageData(d,0,0);}
  // 装饰: 胶片颗粒
  _fg(){this.ctx.drawImage(this.img,0,0,this.w,this.h);const d=this.ctx.getImageData(0,0,this.w,this.h);for(let i=0;i<d.data.length;i+=4){if(Math.random()<.15){const g=Math.random()*60;d.data[i]=Math.min(255,d.data[i]+g);d.data[i+1]=Math.min(255,d.data[i+1]+g);d.data[i+2]=Math.min(255,d.data[i+2]+g);}}this.ctx.putImageData(d,0,0);}
  // 装饰: 光晕脉动
  _gp(t){this.ctx.drawImage(this.img,0,0,this.w,this.h);const a=.15+Math.sin(t*Math.PI*2)*.1;const g=this.ctx.createRadialGradient(this.cx,this.cy,this.mr*.2,this.cx,this.cy,this.mr*.8);g.addColorStop(0,'rgba(255,255,255,'+a+')');g.addColorStop(1,'rgba(255,255,255,0)');this.ctx.fillStyle=g;this.ctx.fillRect(0,0,this.w,this.h);}
  // 装饰: 闪光灯
  _fl(t){this.ctx.drawImage(this.img,0,0,this.w,this.h);const a=Math.max(0,Math.sin(t*Math.PI*6))*.35;if(a>.01){this.ctx.fillStyle='rgba(255,255,255,'+a+')';this.ctx.fillRect(0,0,this.w,this.h);}}
  // 装饰: 渐变映射
  _gm(t){this.ctx.drawImage(this.img,0,0,this.w,this.h);const g=this.ctx.createLinearGradient(0,0,this.w,this.h*(.5+Math.sin(t*Math.PI*2)*.5));g.addColorStop(0,'rgba(108,92,231,.25)');g.addColorStop(.5,'rgba(0,206,201,.15)');g.addColorStop(1,'rgba(232,67,147,.3)');this.ctx.fillStyle=g;this.ctx.fillRect(0,0,this.w,this.h);}
  // 装饰: 镜头耀斑
  _lf(t){this.ctx.drawImage(this.img,0,0,this.w,this.h);const lx=this.cx+Math.cos(t*Math.PI*2)*this.w*.3,ly=this.cy+Math.sin(t*Math.PI*2)*this.h*.2;for(let i=0;i<5;i++){const r=15+i*8,a=.12-i*.02;const g=this.ctx.createRadialGradient(lx,ly,r*.3,lx,ly,r);g.addColorStop(0,'rgba(255,255,255,'+a+')');g.addColorStop(1,'rgba(255,255,200,0)');this.ctx.fillStyle=g;this.ctx.fillRect(lx-r,ly-r,r*2,r*2);}}
  // 装饰: 梦幻柔焦
  _db(){this.ctx.drawImage(this.img,0,0,this.w,this.h);this.ctx.fillStyle='rgba(255,255,255,.15)';this.ctx.fillRect(0,0,this.w,this.h);const s=this.ctx.getImageData(0,0,this.w,this.h);const br=2;let d=s.data;for(let p=0;p<2;p++){const o=new Uint8ClampedArray(d.length);for(let y=br;y<this.h-br;y++)for(let x=br;x<this.w-br;x++){let rs=0,gs=0,bs=0,as=0,c=0;for(let dy=-br;dy<=br;dy++)for(let dx=-br;dx<=br;dx++){const i=((y+dy)*this.w+(x+dx))*4;rs+=d[i];gs+=d[i+1];bs+=d[i+2];as+=d[i+3];c++;}const di=(y*this.w+x)*4;o[di]=rs/c;o[di+1]=gs/c;o[di+2]=bs/c;o[di+3]=as/c;}d=o;}this.ctx.putImageData(new ImageData(new Uint8ClampedArray(d),this.w,this.h),0,0);}
  // 装饰: 毛边边框
  _fr(t){this.ctx.drawImage(this.img,0,0,this.w,this.h);const bw=Math.round(12+Math.sin(t*Math.PI*2)*4);this.ctx.strokeStyle='rgba(255,255,255,.7)';this.ctx.lineWidth=bw;this.ctx.filter='blur('+(bw/3)+'px)';this.ctx.strokeRect(bw/2,bw/2,this.w-bw,this.h-bw);this.ctx.filter='none';}
}

// ============ 生成 ============
async function generateVideo(){
  if(!uploadedImage){toastMsg('请先上传一张图片',true);return;}
  if(isGenerating)return;

  // 浏览器兼容性检查
  if(!window.MediaRecorder){toastMsg('当前浏览器不支持视频录制，请使用 Chrome 或 Edge',true);return;}
  if(!window.AudioContext&&!window.webkitAudioContext){toastMsg('当前浏览器不支持音频处理，请使用 Chrome 或 Edge',true);return;}
  if(!pcanvas.captureStream){toastMsg('当前浏览器不支持 Canvas 录制，请升级浏览器',true);return;}

  let dur=3.0;
  if(selectedSoundName){
    const d=sdur[selectedSoundName];
    if(d&&d>0.1)dur=d;
    else console.warn('音效时长未知，使用默认3秒');
  }
  if(dur<0.3)dur=0.5;if(dur>30)dur=30;

  stopLivePreview();
  isGenerating=true;genbtn.classList.add('go');genbtn.innerHTML='<span class="spin"></span> 生成中…';
  const effectiveDur=dur/soundSpeed,ms=effectiveDur*1000;
  phint.textContent='⏳ 合成 '+effectiveDur.toFixed(1)+' 秒视频 ('+soundSpeed.toFixed(1)+'x音效)…';
  let audioCleanupNeeded=false;

  try{
    setupCanvas();const w=pcanvas.width,h=pcanvas.height;
    ctx.drawImage(uploadedImage,0,0,w,h);
    pwrap.classList.add('on');pover.classList.add('off');pwrap.scrollIntoView({behavior:'smooth',block:'center'});

    const ac=new(window.AudioContext||window.webkitAudioContext)();
    if(ac.state==='suspended')await ac.resume();
    const dest=ac.createMediaStreamDestination();
    const videoStream=pcanvas.captureStream(30);

    let audioEl=null,srcNode=null,hasAudio=false;
    if(selectedSound){
      try{
        const resp=await fetch(selectedSound);
        if(!resp.ok)throw new Error('音效数据获取失败');
        const blob=await resp.blob();
        const blobUrl=URL.createObjectURL(blob);
        audioEl=new Audio(blobUrl);audioEl.loop=false;audioEl.playbackRate=soundSpeed;
        await new Promise((res,rej)=>{
          audioEl.addEventListener('loadedmetadata',res,{once:true});
          audioEl.addEventListener('error',()=>{rej(new Error('音效解码失败'));},{once:true});
          setTimeout(()=>rej(new Error('音效加载超时')),8000);
        });
        srcNode=ac.createMediaElementSource(audioEl);
        srcNode.connect(dest);
        hasAudio=true;audioCleanupNeeded=true;
      }catch(e){
        console.warn('音效准备失败，将生成无声视频:',e.message);
        toastMsg('⚠️ 音效加载失败，将生成无声视频');
        hasAudio=false;
      }
    }

    const combined=new MediaStream();
    videoStream.getVideoTracks().forEach(t=>combined.addTrack(t));
    if(hasAudio){
      let at=null;
      for(let i=0;i<30;i++){const ts=dest.stream.getAudioTracks();if(ts.length>0){at=ts[0];break;}await new Promise(r=>setTimeout(r,20));}
      if(at)combined.addTrack(at);
    }

    let mt='';for(const m of TRY_MIMES){if(MediaRecorder.isTypeSupported(m)){mt=m;break;}}
    if(!mt){toastMsg('浏览器不支持任何视频编码格式，请使用 Chrome 或 Edge',true);throw new Error('No supported mime type');}
    const chunks=[],rec=new MediaRecorder(combined,{mimeType:mt,videoBitsPerSecond:4000000});
    rec.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
    rec.onerror=()=>{throw new Error('MediaRecorder 录制失败');};
    const done=new Promise(r=>{rec.onstop=()=>r(new Blob(chunks,{type:mt||'video/mp4'}));});

    const fr=new FR(uploadedImage,selectedEffects,pcanvas,ctx);
    rec.start();
    if(audioEl)try{await audioEl.play();}catch(e){console.warn('音效播放失败');}

    const st=performance.now();
    const MAX_GEN_MS=90000; // 最多等 90 秒
    await new Promise((r,rej)=>{function f(ts){const e=ts-st;if(e>MAX_GEN_MS){rej(new Error('生成超时'));return;}const p=Math.min(1,e/ms*effectSpeed);fr.cc();fr.r(p);if(e<ms)requestAnimationFrame(f);else r();}requestAnimationFrame(f);});
    await new Promise(r=>setTimeout(r,250));

    rec.stop();
    if(audioEl){try{audioEl.pause();audioEl.currentTime=0;}catch(e){};try{URL.revokeObjectURL(audioEl.src);}catch(e){}}
    if(srcNode)try{srcNode.disconnect();}catch(e){}

    const blob=await done;
    if(!blob||blob.size<1000){toastMsg('生成的视频为空，请重试或更换图片',true);throw new Error('Empty video');}
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='meme_'+Date.now()+'.mp4';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),5000);

    phint.textContent='✅ 视频已保存 ('+effectiveDur.toFixed(1)+'秒)';pover.classList.remove('off');
    if(navigator.vibrate)navigator.vibrate([50,30,50]);
    if('Notification'in window&&Notification.permission==='granted')new Notification('Meme生成器',{body:'视频已保存！'});
    else if('Notification'in window&&Notification.permission!=='denied'){const p=await Notification.requestPermission();if(p==='granted')new Notification('Meme生成器',{body:'视频已保存！'});}
    toastMsg('🎉 视频已保存 ('+effectiveDur.toFixed(1)+'秒)');
    setTimeout(()=>{if(phint.textContent.includes('✅'))phint.textContent='';},4000);
    maybeShowSupport();
    fr.cc();
    if(selectedEffects.length&&uploadedImage)setTimeout(()=>startLivePreview(),600);
  }catch(e){
    console.error('视频生成失败:',e.message);
    if(e.message==='生成超时'){
      toastMsg('视频生成超时，请尝试减少特效数量或缩短音效时长',true);
    }else{
      toastMsg('视频生成失败，请重试或更换图片/音效',true);
    }
  }finally{
    isGenerating=false;genbtn.classList.remove('go');genbtn.innerHTML='<span class="spin"></span>🚀 生成视频';
    if(!(phint.textContent||'').includes('✅'))phint.textContent='';
  }
}

function updateGenBtn(){genbtn.disabled=!uploadedImage;}

// ============ 支持弹窗 (第3次使用触发) ============
function showSupportModal(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .3s ease';
  const card=document.createElement('div');
  card.style.cssText='background:var(--d);border-radius:20px;padding:32px 28px 24px;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.06);animation:popIn .35s ease';
  card.innerHTML='<div style="font-size:48px;margin-bottom:12px">🍋</div>'+
    '<div style="font-size:20px;font-weight:900;color:var(--t);margin-bottom:8px">您已经使用 MEME 制作器 <span style="color:var(--y)">三次</span>了</div>'+
    '<div style="font-size:14px;color:var(--t2);margin-bottom:24px;line-height:1.6">觉得好用的话，不妨支持一下我 ♥</div>'+
    '<a href="https://ifdian.net/a/VIPmrgj" target="_blank" rel="noopener" style="display:block;padding:14px;background:linear-gradient(135deg,var(--a),#f0677c);color:#fff;border-radius:14px;font-size:16px;font-weight:700;text-decoration:none;margin-bottom:10px;transition:transform .15s" onmousedown="this.style.transform=\'scale(.96)\'" onmouseup="this.style.transform=\'\'">💝 支持</a>'+
    '<button style="display:block;width:100%;padding:12px;background:transparent;border:2px solid rgba(255,255,255,.1);color:var(--t3);border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor=\'var(--t2)\';this.style.color=\'var(--t)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,.1)\';this.style.color=\'var(--t3)\'" id="donate-reject">😢 残忍拒绝</button>';
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close=()=>{
    overlay.style.opacity='0';overlay.style.transition='opacity .25s';
    setTimeout(()=>overlay.remove(),250);
    localStorage.setItem(DONATE_KEY,'1');
  };
  card.querySelector('#donate-reject').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});

  const style=document.createElement('style');
  style.textContent='@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes popIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}';
  document.head.appendChild(style);
}

function maybeShowSupport(){
  useCount++;
  localStorage.setItem(USE_KEY,useCount);
  if(useCount===3&&!localStorage.getItem(DONATE_KEY)){
    setTimeout(()=>showSupportModal(),800);
  }
}
function vibrate(ms){if(navigator.vibrate)navigator.vibrate(ms);}
function toastMsg(msg,err){toast.textContent=msg;toast.className='toast'+(err?' err':'');requestAnimationFrame(()=>toast.classList.add('on'));clearTimeout(toast._t);toast._t=setTimeout(()=>toast.classList.remove('on'),2200);}

genbtn.addEventListener('click',generateVideo);
if('Notification'in window&&Notification.permission==='default')document.addEventListener('click',function rn(){Notification.requestPermission();document.removeEventListener('click',rn);},{once:true});

// ============ 启动 ============
// 浏览器兼容性预检
(function checkBrowser(){
  const issues=[];
  if(!window.MediaRecorder)issues.push('视频录制');
  if(!(window.AudioContext||window.webkitAudioContext))issues.push('音频处理');
  if(!HTMLCanvasElement.prototype.captureStream)issues.push('画布录制');
  if(issues.length>=3){setTimeout(()=>toastMsg('⚠️ 浏览器兼容性不足，建议使用 Chrome 或 Edge',true),500);}
  else if(issues.length>0){setTimeout(()=>toastMsg('⚠️ 部分功能可能不可用: '+issues.join('、')+'，建议使用 Chrome',true),800);}
})();
buildEffectTabs();buildEffects();buildTabs();renderSounds();updateGenBtn();

// ============ 倍速控制 ============
function makeSpeedCtrl(label,getVal,setVal,onChange){
  const wrap=document.createElement('div');
  wrap.style.cssText='display:inline-flex;align-items:center;gap:4px;background:var(--c);padding:4px 10px;border-radius:20px';
  const lbl=document.createElement('span');
  lbl.style.cssText='font-size:11px;font-weight:700;color:var(--t2);margin-right:4px;white-space:nowrap';
  lbl.textContent=label;
  const minus=document.createElement('button');
  minus.textContent='−';minus.style.cssText='width:24px;height:24px;border-radius:50%;border:1.5px solid #555;background:transparent;color:var(--t);font-size:16px;font-weight:700;cursor:pointer;line-height:1;padding:0;transition:all .12s';
  minus.addEventListener('mouseenter',()=>{minus.style.background='#555';});
  minus.addEventListener('mouseleave',()=>{minus.style.background='transparent';});
  const input=document.createElement('input');
  input.type='text';input.style.cssText='width:42px;text-align:center;background:var(--d);border:1px solid #555;border-radius:8px;color:var(--y);font-size:13px;font-weight:700;padding:3px 0;outline:none';
  input.value=getVal().toFixed(1);
  const plus=document.createElement('button');
  plus.textContent='+';plus.style.cssText=minus.style.cssText;
  plus.addEventListener('mouseenter',()=>{plus.style.background='#555';});
  plus.addEventListener('mouseleave',()=>{plus.style.background='transparent';});

  function apply(v){
    v=Math.max(0.1,Math.min(5,Math.round(v*10)/10));
    setVal(v);input.value=v.toFixed(1);
    onChange(v);
  }
  minus.addEventListener('click',()=>apply(getVal()-0.1));
  plus.addEventListener('click',()=>apply(getVal()+0.1));
  input.addEventListener('change',()=>{
    const v=parseFloat(input.value);
    if(!isNaN(v))apply(v);else input.value=getVal().toFixed(1);
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter')input.blur();});
  input.addEventListener('blur',()=>{input.value=getVal().toFixed(1);});

  wrap.appendChild(lbl);wrap.appendChild(minus);wrap.appendChild(input);wrap.appendChild(plus);
  return wrap;
}
(function buildSpeedRow(){
  const row=document.createElement('div');row.id='srow';
  const efCtrl=makeSpeedCtrl('🎨 特效倍速',()=>effectSpeed,v=>{effectSpeed=v;},v=>{if(uploadedImage&&selectedEffects.length)startLivePreview();});
  const sfCtrl=makeSpeedCtrl('🔊 音效倍速',()=>soundSpeed,v=>{soundSpeed=v;},v=>{if(playingAudio){playingAudio.playbackRate=v;}});
  row.appendChild(efCtrl);row.appendChild(sfCtrl);
  const soundsTitle=tbar.parentNode.querySelector('.stitle');
  if(soundsTitle&&soundsTitle.textContent.includes('音效')){
    soundsTitle.parentNode.insertBefore(row,soundsTitle);
  }else{
    egrid.parentNode.insertBefore(row,egrid.nextSibling);
  }
})();
sbadge.textContent=EMBEDDED_N+'个已就绪';sbadge.style.background='rgba(160,180,224,.15)';sbadge.style.color='#a0b4e0';sbadge.style.borderColor='rgba(160,180,224,.25)';

// 音效改为按需加载: 用户点击时才解码 base64 并获取时长
// 不再后台预加载，大幅加快首屏初始化速度

// 双击/单击样式
const st=document.createElement('style');
st.textContent='.ecard.pending{border-color:var(--y)!important;box-shadow:0 0 10px rgba(240,192,64,.25)!important;transform:scale(1.04)}';
document.head.appendChild(st);

// ============ 本地音效导入 ============
(function initLocalSounds(){
  // 确保 "我的音效" 分类存在
  if(EMBEDDED_CATS.indexOf('我的音效')===-1){
    EMBEDDED_CATS.push('我的音效');
    EMBEDDED_SOUNDS['我的音效']=[];
    SOUND_INDEX['我的音效']=[];
    cicons['我的音效']='📂';
  }
  // 重建音效分类 tab
  buildTabs();
})();

soundInput.addEventListener('change',async function(){
  const files=Array.from(soundInput.files);
  if(!files.length)return;
  let imported=0,skipped=0;
  for(const file of files){
    if(!file.type.match(/audio\//)){skipped++;continue;}
    const name=file.name.replace(/\.[^.]+$/,'');
    // 跳过已存在的同名音效
    if(SOUND_INDEX['我的音效'].indexOf(name)!==-1){
      console.log('⏭ 跳过重复音效: '+name);
      skipped++;continue;
    }
    // 文件大小校验 (最大 10MB)
    if(file.size>10*1024*1024){toastMsg('⚠️ "'+file.name+'" 超过 10MB，已跳过',true);skipped++;continue;}
    // 读取为 data URL
    try{
      const dataUrl=await new Promise((resolve,reject)=>{
        const r=new FileReader();
        r.onload=e=>resolve(e.target.result);
        r.onerror=()=>reject(new Error('读取失败'));
        r.readAsDataURL(file);
      });
      // 存入所有数据结构
      localSoundData[name]=dataUrl;
      EMBEDDED_SOUNDS['我的音效'].push({name:name,get data(){return localSoundData[name];}});
      SOUND_INDEX['我的音效'].push(name);
      // 注册到 getSoundUrl 查找表
      const idx=document.querySelectorAll('script[type="text/plain"][data-name]').length;
      const se=document.createElement('script');
      se.type='text/plain';se.id='snd-'+idx;
      se.dataset.cat='我的音效';se.dataset.name=name;
      se.textContent=dataUrl;
      document.body.appendChild(se);
      SOUND_ID_MAP['我的音效::'+name]='snd-'+idx;
      imported++;
    }catch(e){
      console.warn('音效导入失败: '+file.name,e.message);
      skipped++;
    }
  }
  soundInput.value='';
  if(!imported){toastMsg('未导入新音效'+(skipped?'（'+skipped+'个已跳过）':', 请检查文件格式'),true);return;}
  // 刷新 UI
  EMBEDDED_N=Object.values(SOUND_INDEX).flat().length;
  activeTab='我的音效';
  buildTabs();renderSounds();
  sbadge.textContent=EMBEDDED_N+'个已就绪';sbadge.style.background='rgba(160,180,224,.15)';sbadge.style.color='#a0b4e0';sbadge.style.borderColor='rgba(160,180,224,.25)';
  toastMsg('✅ 已导入 '+imported+' 个音效'+(skipped?'，'+skipped+'个跳过':''));
});

console.log('🎬 Meme生成器已就绪 — '+EMBEDDED_N+'个音效(按需加载), '+effects.length+'种特效 ✅');
})();
