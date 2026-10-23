/**
 * 學習大陸：用 Google 試算表保存闖關進度。
 * 貼到試算表的「擴充功能 → Apps Script」，部署成網頁應用程式即可（步驟見 README.md）。
 *
 * 分頁：
 *   _db       原始資料（請勿手動修改）：path、json、updatedAt
 *   進度總表  每位冒險者每一課一列
 *   作答明細  每一題一列：第一次就答對？開放題寫了什麼
 */
const DB = '_db', SUM = '進度總表', DETAIL = '作答明細';
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
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

  const sum = sheet_(SUM, ['冒險者', '課程', '第一次就答對', '已作答題數', '過關關數', '開放題回答數', '更新時間', 'pid']);
  const sv = sum.getDataRange().getValues();
  const row = [name, lid, firstRight, Object.keys(stars).length, Object.keys(done).filter(k => done[k]).length, Object.keys(ans).length, now, pid];
  let r = -1;
  for (let i = 1; i < sv.length; i++) if (sv[i][7] === pid && sv[i][1] === lid) { r = i + 1; break; }
  if (r > 0) sum.getRange(r, 1, 1, row.length).setValues([row]); else sum.appendRow(row);

  const det = sheet_(DETAIL, ['冒險者', '課程', '關卡', '題目', '第一次就答對', '開放題回答', '更新時間', 'pid']);
  const dv = det.getDataRange().getValues();
  const keep = [dv[0]];
  for (let i = 1; i < dv.length; i++) if (!(dv[i][7] === pid && dv[i][1] === lid)) keep.push(dv[i]);
  const keys = Array.from(new Set(Object.keys(stars).concat(Object.keys(ans)))).sort();
  keys.forEach(k => {
    const parts = k.split('/');
    keep.push([name, lid, parts[0], parts[1] || '', k in stars ? (stars[k] ? '是' : '否') : '', safe_(ans[k] || ''), now, pid]);
  });
  det.clearContents();
  det.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
}
