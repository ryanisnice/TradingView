// src/mockData.js

export const symbols = [
  { name: 'BTCUSDT', desc: 'Bitcoin / U.S. Dollar Tether', price: 68250, change: 2.45, category: 'Crypto' },
  { name: 'ETHUSDT', desc: 'Ethereum / U.S. Dollar Tether', price: 3820, change: -1.22, category: 'Crypto' },
  { name: 'SOLUSDT', desc: 'Solana / U.S. Dollar Tether', price: 145.8, change: 5.67, category: 'Crypto' },
  { name: 'AAPL', desc: 'Apple Inc.', price: 192.5, change: 0.85, category: 'Stock' },
  { name: 'TSLA', desc: 'Tesla Inc.', price: 178.4, change: -3.42, category: 'Stock' },
  { name: 'NVDA', desc: 'NVIDIA Corporation', price: 875.5, change: 6.12, category: 'Stock' },
  { name: 'MSFT', desc: 'Microsoft Corporation', price: 425.2, change: 0.15, category: 'Stock' },
];

export const generateMockData = (symbol, timeframe) => {
  const symbolInfo = symbols.find(s => s.name === symbol) || symbols[0];
  const startPrice = symbolInfo.price;
  
  // Decide interval in seconds based on timeframe
  let intervalSec = 24 * 60 * 60; // default 1D
  if (timeframe === '1m') intervalSec = 60;
  else if (timeframe === '5m') intervalSec = 5 * 60;
  else if (timeframe === '1h') intervalSec = 60 * 60;
  
  const count = 200;
  const data = [];
  const volumeData = [];
  
  const now = Math.floor(Date.now() / 1000);
  let currentPrice = startPrice * 0.85; // start lower so it trends up
  
  // Volatility factor
  let vol = 0.005; // 0.5%
  if (symbolInfo.category === 'Crypto') vol = 0.015; // crypto is more volatile
  if (timeframe === '1m') vol = vol * 0.15;
  if (timeframe === '5m') vol = vol * 0.3;
  if (timeframe === '1h') vol = vol * 0.6;

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * intervalSec;
    
    // Simulate open, high, low, close
    const open = currentPrice;
    const changePercent = (Math.random() - 0.48) * 2 * vol; // slightly upward bias
    const close = currentPrice * (1 + changePercent);
    
    const high = Math.max(open, close) * (1 + Math.random() * vol * 0.4);
    const low = Math.min(open, close) * (1 - Math.random() * vol * 0.4);
    
    currentPrice = close;
    
    data.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });
    
    // Volume
    const baseVolume = symbolInfo.category === 'Crypto' ? 5000 : 500;
    const volume = baseVolume * (0.3 + Math.random() * 1.7) * (Math.abs(changePercent) / vol + 0.5);
    
    volumeData.push({
      time,
      value: Math.round(volume),
      color: close >= open ? '#26a69a' : '#ef5350', // green if close >= open, else red
    });
  }
  
  return { candlestick: data, volume: volumeData };
};
