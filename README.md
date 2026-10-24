# 學習大陸

國小課程的 3D 闖關地圖。第一層是學科島，第二層是每一課的地標，第三層是課程場景，每棟建築是一關。

網址：https://qooiverson3.github.io/learnland/

## 結構

| 路徑 | 用途 |
| --- | --- |
| `index.html` | 遊戲引擎（3D 地圖、題目、帳號、進度） |
| `favicon.ico`、`apple-touch-icon.png`、`icon-512.png` | 網頁與手機主畫面圖示（紅色「學」字印章） |
| `config.js` | Google Apps Script 網址與 TOKEN |
| `db-gas.js` | 把進度讀寫到 Google 試算表 |
| `content/catalog.json` | 學科與課程目錄 |
| `content/<課程 id>.json` | 每一課的關卡與題目 |
| `apps-script/Code.gs` | 貼到 Google 試算表的後端程式 |
| `tools/validate.js` | 題庫檢查程式 |
| `.github/workflows/pages.yml` | 推到 `main` 時先檢查題庫，通過才部署 |

## 第一次設定

### 1. 開啟 GitHub Pages

repo 的 Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。之後每次推到 `main` 都會自動部署，到 Actions 分頁可以看進度。

### 2. 串接 Google 試算表

1. 在 Google 雲端硬碟建一份新試算表，例如「學習大陸進度」。
2. 「擴充功能 → Apps Script」，把 `apps-script/Code.gs` 整個貼上取代原本內容，儲存。
3. 「專案設定 → 指令碼屬性 → 新增」，名稱 `TOKEN`，值自己取一串英數字。
4. 「部署 → 新增部署作業」，類型「網頁應用程式」，執行身分「我」，誰可以存取「所有人」，部署並授權。複製 `/exec` 結尾的網址。
5. 把網址和 TOKEN 填進 `config.js`，commit 並推到 `main`。

完成後打開網站，登入畫面會顯示「已連上雲端」。試算表會出現三個分頁：

- `進度總表`：每位冒險者每一課一列
- `作答明細`：每一題第一次是否答對、開放題寫了什麼
- `_db`：原始資料，請勿手動修改

修改 `Code.gs` 後，要到「部署 → 管理部署作業 → 編輯 → 版本選新版本」，網址不變，新程式才會生效。

## 本機測試

```
python3 -m http.server 8080
# 開啟 http://localhost:8080
```

## 新增課程

在 Claude 用 `learnland-lesson` skill：附上課本照片，說「加進學習大陸」。新的課程檔放進 `content/`、更新 `content/catalog.json`，推到 `main` 即可。CI 會檢查題庫格式，並比對上一版，避免已發布的題目編號被更動。

## 注意

- 免費方案的 GitHub Pages 需要 public repo，所以這裡的題目與設定（包括 Apps Script 網址和 TOKEN）任何人都看得到。TOKEN 只能擋掉隨便亂打網址的人，不是真正的密碼。
- 題目引用了課本內容，請只給家人使用。網站已設定不讓搜尋引擎收錄，但知道網址的人仍然打得開。
- 冒險者名稱沒有密碼，知道名稱的人可以接著玩那個帳號。
