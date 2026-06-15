// netlify/functions/yahoo.js

exports.handler = async (event, context) => {
  // CORS Headers to allow requests from local dev server and production deployments
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
    const { symbol, interval, range } = event.queryStringParameters || {};

    if (!symbol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required query parameter: symbol" })
      };
    }

    // Default values if parameters are missing
    const queryInterval = interval || '1d';
    const queryRange = range || '1mo';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${queryInterval}&range=${queryRange}`;

    // Node 18+ provides native fetch globally
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: `Yahoo Finance API responded with status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Yahoo API Serverless Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to fetch data from Yahoo Finance API",
        message: error.message
      })
    };
  }
};
