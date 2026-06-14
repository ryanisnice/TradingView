// src/services/marketData.js

import { symbols } from '../mockData';
import { fetchBinanceKlines, isCryptoSymbol, mapTimeframeToInterval } from '../binanceService';

/**
 * Helper to fetch API requests through a CORS proxy.
 * Tries corsproxy.io first, and falls back to allorigins if needed.
 */
const fetchWithProxy = async (targetUrl) => {
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("CORS Proxy error");
    return res;
  } catch (e) {
    console.warn("Primary CORS proxy failed, trying fallback proxy...", e);
    const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    return fetch(fallbackUrl);
  }
};

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
 * Stocks: Yahoo Finance API (via CORS Proxy)
 * Cryptos: Binance API
 */
export const fetchHistoricalKlines = async (symbol, timeframe) => {
  const isCrypto = isCryptoSymbol(symbol);
  
  if (!isCrypto) {
    const yahooInterval = mapIntervalToYahoo(timeframe);
    const yahooRange = getYahooRange(timeframe);
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yahooInterval}&range=${yahooRange}`;
    
    try {
      const res = await fetchWithProxy(targetUrl);
      if (!res.ok) throw new Error(`Yahoo HTTP Status ${res.status}`);
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
 * Stocks: Yahoo Finance API Quote Endpoint (via CORS Proxy)
 * Cryptos: Local mock price or Binance API
 */
export const fetchWatchlistQuotes = async (symbolsList) => {
  // Extract stock symbols for Yahoo Quote Query
  const stocks = symbolsList.filter(s => !isCryptoSymbol(s.name));
  const cryptos = symbolsList.filter(s => isCryptoSymbol(s.name));

  let quotesMap = {};

  if (stocks.length > 0) {
    const symbolsString = stocks.map(s => s.name).join(',');
    const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsString}`;
    
    try {
      const res = await fetchWithProxy(targetUrl);
      if (res.ok) {
        const data = await res.json();
        const results = data.quoteResponse?.result || [];
        results.forEach((q) => {
          quotesMap[q.symbol.toUpperCase()] = {
            price: q.regularMarketPrice,
            change: q.regularMarketChangePercent,
          };
        });
      }
    } catch (e) {
      console.warn("Yahoo quote fetch failed for watchlist, falling back.", e);
    }
  }

  // Map quotes list
  return symbolsList.map((item) => {
    const isCrypto = isCryptoSymbol(item.name);
    
    if (!isCrypto) {
      const liveQuote = quotesMap[item.name.toUpperCase()];
      if (liveQuote && liveQuote.price !== undefined) {
        return {
          ...item,
          price: liveQuote.price,
          change: liveQuote.change || 0,
        };
      }
    }
    
    // Fallback: Slight random tick fluctuations for cryptos or failed stocks
    const changeFactor = 1 + (Math.random() - 0.5) * 0.0006;
    const newPrice = item.price * changeFactor;
    return {
      ...item,
      price: parseFloat(newPrice.toFixed(2)),
    };
  });
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
    
    // Find initial price from mockData symbols list
    const asset = symbols.find(s => s.name.toUpperCase() === symbol.toUpperCase());
    let currentPrice = asset ? asset.price : 150.0;
    let currentVolume = 10000;

    const fetchQuote = async () => {
      const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
      try {
        const res = await fetchWithProxy(targetUrl);
        if (res.ok) {
          const json = await res.json();
          const result = json.quoteResponse?.result?.[0];
          if (result && result.regularMarketPrice) {
            currentPrice = result.regularMarketPrice;
            currentVolume = result.regularMarketVolume || currentVolume;
          }
        }
      } catch (e) {
        console.warn("Real-time quote poll failed for symbol:", symbol, e);
      }
    };

    // Trigger initial poll
    fetchQuote();

    // 10s interval poll to fetch true price
    const pollTimer = setInterval(fetchQuote, 10000);

    // 2s interval micro-tick simulator to animate chart
    const tickTimer = setInterval(() => {
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
