const { chromium } = require('playwright'); const path=require('path'); const fs=require('fs');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.goto('about:blank');
  // Capture parse errors with line/col via window.onerror on an inline script.
  const js = fs.readFileSync(path.join(__dirname,'Scripts.js'),'utf8');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
    + '<script>window.__errs=[];window.addEventListener("error",function(e){window.__errs.push({m:e.message,l:e.lineno,c:e.colno});});'
    + 'window.EDP_BOOT={config:{},inventory:[],customers:[],activity:[]};<\/script>\n'
    + '<script>\n' + js + '\n<\/script></body></html>';
  fs.writeFileSync(path.join(__dirname,'inline-test.html'), html);
  await p.goto('file://'+path.join(__dirname,'inline-test.html'));
  await p.waitForTimeout(400);
  const errs = await p.evaluate(()=>window.__errs||[]);
  console.log('errors:', JSON.stringify(errs,null,1));
  const lines = html.split('\n');
  errs.forEach(e=>{
    console.log('--- context around line', e.l, '---');
    for(let i=Math.max(0,e.l-4); i<Math.min(lines.length,e.l+2); i++) console.log(String(i+1).padStart(5), lines[i]);
  });
  await b.close();
})();
