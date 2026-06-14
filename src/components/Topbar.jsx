import React, { useState } from 'react';
import {
  Activity,
  Cloud,
  LayoutGrid,
  Maximize2,
  Settings,
  ChevronDown,
  LineChart,
  Search,
  List
} from 'lucide-react';
import { fetchWatchlistQuotes } from '../services/marketData';
import { isCryptoSymbol } from '../binanceService';

export default function Topbar({ 
  currentSymbol, 
  currentTimeframe, 
  onSelectTimeframe, 
  onSelectSymbol,
  showMobileWatchlist,
  setShowMobileWatchlist
}) {
  const timeframes = ['1m', '5m', '1h', '1D'];
  const [isEditing, setIsEditing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSearchSubmit = async (e) => {
    if (e.key === 'Enter') {
      const trimmed = searchInput.trim().toUpperCase();
      if (!trimmed) {
        setIsEditing(false);
        return;
      }

      setIsValidating(true);
      const isCrypto = isCryptoSymbol(trimmed);
      const tempItem = {
        name: trimmed,
        desc: isCrypto ? `${trimmed.replace('USDT', '')} / U.S. Dollar Tether` : `${trimmed} Stock`,
        price: 0,
        change: 0,
        category: isCrypto ? 'Crypto' : 'Stock',
      };

      try {
        const validatedQuotes = await fetchWatchlistQuotes([tempItem]);
        const validatedItem = validatedQuotes[0];

        if (validatedItem && validatedItem.price > 0) {
          onSelectSymbol(validatedItem);
          setIsEditing(false);
        } else {
          alert("查無此商品或代號錯誤");
        }
      } catch (err) {
        console.error("Search validation error:", err);
        alert("查無此商品或代號錯誤");
      } finally {
        setIsValidating(false);
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    if (!isValidating) {
      setIsEditing(false);
    }
  };

  return (
    <div className="h-[48px] w-full flex items-center justify-between bg-tradingview-card border-b border-tradingview-border px-4 text-tradingview-textSecondary select-none">
      {/* Left section: Logo & Symbol switcher & Timeframe */}
      <div className="flex items-center space-x-3">
        {/* Logo */}
        <div className="flex items-center space-x-1.5 mr-2">
          <div className="w-5 h-5 bg-tradingview-up rounded flex items-center justify-center text-white font-bold text-xs">
            T
          </div>
          <span className="text-xs font-bold text-tradingview-textPrimary tracking-wide hidden sm:inline">
            ANTIGRAVITY VIEW
          </span>
        </div>

        <div className="w-px h-5 bg-tradingview-border" />

        {/* Symbol Search Display / Input */}
        {isEditing ? (
          <div className="relative flex items-center bg-tradingview-bg border border-tradingview-up px-2.5 py-1 rounded">
            <Search size={13} className="text-tradingview-up mr-1 flex-shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchSubmit}
              onBlur={handleBlur}
              disabled={isValidating}
              placeholder="搜尋代碼..."
              className="bg-transparent text-xs font-bold text-tradingview-textPrimary outline-none w-[100px] disabled:opacity-50"
              autoFocus
            />
            {isValidating && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                <div className="w-3 h-3 border-2 border-tradingview-up/30 border-t-tradingview-up rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        ) : (
          <div 
            onClick={() => {
              setSearchInput('');
              setIsEditing(true);
            }}
            className="flex items-center space-x-1 bg-tradingview-bg hover:bg-tradingview-border/40 border border-tradingview-border px-2.5 py-1 rounded cursor-pointer transition-tv"
          >
            <Search size={13} className="text-tradingview-textSecondary flex-shrink-0" />
            <span className="text-xs font-bold text-tradingview-textPrimary px-1 truncate max-w-[90px]">
              {currentSymbol}
            </span>
            <ChevronDown size={12} className="text-tradingview-textSecondary flex-shrink-0" />
          </div>
        )}

        <div className="w-px h-5 bg-tradingview-border" />

        {/* Timeframe Buttons */}
        <div className="flex items-center space-x-0.5 bg-tradingview-bg/50 p-0.5 rounded border border-tradingview-border">
          {timeframes.map((tf) => {
            const isActive = currentTimeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => onSelectTimeframe(tf)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-tv ${
                  isActive
                    ? 'bg-tradingview-border text-tradingview-up'
                    : 'hover:bg-tradingview-border/40 hover:text-tradingview-textPrimary'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-tradingview-border hidden md:inline" />

        {/* Mock Indicators Dropdown */}
        <button className="flex items-center space-x-1 px-2.5 py-1 rounded border border-tradingview-border bg-tradingview-bg/30 text-xs text-tradingview-textPrimary hover:bg-tradingview-border/40 transition-tv hidden md:flex">
          <Activity size={13} className="text-tradingview-up" />
          <span>指標</span>
          <ChevronDown size={11} className="text-tradingview-textSecondary" />
        </button>

        {/* Mock Templates */}
        <button className="flex items-center space-x-1 px-2.5 py-1 rounded border border-tradingview-border bg-tradingview-bg/30 text-xs text-tradingview-textPrimary hover:bg-tradingview-border/40 transition-tv hidden lg:flex">
          <LayoutGrid size={13} />
          <span>範本</span>
        </button>
      </div>

      {/* Right section: Statuses & Options */}
      <div className="flex items-center space-x-4">
        {/* Market status indicator */}
        <div className="flex items-center space-x-1.5 hidden sm:flex">
          <span className="w-2.5 h-2.5 rounded-full bg-[#26a69a] animate-pulse" />
          <span className="text-[10px] font-bold text-tradingview-up tracking-wide">
            連線中 (Live)
          </span>
        </div>

        <div className="w-px h-5 bg-tradingview-border hidden sm:inline" />

        {/* Cloud saving status */}
        <div className="flex items-center space-x-1.5 text-tradingview-textSecondary hover:text-tradingview-textPrimary cursor-pointer transition-tv hidden md:flex">
          <Cloud size={15} />
          <span className="text-[10px] font-semibold">已存入雲端</span>
        </div>

        {/* Layout actions & Mobile Toggle */}
        <div className="flex items-center space-x-1">
          {/* Mobile Watchlist Toggle Button */}
          <button 
            onClick={() => setShowMobileWatchlist(!showMobileWatchlist)}
            className={`p-1.5 rounded text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv md:hidden ${
              showMobileWatchlist ? 'bg-tradingview-border text-tradingview-up' : ''
            }`}
            title={showMobileWatchlist ? '顯示圖表' : '顯示自選股'}
          >
            <List size={16} />
          </button>

          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv hidden md:block">
            <Maximize2 size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv hidden md:block">
            <Settings size={14} />
          </button>
        </div>

        <div className="w-px h-5 bg-tradingview-border" />

        {/* User avatar / profile button */}
        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 border border-tradingview-border flex items-center justify-center text-[10px] text-white font-bold cursor-pointer">
          AG
        </div>
      </div>
    </div>
  );
}
