// src/services/marketData.js

import { symbols, generateMockData } from '../mockData';
import { fetchBinanceKlines, isCryptoSymbol, mapTimeframeToInterval } from '../binanceService';

const API_BASE_URL = '/.netlify/functions/yahoo';

// Map local timeframe to Yahoo Finance interval
export const mapIntervalToYahoo = (timeframe) => {
  const mapping = {
    '1m': '1m',
    '5m': '5m',
    '1h': '60m',
    '1D': '1d',
  };
  return mapping[timeframe] || '1d';
};

// Map timeframe to appropriate Yahoo Finance query range to prevent 400 errors
export const getYahooRange = (timeframe) => {
  if (timeframe === '1m') return '1d';      // Yahoo max is 7 days for 1m
  if (timeframe === '5m') return '5d';      // Yahoo max is 60 days for 5m
  if (timeframe === '1h') return '1mo';     // Yahoo max is 730 days for 60m
  return '1y';                              // Daily range default 1 year
};

/**
 * Fetches historical K-line data for stock or crypto symbols.
 * Stocks: Yahoo Finance API (via Serverless Function)
 * Cryptos: Binance API
 */
export const fetchHistoricalKlines = async (symbol, timeframe) => {
  const isCrypto = isCryptoSymbol(symbol);
  
  if (!isCrypto) {
    const yahooInterval = mapIntervalToYahoo(timeframe);
    const yahooRange = getYahooRange(timeframe);
    const targetUrl = `${API_BASE_URL}?symbol=${symbol}&interval=${yahooInterval}&range=${yahooRange}`;
    
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`Yahoo API status ${res.status}`);
      const data = await res.json();
      
      const chartResult = data.chart?.result?.[0];
      if (chartResult && chartResult.timestamp) {
        const timestamps = chartResult.timestamp;
        const quote = chartResult.indicators?.quote?.[0];
        
        const candlestick = [];
        const volume = [];

        if (quote && quote.open) {
          for (let i = 0; i < timestamps.length; i++) {
            const timeSec = timestamps[i];
            const o = quote.open[i];
            const h = quote.high[i];
            const l = quote.low[i];
            const c = quote.close[i];
            const v = quote.volume ? quote.volume[i] || 0 : 0;

            // Filter out null values which occur occasionally on early market listings
            if (timeSec === null || o === null || h === null || l === null || c === null) {
              continue;
            }

            candlestick.push({ time: timeSec, open: o, high: h, low: l, close: c });
            volume.push({ time: timeSec, value: v, color: c >= o ? '#26a69a' : '#ef5350' });
          }
          return { candlestick, volume };
        }
      }
      throw new Error("Invalid Yahoo Finance chart response structure");
    } catch (e) {
      console.warn("Yahoo Finance fetch failed, using local mock data fallback:", e);
      return generateMockData(symbol, timeframe);
    }
  }

  // Cryptos Fallback: Binance API
  const binanceInterval = mapTimeframeToInterval(timeframe);
  return fetchBinanceKlines(symbol, binanceInterval);
};

/**
 * Fetches real-time quotes for all symbols in the watchlist.
 * Stocks: Yahoo Finance API v8 Chart Endpoint (via Serverless Function)
 * Cryptos: Binance API Ticker Endpoint (Direct call)
 */
export const fetchWatchlistQuotes = async (symbolsList) => {
  const updatedPromises = symbolsList.map(async (item) => {
    const isCrypto = isCryptoSymbol(item.name);

    if (isCrypto) {
      // Fetch crypto quotes directly from Binance ticker endpoint
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${item.name.toUpperCase()}`);
        if (res.ok) {
          const data = await res.json();
          return {
            ...item,
            price: parseFloat(data.lastPrice),
            change: parseFloat(data.priceChangePercent),
          };
        }
      } catch (e) {
        console.warn(`Binance quote fetch failed for symbol ${item.name}:`, e);
      }
      return item;
    } else {
      // Fetch stock quotes from Yahoo v8 Chart Endpoint via Serverless Function
      const targetUrl = `${API_BASE_URL}?symbol=${item.name}&interval=1d&range=1d`;
      try {
        const res = await fetch(targetUrl);
        if (res.ok) {
          const json = await res.json();
          const chartResult = json.chart?.result?.[0];
          if (chartResult && chartResult.meta) {
            const regularMarketPrice = chartResult.meta.regularMarketPrice;
            const chartPreviousClose = chartResult.meta.chartPreviousClose;
            
            // Extract shortName or longName from Yahoo chart meta to resolve corporate names
            const companyName = chartResult.meta.shortName || chartResult.meta.longName || item.desc;
            
            if (regularMarketPrice !== undefined && chartPreviousClose !== undefined) {
              const changePercent = ((regularMarketPrice - chartPreviousClose) / chartPreviousClose) * 100;
              return {
                ...item,
                price: regularMarketPrice,
                change: parseFloat(changePercent.toFixed(2)),
                desc: companyName, // Assign resolved real corporate name
              };
            }
          }
        }
      } catch (e) {
        console.warn(`Yahoo v8 quote fetch failed for symbol ${item.name}:`, e);
      }
      return item;
    }
  });

  return Promise.all(updatedPromises);
};

/**
 * Subscribes to real-time tick updates for a symbol.
 * Crypto: Binance WebSocket (real-time, free, public)
 * Stock: Hybrid 10s Yahoo quote poller + 2s micro-tick simulator
 */
export const subscribeToRealtime = (symbol, timeframe, onTick) => {
  const isCrypto = isCryptoSymbol(symbol);
  
  if (isCrypto) {
    const binanceInterval = mapTimeframeToInterval(timeframe);
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${binanceInterval}`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg && msg.k) {
        const k = msg.k;
        const t = Math.floor(k.t / 1000);
        const c = parseFloat(k.c);
        const v = parseFloat(k.v);
        onTick({
          time: t,
          price: c,
          volume: v,
          o: parseFloat(k.o),
          h: parseFloat(k.h),
          l: parseFloat(k.l)
        });
      }
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  } else {
    // Stocks: 10s Polling + 2s Micro-tick Simulator
    const intervalSec = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : timeframe === '1h' ? 3600 : 86400;
    
    // Initialize currentPrice to null. Remove mockData dependency to prevent price jumping.
    let currentPrice = null;
    let currentVolume = 10000;

    const fetchQuote = async () => {
      const targetUrl = `${API_BASE_URL}?symbol=${symbol}&interval=1d&range=1d`;
      try {
        const res = await fetch(targetUrl);
        if (res.ok) {
          const json = await res.json();
          const chartResult = json.chart?.result?.[0];
          if (chartResult && chartResult.meta && chartResult.meta.regularMarketPrice) {
            currentPrice = chartResult.meta.regularMarketPrice;
            currentVolume = chartResult.meta.regularMarketVolume || currentVolume;
          }
        }
      } catch (e) {
        console.warn("Real-time quote poll failed for symbol:", symbol, e);
      }
    };

    // Trigger initial poll immediately
    fetchQuote();

    // 10s interval poll to fetch true price
    const pollTimer = setInterval(fetchQuote, 10000);

    // 2s interval micro-tick simulator to animate chart
    const tickTimer = setInterval(() => {
      // Guard: If the real price has not been fetched yet, do not send any ticks
      if (currentPrice === null) return;

      const now = Math.floor(Date.now() / 1000);
      const currentTime = now - (now % intervalSec);
      
      const change = (Math.random() - 0.49) * 0.0003 * currentPrice;
      currentPrice = parseFloat((currentPrice + change).toFixed(2));
      
      onTick({
        time: currentTime,
        price: currentPrice,
        volume: Math.round(currentVolume / (intervalSec / 2) + Math.random() * 500),
      });
    }, 2000);

    return () => {
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    };
  }
};

/**
 * Fetches institutional investors trading strategy markers for Taiwan Stock symbols.
 * Returns an array of marker objects: { time, position, color, shape, text, size }
 */
export const fetchInstitutionalChips = async (symbol) => {
  const isCrypto = isCryptoSymbol(symbol);
  if (isCrypto) return [];

  try {
    const res = await fetch(`/.netlify/functions/chips?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Chips API responded with status ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("Failed to fetch institutional investor chips:", e);
    return [];
  }
};
