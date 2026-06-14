// src/binanceService.js

/**
 * Maps React UI timeframe strings to Binance API intervals.
 * @param {string} timeframe - e.g., '1m', '5m', '1h', '1D'
 * @returns {string} - e.g., '1m', '5m', '1h', '1d'
 */
export const mapTimeframeToInterval = (timeframe) => {
  const mapping = {
    '1m': '1m',
    '5m': '5m',
    '1h': '1h',
    '1D': '1d',
  };
  return mapping[timeframe] || '1d';
};

/**
 * Fetches historical K-line data from Binance.
 * @param {string} symbol - e.g., 'BTCUSDT'
 * @param {string} interval - e.g., '1d'
 * @param {number} limit - default 200
 * @returns {Promise<{ candlestick: Array, volume: Array }>}
 */
export const fetchBinanceKlines = async (symbol, interval, limit = 200) => {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.statusText}`);
  }
  const rawData = await response.json();

  const candlestick = [];
  const volume = [];

  rawData.forEach((item) => {
    const openTimeMs = item[0];
    const timeSec = Math.floor(openTimeMs / 1000);
    const open = parseFloat(item[1]);
    const high = parseFloat(item[2]);
    const low = parseFloat(item[3]);
    const close = parseFloat(item[4]);
    const value = parseFloat(item[5]);

    candlestick.push({
      time: timeSec,
      open,
      high,
      low,
      close,
    });

    volume.push({
      time: timeSec,
      value,
      color: close >= open ? '#26a69a' : '#ef5350',
    });
  });

  return { candlestick, volume };
};

/**
 * Checks if a symbol is a crypto currency handled by Binance.
 * For this project, symbols are marked by their category in mockData.js.
 * @param {string} symbol
 * @returns {boolean}
 */
export const isCryptoSymbol = (symbol) => {
  const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  return cryptoSymbols.includes(symbol.toUpperCase());
};
