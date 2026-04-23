/**
 * Vercel Serverless Function — TWSE Proxy
 * 解決瀏覽器 CORS 限制，讓前端可安全呼叫台灣證交所 API
 */

export default async function handler(req, res) {
  // CORS headers — 允許任何來源（或改成你自己的 domain）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { type, date } = req.query;

  // 快取：TWSE 資料收盤後不會變，可 cache 8 小時
  res.setHeader('Cache-Control', 's-maxage=28800, stale-while-revalidate');

  try {
    let url = '';

    if (type === 'institutional') {
      // 三大法人買賣超
      url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${date}&selectType=ALL`;
    } else if (type === 'prices') {
      // 個股收盤行情
      url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&date=${date}&type=ALLBUT0999`;
    } else {
      return res.status(400).json({ error: 'Unknown type. Use: institutional | prices' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TW-Stock-Screener/1.0)',
        'Accept': 'application/json',
        'Referer': 'https://www.twse.com.tw/',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `TWSE responded with ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[TWSE Proxy Error]', err.message);
    return res.status(503).json({ error: 'Failed to fetch from TWSE', detail: err.message });
  }
}
