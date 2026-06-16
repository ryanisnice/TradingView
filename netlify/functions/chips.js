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

    // Group institutional buy/sell records by date
    const dailyGroups = {};
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

        if (!dailyGroups[dateStr]) {
          dailyGroups[dateStr] = { trust: 0, foreign: 0, dealer: 0 };
        }
        dailyGroups[dateStr][mappedName] += net;
      }
    });

    // Sort dates chronologically ascending
    const sortedDates = Object.keys(dailyGroups).sort();

    // Track consecutive buy days and yesterday's net buy/sell statuses
    const consecutiveBuy = { trust: 0, foreign: 0, dealer: 0 };
    const prevNet = { trust: 0, foreign: 0, dealer: 0 };
    const threshold = 5000000; // 5000 sheets * 1000 shares/sheet = 5,000,000 shares

    const groupNames = {
      trust: '投信',
      foreign: '外資',
      dealer: '自營商'
    };

    const markers = [];

    sortedDates.forEach((dateStr) => {
      const parts = dateStr.split('-');
      const unixTime = Math.floor(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])) / 1000);

      const buyTriggers = [];
      const sellTriggers = [];

      for (const group of ['trust', 'foreign', 'dealer']) {
        const netShares = dailyGroups[dateStr][group] || 0;

        // Condition B (Sell Signal): transition from net buy yesterday (> 0) to net sell today (< 0)
        if (prevNet[group] > 0 && netShares < 0) {
          sellTriggers.push(`${groupNames[group]}轉買為賣`);
        }

        // Update consecutive buying days
        if (netShares > 0) {
          consecutiveBuy[group] += 1;
        } else {
          consecutiveBuy[group] = 0;
        }

        // Condition A (Buy Signal): consecutive buys >= 3 and today's buy volume > 5,000,000 shares
        if (consecutiveBuy[group] >= 3 && netShares > threshold) {
          buyTriggers.push(`${groupNames[group]}連買${consecutiveBuy[group]}天且爆量`);
        }

        // Save net shares for tomorrow
        prevNet[group] = netShares;
      }

      // Merge signals per date to avoid overlapping markers
      if (buyTriggers.length > 0) {
        markers.push({
          time: unixTime,
          date: dateStr,
          position: 'belowBar',
          color: '#ef5350',
          shape: 'arrowUp',
          text: `[買進訊號] ${buyTriggers.join(', ')}`,
          size: 2
        });
      }

      if (sellTriggers.length > 0) {
        markers.push({
          time: unixTime,
          date: dateStr,
          position: 'aboveBar',
          color: '#26a69a',
          shape: 'arrowDown',
          text: `[賣出訊號] ${sellTriggers.join(', ')}`,
          size: 2
        });
      }
    });

    // Sort markers chronologically
    markers.sort((a, b) => a.time - b.time);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(markers)
    };

  } catch (error) {
    console.error("FinMind Chips API Serverless Function Error:", error);
    // Fall back to empty array on API failure
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify([])
    };
  }
};
