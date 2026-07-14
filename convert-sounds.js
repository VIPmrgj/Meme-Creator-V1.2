// convert-sounds.js —— 从现有 HTML 中提取 EMBEDDED_SOUNDS 并生成延迟加载存储格式
// Usage: node convert-sounds.js
const fs = require('fs');
const path = require('path');

const DESKTOP = __dirname;

// ---------- 1. 从已构建的 index.html 中读取 EMBEDDED_SOUNDS ----------
const html = fs.readFileSync(path.join(DESKTOP, 'index.html'), 'utf8');

const startMarker = 'const EMBEDDED_SOUNDS=';
const endMarker = 'const EMBEDDED_CATS=';
const startIdx = html.indexOf(startMarker);
const endIdx = html.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('❌ 未找到 EMBEDDED_SOUNDS 定义块');
  process.exit(1);
}

const soundsCode = html.substring(startIdx, endIdx);
console.log('📦 提取音效数据: ' + (soundsCode.length / 1024 / 1024).toFixed(1) + ' MB');

// 安全求值得到音效对象
const EMBEDDED_SOUNDS = new Function(soundsCode + '; return EMBEDDED_SOUNDS;')();

// 读 EMBEDDED_CATS 和 N
const catsMatch = html.match(/const EMBEDDED_CATS=\[(.*?)\];/);
const nMatch = html.match(/const EMBEDDED_N=(\d+);/);
const EMBEDDED_CATS = catsMatch ? JSON.parse('[' + catsMatch[1] + ']') : [];
const EMBEDDED_N = nMatch ? parseInt(nMatch[1]) : 0;

console.log('📂 分类: ' + EMBEDDED_CATS.join(', '));
console.log('🔢 音效总数: ' + EMBEDDED_N);

// ---------- 2. 生成 script[type=text/plain] 标签 + 轻量目录 ----------
let scriptTags = '';
let idx = 0;
const soundIndex = {};

for (const cat of EMBEDDED_CATS) {
  soundIndex[cat] = [];
  const sounds = EMBEDDED_SOUNDS[cat] || [];
  for (const s of sounds) {
    soundIndex[cat].push(s.name);
    // 转义 HTML 特殊字符，确保 </script> 不提前闭合
    const escaped = s.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    scriptTags +=
      '<script id="snd-' + idx + '" type="text/plain" data-cat="' +
      cat + '" data-name="' + s.name + '">' + escaped + '</script>\n';
    idx++;
  }
}

console.log('✅ 生成 ' + idx + ' 个 script[type=text/plain] 标签');

// 写入 sounds-data.txt（纯数据块）
const dataPath = path.join(DESKTOP, 'source', 'sounds-data.txt');
fs.writeFileSync(dataPath, scriptTags, 'utf8');
const dataSize = fs.statSync(dataPath).size;
console.log('💾 sounds-data.txt: ' + (dataSize / 1024 / 1024).toFixed(1) + ' MB');

// ---------- 3. 生成轻量目录脚本（不含 base64） ----------
const catalogJS =
  'const EMBEDDED_CATS=' + JSON.stringify(EMBEDDED_CATS) + ';\n' +
  'const EMBEDDED_N=' + EMBEDDED_N + ';\n' +
  'const SOUND_INDEX=' + JSON.stringify(soundIndex) + ';\n' +
  '// 延迟加载: 构建 sound id → 名称 反向映射\n' +
  'const SOUND_ID_MAP={};\n' +
  '(function(){\n' +
  '  var els=document.querySelectorAll(\'script[type="text/plain"][data-name]\');\n' +
  '  for(var i=0;i<els.length;i++){\n' +
  '    var e=els[i];\n' +
  '    SOUND_ID_MAP[e.dataset.cat+"::"+e.dataset.name]=e.id;\n' +
  '  }\n' +
  '})();\n' +
  '// 按需获取音效 Blob URL (带缓存)\n' +
  'var _soundCache={};\n' +
  'function getSoundUrl(cat,name){\n' +
  '  var key=cat+"::"+name;\n' +
  '  if(_soundCache[key])return _soundCache[key];\n' +
  '  var el=document.getElementById(SOUND_ID_MAP[key]);\n' +
  '  if(!el)return null;\n' +
  '  var b64=el.textContent.trim();\n' +
  '  // 如果存储的是完整 data: URL，直接返回\n' +
  '  if(b64.indexOf("data:")===0)return _soundCache[key]=b64;\n' +
  '  // 否则作为纯 base64 解码\n' +
  '  var bin=atob(b64);\n' +
  '  var bytes=new Uint8Array(bin.length);\n' +
  '  for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);\n' +
  '  var blob=new Blob([bytes],{type:"audio/mpeg"});\n' +
  '  return _soundCache[key]=URL.createObjectURL(blob);\n' +
  '}\n' +
  '// 兼容层: 供老代码通过 EMBEDDED_SOUNDS 对象访问\n' +
  'var EMBEDDED_SOUNDS={};\n' +
  'EMBEDDED_CATS.forEach(function(c){\n' +
  '  EMBEDDED_SOUNDS[c]=SOUND_INDEX[c].map(function(n){return{name:n,get data(){return getSoundUrl(c,n);}};});\n' +
  '});\n';

const catalogPath = path.join(DESKTOP, 'source', 'catalog.js');
fs.writeFileSync(catalogPath, catalogJS, 'utf8');
console.log('📋 catalog.js: ' + (catalogJS.length / 1024).toFixed(1) + ' KB');

// ---------- 4. 从旧 top 模板中截取 HTML 部分（去掉 EMBEDDED_SOUNDS 行） ----------
function stripSoundsFromTemplate(templatePath, variant) {
  const content = fs.readFileSync(templatePath, 'utf8');
  const scriptLine = content.lastIndexOf('<script>');
  if (scriptLine === -1) {
    console.error('❌ ' + variant + ' 模板中未找到 <script>');
    return null;
  }
  // 保留 <script> 之前的所有内容 + <script> 标签
  const htmlPart = content.substring(0, scriptLine);
  const newPath = path.join(DESKTOP, 'source', variant + '-top-new.txt');
  fs.writeFileSync(newPath, htmlPart, 'utf8');
  console.log('✂️  ' + variant + '-top-new.txt: ' + (htmlPart.length / 1024).toFixed(1) + ' KB (纯 HTML)');
  return newPath;
}

stripSoundsFromTemplate(path.join(DESKTOP, 'source', 'pc-top.txt'), 'pc');
stripSoundsFromTemplate(path.join(DESKTOP, 'source', 'pe-top.txt'), 'pe');

console.log('\n✅ 转换完成！现在运行 node build.js 构建优化版 HTML');
