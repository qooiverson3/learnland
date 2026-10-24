/**
 * 學習大陸：用 Google 試算表保存闖關進度。
 * 貼到試算表的「擴充功能 → Apps Script」，部署成網頁應用程式即可（步驟見 README.md）。
 *
 * 分頁：
 *   _db       原始資料（請勿手動修改）：path、json、updatedAt
 *   進度總表  每位冒險者每一課一列（含隨堂測驗成績與獎章）
 *   作答明細  每一題一列：第一次就答對？作答秒數、是不是太快就答錯、重考有沒有答對、開放題寫了什麼
 *   測驗紀錄  每一次隨堂測驗一列（每課保留最近 5 次）
 */
const DB = '_db', SUM = '進度總表', DETAIL = '作答明細', QUIZ = '測驗紀錄';
const SUM_HEAD = ['冒險者', '課程', '第一次就答對', '已作答題數', '過關關數', '開放題回答數', '更新時間', 'pid',
  '隨堂測驗最佳', '隨堂測驗最近', '測驗完成次數', '測驗開始次數', '太快答錯題數', '獎章'];
const DETAIL_HEAD = ['冒險者', '課程', '關卡', '題目', '第一次就答對', '開放題回答', '更新時間', 'pid',
  '第一次作答秒數', '太快就答錯', '重考答對'];
const QUIZ_HEAD = ['冒險者', '課程', '測驗時間', '答對', '題數', '答對率', '花費秒數', '答錯的題目', 'pid'];
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < header.length || sh.getRange(1, header.length).getValue() !== header[header.length - 1])
    sh.getRange(1, 1, 1, header.length).setValues([header]); // 舊版表頭補上新欄位
  return sh;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function authed_(t) {
  const need = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !need || t === need;
}
function validPath_(p) {
  const s = String(p || '').split('/');
  return s.length >= 1 && s.length <= 16 && s.every(x => SEG.test(x) && x !== '.' && x !== '..');
}
function safe_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function dbRows_() { const sh = sheet_(DB, ['path', 'json', 'updatedAt']); return { sh, v: sh.getDataRange().getValues() }; }

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authed_(p.token)) return out_({ ok: false, error: 'unauthorized' });
  const path = String(p.path || '');
  if (!validPath_(path)) return out_({ ok: false, error: 'bad path' });
  const segs = path.split('/'), v = dbRows_().v;
  if (segs.length % 2 === 0) {
    for (let i = 1; i < v.length; i++) if (v[i][0] === path) return out_({ ok: true, data: JSON.parse(v[i][1]) });
    return out_({ ok: true, data: null });
  }
  const pre = path + '/', n = segs.length + 1, list = [];
  for (let i = 1; i < v.length; i++) {
    const k = String(v[i][0]);
    if (k.indexOf(pre) === 0 && k.split('/').length === n) list.push({ id: k.split('/').pop(), data: JSON.parse(v[i][1]) });
  }
  return out_({ ok: true, list });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  if (!authed_(b.token)) return out_({ ok: false, error: 'unauthorized' });
  if (!validPath_(b.path) || b.path.split('/').length % 2 !== 0) return out_({ ok: false, error: 'bad path' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (b.op === 'lease') {
      const c = CacheService.getScriptCache(), k = 'lease:' + b.path;
      if (c.get(k)) return out_({ ok: true, acquired: false });
      c.put(k, String(b.holder || 'x'), Math.max(1, Math.min(600, Math.round((b.ttlMs || 30000) / 1000))));
      return out_({ ok: true, acquired: true });
    }
    if (b.op === 'set') {
      if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return out_({ ok: false, error: 'bad data' });
      const json = JSON.stringify(b.data);
      if (json.length > 45000) return out_({ ok: false, error: 'too large' });
      const { sh, v } = dbRows_(), now = new Date();
      let r = -1;
      for (let i = 1; i < v.length; i++) if (v[i][0] === b.path) { r = i + 1; break; }
      if (r > 0) sh.getRange(r, 1, 1, 3).setValues([[b.path, json, now]]);
      else sh.appendRow([b.path, json, now]);
      const m = b.path.match(/^players\/([^/]+)\/lessons\/([^/]+)$/);
      if (m) summarize_(m[1], m[2], b.data, v, now);
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'unknown op' });
  } finally {
    lock.releaseLock();
  }
}

function playerName_(pid, v) {
  for (let i = 1; i < v.length; i++) if (v[i][0] === 'players/' + pid) { try { return JSON.parse(v[i][1]).name; } catch (e) {} }
  return pid;
}

function summarize_(pid, lid, d, v, now) {
  const name = safe_(playerName_(pid, v));
  const stars = d.stars || {}, done = d.done || {}, ans = d.answers || {};
  const firstRight = Object.keys(stars).filter(k => stars[k]).length;

  const secs = d.secs || {}, rush = d.rush || {}, retry = d.retry || {}, quiz = d.quiz || {};
  const score = q => q && q.n ? q.right + '／' + q.n : ''; // 全形斜線，避免試算表當成日期

  const sum = sheet_(SUM, SUM_HEAD);
  const sv = sum.getDataRange().getValues();
  const row = [name, lid, firstRight, Object.keys(stars).length, Object.keys(done).filter(k => done[k]).length, Object.keys(ans).length, now, pid,
    score(quiz.best), score(quiz.last), quiz.times || 0, quiz.started || 0, Object.keys(rush).filter(k => rush[k]).length, medal_(d.medal)];
  let r = -1;
  for (let i = 1; i < sv.length; i++) if (sv[i][7] === pid && sv[i][1] === lid) { r = i + 1; break; }
  if (r > 0) sum.getRange(r, 1, 1, row.length).setValues([row]); else sum.appendRow(row);

  rewrite_(sheet_(DETAIL, DETAIL_HEAD), DETAIL_HEAD, 7, 1, pid, lid, Array.from(new Set(Object.keys(stars).concat(Object.keys(ans)))).sort().map(k => {
    const parts = k.split('/');
    return [name, lid, parts[0], parts[1] || '', k in stars ? (stars[k] ? '是' : '否') : '', safe_(ans[k] || ''), now, pid,
      k in secs ? secs[k] : '', rush[k] ? '是' : '', k in retry ? (retry[k] ? '是' : '否') : ''];
  }));

  rewrite_(sheet_(QUIZ, QUIZ_HEAD), QUIZ_HEAD, 8, 1, pid, lid, (quiz.log || []).map(q =>
    [name, lid, new Date(q.at), q.right, q.n, q.n ? Math.round(q.right / q.n * 100) + '%' : '', q.secs || '', (q.wrong || []).join('、'), pid]));
}

function medal_(m) {
  return m && m.title ? (['金', '銀', '銅'][m.tier] || '') + '・' + safe_(m.rank) + '（' + safe_(m.title) + '）' : '';
}

// 把某位冒險者某一課的列整個換成新的，其他人的列保留；舊列補齊到新表頭的欄數
function rewrite_(sh, head, pidCol, lidCol, pid, lid, rows) {
  const v = sh.getDataRange().getValues();
  const fit = r => { r = r.slice(0, head.length); while (r.length < head.length) r.push(''); return r; };
  const keep = [head];
  for (let i = 1; i < v.length; i++) if (!(v[i][pidCol] === pid && v[i][lidCol] === lid)) keep.push(fit(v[i]));
  rows.forEach(r => keep.push(fit(r)));
  sh.clearContents();
  sh.getRange(1, 1, keep.length, head.length).setValues(keep);
}
