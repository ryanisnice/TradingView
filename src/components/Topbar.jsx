import React from 'react';
import {
  Activity,
  Cloud,
  LayoutGrid,
  Maximize2,
  Settings,
  ChevronDown,
  LineChart,
  Search
} from 'lucide-react';

export default function Topbar({ currentSymbol, currentTimeframe, onSelectTimeframe }) {
  const timeframes = ['1m', '5m', '1h', '1D'];

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

        {/* Symbol Search Display */}
        <div className="flex items-center space-x-1 bg-tradingview-bg hover:bg-tradingview-border/40 border border-tradingview-border px-2.5 py-1 rounded cursor-pointer transition-tv">
          <Search size={13} className="text-tradingview-textSecondary" />
          <span className="text-xs font-bold text-tradingview-textPrimary px-1">
            {currentSymbol}
          </span>
          <ChevronDown size={12} className="text-tradingview-textSecondary" />
        </div>

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

        {/* Layout actions */}
        <div className="flex items-center space-x-1">
          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv">
            <Maximize2 size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv">
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
