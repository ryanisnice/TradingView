// netlify/functions/seed.js
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
    const targetSymbol = symbol || '2344.TW';
    
    // Clean symbol suffix for FinMind
    const cleanSymbol = targetSymbol.replace(/\.(TW|TWO)$/i, '');

    // Calculate dates: 1 year ago from today in YYYY-MM-DD format
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const year = oneYearAgo.getFullYear();
    const month = String(oneYearAgo.getMonth() + 1).padStart(2, '0');
    const day = String(oneYearAgo.getDate()).padStart(2, '0');
    const startDate = `${year}-${month}-${day}`;

    // 2. Supabase Environment Variables Guard with Trim
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase Environment Variables');
    }

    // Initialize Supabase Client
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fetchHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    // 1. Fetch Yahoo K-Lines
    let yahooData;
    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}?range=1y&interval=1d`;
      const res = await fetch(yahooUrl, { method: 'GET', headers: fetchHeaders });
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      yahooData = await res.json();
    } catch (e) {
      throw new Error('Yahoo Data Fetch Failed: ' + e.message);
    }

    // 2. Fetch FinMind Chips
    let finmindData;
    try {
      const finmindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${encodeURIComponent(cleanSymbol)}&start_date=${startDate}`;
      const res = await fetch(finmindUrl, { method: 'GET', headers: fetchHeaders });
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      finmindData = await res.json();
    } catch (e) {
      throw new Error('FinMind Data Fetch Failed: ' + e.message);
    }

    // Transform K-line Data
    const chartResult = yahooData.chart?.result?.[0];
    const timestamps = chartResult?.timestamp || [];
    const quote = chartResult?.indicators?.quote?.[0];
    const klinesData = [];

    const formatDate = (timestamp) => {
      const d = new Date(timestamp * 1000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${dayStr}`;
    };

    if (quote && quote.open) {
      for (let i = 0; i < timestamps.length; i++) {
        const timeSec = timestamps[i];
        const o = quote.open[i];
        const h = quote.high[i];
        const l = quote.low[i];
        const c = quote.close[i];
        const v = quote.volume ? quote.volume[i] : 0;

        const oVal = Number(o);
        const hVal = Number(h);
        const lVal = Number(l);
        const cVal = Number(c);
        const vVal = Number(v);

        // Filter out null, undefined, or NaN
        if (
          timeSec === null || timeSec === undefined || isNaN(timeSec) ||
          o === null || o === undefined || isNaN(oVal) ||
          h === null || h === undefined || isNaN(hVal) ||
          l === null || l === undefined || isNaN(lVal) ||
          c === null || c === undefined || isNaN(cVal) ||
          v === null || v === undefined || isNaN(vVal)
        ) {
          continue;
        }

        klinesData.push({
          symbol: cleanSymbol,
          date: formatDate(timeSec),
          open: oVal,
          high: hVal,
          low: lVal,
          close: cVal,
          volume: vVal
        });
      }
    }

    // Transform Chips Data
    const apiData = finmindData.data || [];
    const dailyChips = {};
    const nameMap = {
      'Investment_Trust': 'trust',
      '投信': 'trust',
      'Foreign_Investor': 'foreign',
      '外資及陸資': 'foreign',
      '外資及陸資(不含外資自營商)': 'foreign',
      'Dealer_self': 'dealer',
      '自營商': 'dealer',
      '自營商(自行買賣)': 'dealer',
      'Dealer_Hedging': 'dealer',
      '自營商(避險)': 'dealer'
    };

    apiData.forEach((item) => {
      const dateStr = item.date;
      if (!dateStr) return;

      const mappedName = nameMap[item.name];
      if (mappedName) {
        const buy = parseFloat(item.buy) || 0;
        const sell = parseFloat(item.sell) || 0;
        const net = buy - sell;

        if (!dailyChips[dateStr]) {
          dailyChips[dateStr] = { trust_net: 0, foreign_net: 0, dealer_net: 0 };
        }

        if (mappedName === 'trust') {
          dailyChips[dateStr].trust_net += net;
        } else if (mappedName === 'foreign') {
          dailyChips[dateStr].foreign_net += net;
        } else if (mappedName === 'dealer') {
          dailyChips[dateStr].dealer_net += net;
        }
      }
    });

    const chipsData = Object.keys(dailyChips).map((dateStr) => {
      const foreignNetVal = Number(dailyChips[dateStr].foreign_net) || 0;
      const trustNetVal = Number(dailyChips[dateStr].trust_net) || 0;
      const dealerNetVal = Number(dailyChips[dateStr].dealer_net) || 0;

      return {
        symbol: cleanSymbol,
        date: dateStr,
        foreign_net: foreignNetVal,
        trust_net: trustNetVal,
        dealer_net: dealerNetVal
      };
    });

    // 3. Upsert K-lines Data to Supabase
    let klinesUpsertCount = 0;
    if (klinesData.length > 0) {
      try {
        const { error: klinesError } = await supabase
          .from('daily_klines')
          .upsert(klinesData, { onConflict: 'symbol, date' });

        if (klinesError) {
          throw klinesError;
        }
        klinesUpsertCount = klinesData.length;
      } catch (e) {
        const cause = e.cause ? (e.cause.message || String(e.cause)) : 'Unknown cause';
        throw new Error(`daily_klines Upsert Failed: ${e.message} | Cause: ${cause}`);
      }
    }

    // 4. Upsert Chips Data to Supabase
    let chipsUpsertCount = 0;
    if (chipsData.length > 0) {
      try {
        const { error: chipsError } = await supabase
          .from('daily_chips')
          .upsert(chipsData, { onConflict: 'symbol, date' });

        if (chipsError) {
          throw chipsError;
        }
        chipsUpsertCount = chipsData.length;
      } catch (e) {
        const cause = e.cause ? (e.cause.message || String(e.cause)) : 'Unknown cause';
        throw new Error(`daily_chips Upsert Failed: ${e.message} | Cause: ${cause}`);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Data seeded successfully",
        symbol: cleanSymbol,
        klinesSeeded: klinesUpsertCount,
        chipsSeeded: chipsUpsertCount
      })
    };

  } catch (error) {
    console.error("Seed API Serverless Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Seeding Database Failed",
        message: error.message
      })
    };
  }
};
