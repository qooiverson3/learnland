// 學習大陸：把進度存到 Google 試算表（搭配 apps-script/Code.gs）。
// 在載入這個檔案之前設定：
//   window.LEARNLAND_GAS   = Apps Script 網頁應用程式網址（/exec 結尾）
//   window.LEARNLAND_TOKEN = 選用，和指令碼屬性 TOKEN 相同
(function () {
  const API = window.LEARNLAND_GAS;
  if (!API) return;
  const TOKEN = window.LEARNLAND_TOKEN || '';
  async function call(method, params) {
    const r = method === 'GET'
      ? await fetch(API + '?' + new URLSearchParams({ path: params.path, token: TOKEN }))
      // text/plain 不會觸發 CORS 預檢，Apps Script 才收得到
      : await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({}, params, { token: TOKEN })) });
    if (!r.ok) throw { code: 'unavailable', message: 'HTTP ' + r.status };
    const j = await r.json();
    if (!j.ok) throw { code: 'unavailable', message: j.error || 'error' };
    return j;
  }
  const snap = (id, data) => ({
    id, exists: data != null, data: () => (data == null ? undefined : data),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  window.LEARNLAND_DB = {
    doc: (path) => ({
      path,
      get: async () => snap(path.split('/').pop(), (await call('GET', { path })).data),
      set: async (data) => { await call('POST', { op: 'set', path, data }); },
      acquire: async (o) => ({ acquired: (await call('POST', { op: 'lease', path, holder: o.holder, ttlMs: o.ttlMs })).acquired }),
    }),
    collection: (path) => ({
      get: async () => {
        const docs = ((await call('GET', { path })).list || []).map((x) => snap(x.id, x.data));
        return { docs, size: docs.length, empty: !docs.length };
      },
    }),
  };
})();
