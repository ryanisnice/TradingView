// netlify/functions/dashboard.js
import { createClient } from '@supabase/supabase-js';

export const handler = async (event, context) => {
  // CORS Headers to allow requests from local dev server and production deployments
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request from browser
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { symbol } = event.queryStringParameters || {};
    
    if (!symbol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required query parameter: symbol" })
      };
    }

    // Clean symbol suffix for FinMind query (e.g. 2344.TW -> 2344)
    const cleanSymbol = symbol.replace(/\.(TW|TWO)$/i, '');

    // Extreme URL Sanitization for Supabase Client
    let supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\s+/g, ''); // 移除所有隱藏空白
    if (!supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://' + supabaseUrl;
    }
    supabaseUrl = supabaseUrl.replace('https://https://', 'https://'); // 防止重複 https

    const supabaseKey = (process.env.SUPABASE_KEY || '').trim().replace(/\s+/g, '');

    if (!supabaseUrl || supabaseUrl === 'https://' || !supabaseKey) {
      throw new Error('Missing Supabase Environment Variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }, // 伺服器端無須 session
      global: { fetch: (...args) => fetch(...args) } // 強制使用原生 fetch，避免套件衝突
    });

    // Fetch latest 10 days of chip data for cleanSymbol sorted descending by date
    const { data: chipsData, error: chipsError } = await supabase
      .from('daily_chips')
      .select('date, foreign_net, trust_net, dealer_net')
      .eq('symbol', cleanSymbol)
      .order('date', { ascending: false })
      .limit(10);

    if (chipsError) {
      throw chipsError;
    }

    // Handle case with no database records for the symbol
    if (!chipsData || chipsData.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          fiveDayNet: '0 張',
          tenDayNet: '0 張',
          consensus: '無籌碼資料',
          hint: '📊 盤整：尚未建立此商品的籌碼資料。',
          trend: 'down'
        })
      };
    }

    // Coerce values to numbers and sum daily total for institutional investors
    const processedChips = chipsData.map(d => {
      const foreign = Number(d.foreign_net) || 0;
      const trust = Number(d.trust_net) || 0;
      const dealer = Number(d.dealer_net) || 0;
      const total = foreign + trust + dealer;
      return {
        foreign,
        trust,
        dealer,
        total
      };
    });

    // 5-Day Cumulative Net (Sum up to the first 5 records)
    const fiveDayCount = Math.min(processedChips.length, 5);
    let fiveDayNetShares = 0;
    for (let i = 0; i < fiveDayCount; i++) {
      fiveDayNetShares += processedChips[i].total;
    }

    // 10-Day Cumulative Net (Sum all records up to 10)
    let tenDayNetShares = 0;
    for (let i = 0; i < processedChips.length; i++) {
      tenDayNetShares += processedChips[i].total;
    }

    // Consensus ("土洋動向"): Look at the most recent day (index 0)
    const latest = processedChips[0];
    let consensus = '動向不明';
    if (latest.foreign > 0 && latest.trust > 0) {
      consensus = '外本比同買 (土洋共識)';
    } else if (latest.foreign < 0 && latest.trust < 0) {
      consensus = '外本比同賣 (土洋共識)';
    } else if ((latest.foreign > 0 && latest.trust < 0) || (latest.foreign < 0 && latest.trust > 0)) {
      consensus = '土洋對作 (多空交戰)';
    }

    // Trend: 'up' if 5-day cumulative net > 0, else 'down'
    const trend = fiveDayNetShares > 0 ? 'up' : 'down';

    // Intelligent Hint: Rule-based advice
    const fiveDayNetSheets = Math.round(fiveDayNetShares / 1000);
    let hint = '📊 盤整：法人籌碼處於觀望狀態，等待方向突破。';
    if (fiveDayNetSheets > 10000) {
      hint = '🔥 強勢：三大法人大舉進駐，籌碼極度集中！';
    } else if (fiveDayNetSheets < 0) {
      hint = '⚠️ 警戒：近期法人偏空操作，請留意支撐。';
    } else if (fiveDayNetSheets > 0) {
      hint = '📈 偏多：法人小幅買進，籌碼緩步加溫中。';
    }

    // Helper to format values as sheet counts (1 sheet = 1000 shares) with sign & thousand separator
    const formatNet = (valueInShares) => {
      const sheets = Math.round(valueInShares / 1000);
      const prefix = sheets > 0 ? '+' : '';
      return `${prefix}${sheets.toLocaleString('en-US')} 張`;
    };

    const fiveDayNet = formatNet(fiveDayNetShares);
    const tenDayNet = formatNet(tenDayNetShares);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fiveDayNet,
        tenDayNet,
        consensus,
        hint,
        trend
      })
    };

  } catch (error) {
    console.error("Dashboard API Serverless Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Fetching dashboard data failed",
        message: error.message
      })
    };
  }
};
