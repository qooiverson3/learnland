// usage: node validate.js <catalog.json> <lesson.json> [previous-lesson.json]
const fs=require('fs');
const [,,catPath,lessonPath,prevPath]=process.argv;
const cat=JSON.parse(fs.readFileSync(catPath,'utf8'));
const L=JSON.parse(fs.readFileSync(lessonPath,'utf8'));
const errs=[],warns=[];const E=m=>errs.push(m),W=m=>warns.push(m);
// 每個場景模板可用的建築；要和 index.html 的 BUILD / GEAR 保持一致
const TEMPLATES={
  'ancient-city':['gate','market','mansion','library','station','palace','school','teahouse','stage','drill','drumtower','hall'],
  'gear-city':['gate','gearworks','clocktower','scale','lab','fuelstop','tunnel','cubes','orchard','windmill','tower','workshop']};
const TYPES=['mc','order','match','cloze','open','num'];
const numRe=/^-?\d+(\.\d+)?$/;
const idRe=/^[a-z0-9][a-z0-9-]*$/;
if(!/^[a-z]+-\d+[ab]-\d{2}$/.test(L.id))E(`lesson id "${L.id}" 不符合 <subject>-<年級><a|b>-<兩位數課次>`);
const sub=cat.subjects.find(s=>s.id===L.subject);
if(!sub)E(`catalog 沒有 subject "${L.subject}"`);
else{const e=sub.lessons.find(x=>x.id===L.id);
  if(!e)E(`catalog 的 ${L.subject}.lessons 還沒有 ${L.id}`);
  else{if(e.file!==`content/${L.id}.json`)E(`catalog file 應為 content/${L.id}.json`);
    ['grade','no','title'].forEach(k=>{if(e[k]!==L[k])E(`catalog 與課程的 ${k} 不一致：${e[k]} vs ${L[k]}`);});}}
const allIds=new Set();cat.subjects.forEach(s=>s.lessons.forEach(x=>{if(allIds.has(x.id))E(`catalog 重複的課程 id ${x.id}`);allIds.add(x.id);}));
const tpl=L.scene&&L.scene.template,BUILD=TEMPLATES[tpl]||[];
if(!TEMPLATES[tpl])E(`scene.template "${tpl}" 不存在，可用：${Object.keys(TEMPLATES).join(', ')}`);
if(!Array.isArray(L.levels)||!L.levels.length)E('levels 不能是空的');
if(L.levels.length>16)E(`levels 最多 16 關（目前 ${L.levels.length}）`);
const lvIds=new Set();let total=0;const ansPos={};
L.levels.forEach((lv,li)=>{const at=`第${li+1}關(${lv.id})`;
  if(!idRe.test(lv.id||''))E(`${at} id 要用小寫英數與連字號`);
  if(lvIds.has(lv.id))E(`${at} id 重複`);lvIds.add(lv.id);
  ['title','tag','seal','place','intro'].forEach(k=>{if(!lv[k])E(`${at} 缺少 ${k}`);});
  if(lv.seal&&[...lv.seal].length!==1)E(`${at} seal 必須是一個字`);
  const b=typeof lv.building==='string'?{type:lv.building}:lv.building||{};
  if(!BUILD.includes(b.type))E(`${at} building.type "${b.type}" 不存在，可用：${BUILD.join(', ')}`);
  if(b.banner&&[...b.banner].length!==1)E(`${at} building.banner 必須是一個字`);
  const stIds=new Set();
  (lv.steps||[]).forEach((st,si)=>{const sat=`${at} ${st.id||'第'+(si+1)+'題'}`;total++;
    if(!/^s\d+$/.test(st.id||''))E(`${sat} step id 要是 s1、s2…`);if(stIds.has(st.id))E(`${sat} step id 重複`);stIds.add(st.id);
    if(!TYPES.includes(st.type))E(`${sat} type "${st.type}" 不支援`);
    if(!st.q)E(`${sat} 缺少 q`);
    if(st.who&&!['lian','lin'].includes(st.who))E(`${sat} who 目前只支援 lian/lin，請改用 quote`);
    if(st.quote&&[...st.quote].length>70)W(`${sat} quote 超過 70 字，考慮縮短`);
    if(st.type!=='open'&&!st.explain)W(`${sat} 沒有 explain`);
    if(st.type==='mc'){const n=(st.opts||[]).length;if(n<2||n>6)E(`${sat} opts 要 2～6 個`);
      if(new Set(st.opts).size!==n)E(`${sat} opts 有重複`);
      const a=[].concat(st.ans);if(!a.length||a.some(x=>!Number.isInteger(x)||x<0||x>=n))E(`${sat} ans 超出選項範圍`);
      if(Array.isArray(st.ans)&&new Set(st.ans).size!==st.ans.length)E(`${sat} ans 重複`);
      if(!Array.isArray(st.ans))ansPos[st.ans]=(ansPos[st.ans]||0)+1;}
    if(st.type==='order'){const t=(st.items||[]).map(x=>typeof x==='string'?x:x&&x.t);if(t.length<2)E(`${sat} items 至少 2 個`);if(new Set(t).size!==t.length)E(`${sat} items 有重複`);}
    if(st.type==='match'){const p=st.pairs||[];if(p.length<3)W(`${sat} pairs 少於 3 組`);
      const l=p.map(x=>x[0]),r=p.map(x=>x[1]);if(new Set(l).size!==l.length||new Set(r).size!==r.length)E(`${sat} 配對左右兩邊都不能重複`);}
    if(st.type==='cloze'){const parts=(st.text||'').split(/\[(.+?)\]/),ans=parts.filter((_,i)=>i%2);
      if(!ans.length)E(`${sat} text 沒有 [答案] 空格`);if(new Set(ans).size!==ans.length)E(`${sat} 空格答案不能重複`);
      (st.extra||[]).forEach(x=>{if(ans.includes(x))E(`${sat} extra「${x}」和答案重複`);});
      if(!(st.extra||[]).length)W(`${sat} 沒有 extra 干擾詞`);}
    if(st.type==='open'&&!(st.ideas||[]).length)E(`${sat} 開放題要有 ideas`);
    if(st.type==='num'){
      if(st.text){const ans=st.text.split(/\[(.+?)\]/).filter((_,i)=>i%2);if(!ans.length)E(`${sat} text 沒有 [答案] 空格`);
        ans.forEach(a=>{if(!numRe.test(a))E(`${sat} 空格答案「${a}」不是數字`);});if(st.ans!==undefined)W(`${sat} 有 text 時 ans 不會用到`);}
      else{const a=[].concat(st.ans===undefined?[]:st.ans);if(!a.length||a.some(x=>typeof x!=='string'||!numRe.test(x)))E(`${sat} ans 要是數字字串（例如 "10.01"），可用陣列列出多個可接受答案`);}
      if(st.stack){const ns=st.stack.nums||[];if(ns.length<2||ns.some(x=>typeof x!=='string'||!numRe.test(x)))E(`${sat} stack.nums 至少 2 個數字字串`);
        if(st.stack.op&&!['+','-','－'].includes(st.stack.op))E(`${sat} stack.op 只能是 + 或 -`);}
      if(st.exact!==undefined&&typeof st.exact!=='boolean')E(`${sat} exact 要是 true 或 false`);}
  });
  if(!(lv.steps||[]).length)E(`${at} 沒有題目`);});
if(L.reward){const R=L.reward;if(!lvIds.has(R.at))E(`reward.at "${R.at}" 不是任何一關的 id`);
  if(!Array.isArray(R.ranks)||!R.ranks.some(r=>r[0]===0))E('reward.ranks 要有門檻 0 的最後一級');}
const mcN=Object.values(ansPos).reduce((a,b)=>a+b,0);
Object.entries(ansPos).forEach(([k,v])=>{if(mcN>=6&&v/mcN>.5)W(`單選題答案有 ${v}/${mcN} 題都在第 ${+k+1} 個選項，請打散`);});
if(prevPath){const P=JSON.parse(fs.readFileSync(prevPath,'utf8'));
  P.levels.forEach(pl=>{const nl=L.levels.find(x=>x.id===pl.id);if(!nl){W(`舊關卡 ${pl.id} 被移除，孩子在這關的紀錄會失效`);return;}
    pl.steps.forEach(ps=>{const ns=nl.steps.find(x=>x.id===ps.id);if(!ns)W(`舊題目 ${pl.id}/${ps.id} 被移除`);else if(ns.type!==ps.type)E(`${pl.id}/${ps.id} 換了題型，請改用新的 step id`);});});}
console.log(`${L.id}：${L.levels.length} 關、${total} 題`);
warns.forEach(m=>console.log('WARN',m));errs.forEach(m=>console.log('ERROR',m));
console.log(errs.length?`未通過（${errs.length} 個錯誤）`:'通過');process.exit(errs.length?1:0);
