export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, date } = req.query;

  // 修正：暫時關閉快取，避免抓到下午 4 點前的空資料後被卡死
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    let url = '';
    if (type === 'institutional') {
      url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${date}&selectType=ALL`;
    } else if (type === 'prices') {
      url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&date=${date}&type=ALLBUT0999`;
    } else {
      return res.status(400).json({ error: 'Unknown type' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.twse.com.tw/',
      },
      // 增加超時時間到 20 秒
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return res.status(502).json({ error: 'TWSE server error' });

    const data = await response.json();
    
    // 如果證交所回傳「查詢無資料」(stat != OK)，我們回傳明確錯誤
    if (data.stat !== 'OK') {
      return res.status(200).json({ ...data, _custom_msg: '證交所資料尚未更新或日期錯誤' });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(503).json({ error: 'Connection failed', detail: err.message });
  }
}
