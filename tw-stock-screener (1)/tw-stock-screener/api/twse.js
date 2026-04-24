/**
 * Vercel Serverless Function — TWSE Proxy
 * 解決瀏覽器 CORS 限制，讓前端可安全呼叫台灣證交所 API
 * 
 * 同時負責解析 fields + data，回傳標準化物件陣列，
 * 避免前端猜測欄位索引的問題。
 */

const TWSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer': 'https://www.twse.com.tw/zh/trading/foreign/t86.html',
  'Origin': 'https://www.twse.com.tw',
};

function cleanNum(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

/** Parse T86 三大法人買賣超 → array of { stock_id, name, foreign_net, trust_net, dealer_net, total_net } */
function parseInstitutional(raw) {
  if (!raw || raw.stat !== 'OK') return [];
  const fields = raw.fields || [];
  const rows   = raw.data   || [];

  // Find column indices by field name keywords
  const idx = (keywords) => {
    const ki = Array.isArray(keywords) ? keywords : [keywords];
    return fields.findIndex(f => ki.some(k => f.includes(k)));
  };

  // T86 fields (17 cols):
  // 證券代號, 證券名稱,
  // 外資買進, 外資賣出, 外資買賣超,
  // 投信買進, 投信賣出, 投信買賣超,
  // 自營商(自行買賣)買進, 自營商(自行買賣)賣出, 自營商(自行買賣)買賣超,
  // 自營商(避險)買進, 自營商(避險)賣出, 自營商(避險)買賣超,
  // 自營商買賣超, 三大法人買賣超股數(張), (sometimes 16 or 17 cols)
  // The LAST column is always 三大法人合計買賣超

  const idIdx   = idx(['證券代號', '股票代號', '代號']);
  const nameIdx = idx(['證券名稱', '名稱', '公司']);
  
  // Find net columns by position relative to each institution
  // Strategy: search for 買賣超 columns after each institution keyword
  const foreignNetIdx = (() => {
    for (let i = 0; i < fields.length; i++) {
      if ((fields[i].includes('外資') || fields[i].includes('外陸資')) && fields[i].includes('買賣超')) return i;
    }
    return -1;
  })();
  const trustNetIdx = (() => {
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].includes('投信') && fields[i].includes('買賣超')) return i;
    }
    return -1;
  })();
  const dealerNetIdx = (() => {
    // 自營商買賣超 (合計, not 自行 or 避險)
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].includes('自營商') && fields[i].includes('買賣超') && !fields[i].includes('自行') && !fields[i].includes('避險')) return i;
    }
    return -1;
  })();
  // 三大法人合計 = last numeric-looking column, or search directly
  const totalNetIdx = (() => {
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].includes('三大法人') && fields[i].includes('買賣超')) return i;
    }
    // fallback: last column
    return fields.length - 1;
  })();

  console.log('[T86 fields]', fields);
  console.log('[T86 idx]', { idIdx, nameIdx, foreignNetIdx, trustNetIdx, dealerNetIdx, totalNetIdx });

  return rows
    .filter(r => r[idIdx] && /^\d{4}/.test(String(r[idIdx]).trim()))
    .map(r => ({
      stock_id:    String(r[idIdx]).trim(),
      name:        String(r[nameIdx] || '').trim(),
      foreign_net: cleanNum(r[foreignNetIdx]),
      trust_net:   cleanNum(r[trustNetIdx]),
      dealer_net:  cleanNum(r[dealerNetIdx]),
      total_net:   cleanNum(r[totalNetIdx]),
    }));
}

/** Parse MI_INDEX 個股收盤行情 → array of { stock_id, close, volume } */
function parsePrices(raw) {
  if (!raw || raw.stat !== 'OK') return [];

  // MI_INDEX has multiple sub-tables: fields9/data9, fields8/data8, etc.
  // We want fields9/data9 (上市股票)
  const fields = raw.fields9 || raw.fields || [];
  const rows   = raw.data9   || raw.data   || [];
  if (!rows.length) return [];

  const idIdx    = fields.findIndex(f => f.includes('證券代號') || f.includes('代號') || f.includes('股票代號'));
  const closeIdx = fields.findIndex(f => f.includes('收盤') && !f.includes('昨'));
  const volIdx   = fields.findIndex(f => f.includes('成交股數') || (f.includes('成交量') && !f.includes('累')));

  console.log('[MI_INDEX fields]', fields.slice(0, 12));
  console.log('[MI_INDEX idx]', { idIdx, closeIdx, volIdx });

  if (idIdx < 0 || closeIdx < 0 || volIdx < 0) {
    // Fallback: use positional (common layout: 0=代號,1=名稱,2=成交股數,3=成交金額,4=開盤,5=最高,6=最低,7=收盤,...)
    return rows
      .filter(r => r[0] && /^\d{4}/.test(String(r[0]).trim()))
      .map(r => ({
        stock_id: String(r[0]).trim(),
        close:    cleanNum(r[7]),  // 收盤 is usually index 7 in ALLBUT0999
        volume:   cleanNum(r[2]),  // 成交股數 is usually index 2
      }))
      .filter(d => d.close > 0);
  }

  return rows
    .filter(r => r[idIdx] && /^\d{4}/.test(String(r[idIdx]).trim()))
    .map(r => ({
      stock_id: String(r[idIdx]).trim(),
      close:    cleanNum(r[closeIdx]),
      volume:   cleanNum(r[volIdx]),
    }))
    .filter(d => d.close > 0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, date, debug } = req.query;

  // Cache parsed results for 8 hours (data won't change after market close)
  res.setHeader('Cache-Control', 's-maxage=28800, stale-while-revalidate=3600');

  try {
    let url = '';

    if (type === 'institutional') {
      url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${date}&selectType=ALL`;
    } else if (type === 'prices') {
      url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&date=${date}&type=ALLBUT0999`;
    } else {
      return res.status(400).json({ error: 'Unknown type. Use: institutional | prices' });
    }

    const response = await fetch(url, {
      headers: TWSE_HEADERS,
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `TWSE HTTP ${response.status}`, url });
    }

    const raw = await response.json();

    // debug=1 → return raw JSON for inspection
    if (debug === '1') {
      return res.status(200).json({
        _debug: true,
        stat: raw.stat,
        fields: raw.fields || raw.fields9,
        sample_rows: (raw.data || raw.data9 || []).slice(0, 3),
      });
    }

    // Parse and return normalized array
    let parsed;
    if (type === 'institutional') {
      parsed = parseInstitutional(raw);
    } else {
      parsed = parsePrices(raw);
    }

    return res.status(200).json({ stat: raw.stat || 'OK', date, count: parsed.length, data: parsed });

  } catch (err) {
    console.error('[TWSE Proxy Error]', err.message);
    return res.status(503).json({ error: 'Fetch failed', detail: err.message });
  }
}
