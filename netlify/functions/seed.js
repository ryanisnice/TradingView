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
    const start_date = `${year}-${month}-${day}`;

    // Initialize Supabase Client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration environment variables: SUPABASE_URL or SUPABASE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Yahoo Finance K-line and FinMind institutional buy/sell data in parallel
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}?interval=1d&range=1y`;
    const finmindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${encodeURIComponent(cleanSymbol)}&start_date=${start_date}`;

    const fetchHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    const [yahooRes, finmindRes] = await Promise.all([
      fetch(yahooUrl, { method: 'GET', headers: fetchHeaders }),
      fetch(finmindUrl, { method: 'GET', headers: fetchHeaders })
    ]);

    if (!yahooRes.ok) {
      throw new Error(`Yahoo Finance API responded with status ${yahooRes.status}`);
    }
    if (!finmindRes.ok) {
      throw new Error(`FinMind API responded with status ${finmindRes.status}`);
    }

    const [yahooData, finmindData] = await Promise.all([
      yahooRes.json(),
      finmindRes.json()
    ]);

    // 1. Clean & Transform K-line Data
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
        const v = quote.volume ? quote.volume[i] || 0 : 0;

        // Skip null trading days (market holidays etc.)
        if (timeSec === null || o === null || h === null || l === null || c === null) {
          continue;
        }

        klinesData.push({
          symbol: cleanSymbol,
          date: formatDate(timeSec),
          open: parseFloat(o),
          high: parseFloat(h),
          low: parseFloat(l),
          close: parseFloat(c),
          volume: parseInt(v)
        });
      }
    }

    // 2. Clean & Transform Chips Data
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
      return {
        symbol: cleanSymbol,
        date: dateStr,
        foreign_net: dailyChips[dateStr].foreign_net,
        trust_net: dailyChips[dateStr].trust_net,
        dealer_net: dailyChips[dateStr].dealer_net
      };
    });

    // 3. Write data to Supabase (Upsert to handle conflict)
    let klinesUpsertCount = 0;
    let chipsUpsertCount = 0;

    if (klinesData.length > 0) {
      const { error: klinesError } = await supabase
        .from('daily_klines')
        .upsert(klinesData, { onConflict: 'symbol, date' });

      if (klinesError) {
        throw new Error(`daily_klines upsert failed: ${klinesError.message}`);
      }
      klinesUpsertCount = klinesData.length;
    }

    if (chipsData.length > 0) {
      const { error: chipsError } = await supabase
        .from('daily_chips')
        .upsert(chipsData, { onConflict: 'symbol, date' });

      if (chipsError) {
        throw new Error(`daily_chips upsert failed: ${chipsError.message}`);
      }
      chipsUpsertCount = chipsData.length;
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
        error: "Failed to seed database historical records",
        message: error.message
      })
    };
  }
};
