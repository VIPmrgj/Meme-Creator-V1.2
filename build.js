// Build script for Meme短视频生成器 (优化版: 音效延迟加载)
// Usage: 先运行 node convert-sounds.js → 再运行 node build.js
// 拼接顺序: top-new(HTML) → sounds-data(script[type=text/plain]标签) → catalog.js → meme-app.js → bot.txt

const fs = require('fs');
const path = require('path');

const DESKTOP = __dirname;

function build(variant, outName) {
  outName = outName || variant;
  const topPath   = path.join(DESKTOP, 'source', `${variant}-top-new.txt`);
  const dataPath  = path.join(DESKTOP, 'source', 'sounds-data.txt');
  const catPath   = path.join(DESKTOP, 'source', 'catalog.js');
  const appPath   = path.join(DESKTOP, 'meme-app.js');
  const botPath   = path.join(DESKTOP, 'source', 'bot.txt');

  for (const p of [topPath, dataPath, catPath, appPath, botPath]) {
    if (!fs.existsSync(p)) {
      console.error(`❌ 缺失文件: ${p}`);
      console.error('   请先运行 node convert-sounds.js');
      return;
    }
  }

  const top  = fs.readFileSync(topPath, 'utf8');
  const data = fs.readFileSync(dataPath, 'utf8');
  const cat  = fs.readFileSync(catPath, 'utf8');
  const app  = fs.readFileSync(appPath, 'utf8');
  const bot  = fs.readFileSync(botPath, 'utf8');

  // 拼接: HTML结构 → 音效数据块 → 目录+兼容层 → 主程序 → 闭合标签
  const output = top + '\n' + data + '\n<script>\n' + cat + '\n' + app + '\n' + bot;

  const outPath = path.join(DESKTOP, outName + '.html');
  fs.writeFileSync(outPath, output, 'utf8');

  const sizeKB = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(0);
  const sizeMB = (Buffer.byteLength(output, 'utf8') / 1024 / 1024).toFixed(1);
  console.log(`✅ Built ${outPath} (${sizeKB} KB / ${sizeMB} MB)`);
}

build('pe');
build('pc', 'index');  // PC 版模板 → 输出为 index.html

console.log('🎉 构建完成！');
