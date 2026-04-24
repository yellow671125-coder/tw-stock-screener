# 台股法人連3買選股系統

部署到 Vercel 後，每日收盤後打開網頁點一下即可篩選。

## 專案結構

```
tw-stock-screener/
├── api/
│   └── twse.js          ← Vercel Serverless Function（TWSE Proxy）
├── public/
│   └── index.html       ← 前端 Web App
├── vercel.json          ← Vercel 路由設定
├── package.json
└── README.md
```

## 部署步驟（10分鐘完成）

### 方法一：直接從 GitHub 部署（推薦）

1. **建立 GitHub Repo**
   - 前往 https://github.com/new
   - 建立新 repo，例如 `tw-stock-screener`
   - 把這個資料夾的所有檔案上傳上去

2. **部署到 Vercel**
   - 前往 https://vercel.com，用 GitHub 帳號登入
   - 點 "Add New Project"
   - 選擇你的 `tw-stock-screener` repo
   - Framework Preset 選 **Other**
   - 直接點 **Deploy**（不需要改任何設定）
   - 等約 1 分鐘，完成！

3. **使用**
   - Vercel 會給你一個網址，例如 `https://tw-stock-screener.vercel.app`
   - 每日 16:00 後打開網址，點「開始篩選」即可

### 方法二：用 Vercel CLI 部署

```bash
# 安裝 Vercel CLI
npm install -g vercel

# 在專案資料夾內執行
cd tw-stock-screener
vercel

# 按提示操作，登入後選預設設定即可
# 完成後會顯示部署網址
```

## 篩選條件說明

| 條件 | 說明 |
|------|------|
| 法人連3買 | 外資＋投信＋自營商合計，連續3個交易日淨買超 > 0 |
| 現價 ≥ 成本×倍數 | 今日收盤 ≥ 前一日收盤 × 設定倍數（預設1.04） |
| 量 > N日均量 | 今日成交量 > 前N-1日平均量（預設5日） |

## 評分公式

```
綜合評分 = 3日累計買超（買超權重）
         + 量比（量比權重）
         + 超成本幅度（剩餘權重）

各指標均正規化至 0~100 分後加權
```

## 注意事項

- **資料更新時間**：TWSE 於每日收盤後 15:30~16:00 更新，建議 **16:00 後**執行
- **法人成本**：以前一日收盤價近似，非精確加權均價
- **僅供參考**：本工具為技術分析輔助，不構成投資建議
- **免費額度**：Vercel 免費方案每月有 100GB 流量、100小時 Function 執行時間，個人使用完全足夠

## 常見問題

**Q: 篩選結果顯示「資料不足」？**
A: 可能是收盤資料尚未更新，請 16:00 後再試。遇到國定假日、颱風停市等情況也可能無資料。

**Q: 可以加入上櫃股票（OTC）嗎？**
A: 可以，TPEx 有對應 API，需修改 `api/twse.js` 加入 OTC 端點。

**Q: 如何設定自動每日發送篩選結果？**
A: 可搭配 Vercel Cron Jobs（需付費方案）或自行設定 GitHub Actions 定時觸發。
