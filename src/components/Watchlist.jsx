import React, { useEffect, useState } from 'react';
import { symbols } from '../mockData';
import { fetchWatchlistQuotes } from '../services/marketData';
import { Plus, Search, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';

export default function Watchlist({ currentSymbol, onSelectSymbol }) {
  const [watchlist, setWatchlist] = useState(symbols);

  // Fetch initial quotes on mount
  useEffect(() => {
    let isMounted = true;

    const loadQuotes = async () => {
      try {
        const freshQuotes = await fetchWatchlistQuotes(symbols);
        if (isMounted) {
          setWatchlist(freshQuotes);
        }
      } catch (err) {
        console.warn("Failed to load watchlist quotes:", err);
      }
    };

    loadQuotes();

    // Setup local micro-tick price simulator to make prices update in real-time in the UI
    const timer = setInterval(() => {
      if (!isMounted) return;
      
      setWatchlist((prevList) =>
        prevList.map((item) => {
          // Add a tiny random price tick (0.01% - 0.03% max) to make it feel alive
          const isUp = Math.random() > 0.49;
          const pct = (Math.random() * 0.0003) + 0.0001;
          const diff = item.price * pct * (isUp ? 1 : -1);
          const newPrice = parseFloat((item.price + diff).toFixed(2));
          
          return {
            ...item,
            price: newPrice,
          };
        })
      );
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const activeSymbolInfo = watchlist.find((s) => s.name === currentSymbol) || watchlist[0] || symbols[0];
  
  // Calculate mock day high/low based on current dynamic price
  const activePrice = activeSymbolInfo.price;
  const dayLow = activePrice * 0.985;
  const dayHigh = activePrice * 1.015;
  const rangePercent = 50;

  return (
    <div className="w-[300px] h-full flex flex-col bg-tradingview-card border-l border-tradingview-border select-none overflow-hidden">
      {/* Watchlist Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-tradingview-border">
        <div className="flex items-center space-x-1.5 cursor-pointer text-tradingview-textPrimary hover:text-white">
          <span className="text-xs font-semibold uppercase tracking-wider">自選股清單</span>
          <ChevronDown size={14} className="text-tradingview-textSecondary" />
        </div>
        <div className="flex items-center space-x-2">
          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv">
            <Search size={15} />
          </button>
          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv">
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* List Headers */}
      <div className="grid grid-cols-12 px-4 py-2 border-b border-tradingview-border text-[10px] font-semibold text-tradingview-textSecondary uppercase tracking-wider bg-tradingview-bg/20">
        <span className="col-span-5">商品</span>
        <span className="col-span-4 text-right">最新價</span>
        <span className="col-span-3 text-right">漲跌%</span>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.map((item) => {
          const isSelected = item.name === currentSymbol;
          const isUp = item.change >= 0;
          return (
            <div
              key={item.name}
              onClick={() => onSelectSymbol(item.name)}
              className={`grid grid-cols-12 px-4 py-3 items-center border-b border-tradingview-border/40 cursor-pointer transition-tv hover:bg-tradingview-border/30 relative ${
                isSelected ? 'bg-tradingview-border/50' : ''
              }`}
            >
              {/* Left active highlight */}
              {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-tradingview-up" />
              )}

              {/* Symbol Name */}
              <div className="col-span-5 flex flex-col justify-center min-w-0 pr-2">
                <span className={`text-xs font-bold truncate ${
                  isSelected ? 'text-tradingview-up' : 'text-tradingview-textPrimary'
                }`}>
                  {item.name}
                </span>
                <span className="text-[10px] text-tradingview-textSecondary truncate">
                  {item.desc}
                </span>
              </div>

              {/* Symbol Price */}
              <div className="col-span-4 text-right text-xs font-mono font-semibold text-tradingview-textPrimary">
                {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>

              {/* Symbol Change% */}
              <div className="col-span-3 text-right">
                <span
                  className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded font-mono text-white min-w-[55px] text-center ${
                    isUp ? 'bg-[#26a69a]' : 'bg-[#ef5350]'
                  }`}
                >
                  {isUp ? '+' : ''}{item.change.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Details & Info Panel */}
      <div className="h-[250px] border-t border-tradingview-border bg-tradingview-bg/40 p-4 flex flex-col justify-between overflow-y-auto">
        <div>
          {/* Symbol Description details */}
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-tradingview-textPrimary truncate">
                {activeSymbolInfo.name}
              </h4>
              <p className="text-[11px] text-tradingview-textSecondary truncate">
                {activeSymbolInfo.desc}
              </p>
            </div>
            <span className="text-[10px] uppercase font-semibold text-tradingview-textSecondary px-1.5 py-0.5 bg-tradingview-border rounded">
              {activeSymbolInfo.category}
            </span>
          </div>

          {/* Large Price Info */}
          <div className="flex items-baseline space-x-2 mt-3">
            <span className="text-2xl font-bold font-mono text-tradingview-textPrimary">
              {activeSymbolInfo.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <div className={`flex items-center text-xs font-semibold ${
              activeSymbolInfo.change >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'
            }`}>
              {activeSymbolInfo.change >= 0 ? <TrendingUp size={14} className="mr-0.5" /> : <TrendingDown size={14} className="mr-0.5" />}
              <span>{activeSymbolInfo.change >= 0 ? '+' : ''}{activeSymbolInfo.change.toFixed(2)}%</span>
            </div>
          </div>

          <div className="w-full h-px bg-tradingview-border/60 my-3" />

          {/* Session Day Range low - high slider */}
          <div className="flex flex-col space-y-1 text-[11px]">
            <div className="flex justify-between text-tradingview-textSecondary">
              <span>今日範圍</span>
            </div>
            <div className="flex justify-between items-center text-xs font-mono font-semibold text-tradingview-textPrimary">
              <span>{dayLow.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              <div className="flex-1 mx-3 h-1 bg-tradingview-border rounded relative">
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-tradingview-textPrimary"
                  style={{ left: `${rangePercent}%` }}
                />
              </div>
              <span>{dayHigh.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Mock News / Stats */}
        <div className="mt-4 text-[11px]">
          <span className="text-tradingview-textSecondary uppercase font-bold tracking-wider text-[9px]">
            相關新聞 / 市場動態
          </span>
          <div className="mt-1 bg-tradingview-border/20 p-2 rounded border border-tradingview-border/40 hover:bg-tradingview-border/40 cursor-pointer transition-tv">
            <h5 className="font-semibold text-tradingview-textPrimary line-clamp-2">
              分析師指出 {activeSymbolInfo.name} 在關鍵支撐位表現強勁，短期多頭排列顯著。
            </h5>
            <span className="text-[9px] text-tradingview-textSecondary block mt-1">2 小時前 · Bloomberg</span>
          </div>
        </div>
      </div>
    </div>
  );
}
