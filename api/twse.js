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

function parseInstitutional(raw) {
  if (!raw || raw.stat !== 'OK') return [];
  const fields = raw.fields || [];
  const rows   = raw.data   || [];

  const idIdx   = fields.findIndex(f => ['證券代號','股票代號','代號'].some(k => f.includes(k)));
  const nameIdx = fields.findIndex(f => ['證券名稱','名稱'].some(k => f.includes(k)));

  const foreignNetIdx = (() => {
    for (let i = 0; i < fields.length; i++) {
      if ((fields[i].includes('外資及陸資') || fields[i].includes('外資')) && fields[i].includes('買賣超') && !fields[i].includes('自營')) return i;
    }
    return -1;
  })();

  const trustNetIdx = fields.findIndex(f => f.includes('投信') && f.includes('買賣超'));

  const dealerNetIdx = (() => {
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].includes('自營商') && fields[i].includes('買賣超') && !fields[i].includes('自行') && !fields[i].includes('避險')) return i;
    }
    return -1;
  })();

  const totalNetIdx = (() => {
    const i = fields.findIndex(f => f.includes('三大法人') && f.includes('買賣超'));
    return i >= 0 ? i : fields.length - 1;
  })();

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

function parsePrices(raw) {
  if (!raw || raw.stat !== 'OK') return [];
  const fields = raw.fields9 || raw.fields || [];
  const rows   = raw.data9   || raw.data   || [];
  if (!rows.length) return [];

  const idIdx    = fields.findIndex(f => f.includes('證券代號') || f.includes('代號'));
  const closeIdx = fields.findIndex(f => f.includes('收盤') && !f.includes('昨'));
  const volIdx   = fields.findIndex(f => f.includes('成交股數') || (f.includes('成交量') && !f.includes('累')));

  const usePositional = idIdx < 0 || closeIdx < 0 || volIdx < 0;

  return rows
    .filter(r => r[usePositional ? 0 : idIdx] && /^\d{4}/.test(String(r[usePositional ? 0 : idIdx]).trim()))
    .map(r => ({
      stock_id: String(r[usePositional ? 0 : idIdx]).trim(),
      close:    cleanNum(r[usePositional ? 8 : closeIdx]),
      volume:   cleanNum(r[usePositional ? 2 : volIdx]),
    }))
    .filter(d => d.close > 0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, date, debug } = req.query;
  res.setHeader('Cache-Control', 's-maxage=28800, stale-while-revalidate=3600');

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
      headers: TWSE_HEADERS,
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `TWSE HTTP ${response.status}` });
    }

    const raw = await response.json();

    if (debug === '1') {
      return res.status(200).json({
        _debug: true,
        stat: raw.stat,
        fields: raw.fields || raw.fields9,
        sample_rows: (raw.data || raw.data9 || []).slice(0, 2),
      });
    }

    const parsed = type === 'institutional' ? parseInstitutional(raw) : parsePrices(raw);
    return res.status(200).json({ stat: raw.stat || 'OK', date, count: parsed.length, data: parsed });

  } catch (err) {
    return res.status(503).json({ error: 'Fetch failed', detail: err.message });
  }
}
