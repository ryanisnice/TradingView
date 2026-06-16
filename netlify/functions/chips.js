// netlify/functions/chips.js

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

    // Clean Taiwan stock suffixes (.TW or .TWO) to extract raw stock ID for FinMind dataset
    const cleanSymbol = symbol.replace(/\.(TW|TWO)$/i, '');

    // Calculate start date: 6 months ago from today in YYYY-MM-DD format
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    const year = sixMonthsAgo.getFullYear();
    const month = String(sixMonthsAgo.getMonth() + 1).padStart(2, '0');
    const day = String(sixMonthsAgo.getDate()).padStart(2, '0');
    const start_date = `${year}-${month}-${day}`;

    // Target FinMind dataset for Taiwan Stock Institutional Investors Buy/Sell
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${encodeURIComponent(cleanSymbol)}&start_date=${start_date}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`FinMind API responded with status ${response.status}`);
    }

    const json = await response.json();
    const apiData = json.data || [];

    // Aggregate daily buy and sell totals across all institutional investors
    const dailyNet = {};
    apiData.forEach((item) => {
      const dateStr = item.date;
      if (!dateStr) return;

      const buy = parseFloat(item.buy) || 0;
      const sell = parseFloat(item.sell) || 0;
      const net = buy - sell;

      if (dailyNet[dateStr] === undefined) {
        dailyNet[dateStr] = 0;
      }
      dailyNet[dateStr] += net;
    });

    // Format output as array of { time: unix_timestamp_seconds, value: net_shares }
    const result = Object.keys(dailyNet).map((dateStr) => {
      const parts = dateStr.split('-');
      // Use UTC to prevent local timezone shifts in lightweight-charts
      const time = Math.floor(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])) / 1000);
      return {
        time,
        value: dailyNet[dateStr]
      };
    });

    // Sort results chronologically ascending (required by lightweight-charts)
    result.sort((a, b) => a.time - b.time);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error("FinMind Chips API Serverless Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to fetch chips data from FinMind API",
        message: error.message
      })
    };
  }
};
