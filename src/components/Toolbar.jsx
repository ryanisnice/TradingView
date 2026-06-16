import React, { useState } from 'react';
import {
  MousePointer,
  Crosshair,
  Slash,
  AlignJustify,
  Brush,
  Type,
  Eraser,
  Ruler,
  ZoomIn,
  Lock,
  Eye,
  Trash2,
  Settings
} from 'lucide-react';

export default function Toolbar({ activeTool, setActiveTool, onClearDrawings, showMobileWatchlist }) {
  const [isLocked, setIsLocked] = useState(false);

  const tools = [
    { id: 'cursor', icon: MousePointer, label: '鼠標' },
    { id: 'crosshair', icon: Crosshair, label: '十字準星' },
    { id: 'trendline', icon: Slash, label: '趨勢線' },
    { id: 'fibonacci', icon: AlignJustify, label: '斐波那契回撤' },
    { id: 'brush', icon: Brush, label: '畫筆' },
    { id: 'text', icon: Type, label: '文字' },
    { id: 'eraser', icon: Eraser, label: '橡皮擦' },
    { id: 'ruler', icon: Ruler, label: '測量' },
    { id: 'zoom', icon: ZoomIn, label: '放大' },
  ];

  return (
    <div className={`w-full md:w-[48px] h-[50px] md:h-full flex-row md:flex-col justify-between items-center bg-tradingview-card border-t md:border-t-0 md:border-r border-tradingview-border px-3 md:px-0 py-0 md:py-2 text-tradingview-textSecondary select-none overflow-x-auto md:overflow-x-visible whitespace-nowrap scrollbar-none z-20 order-last md:order-first ${
      showMobileWatchlist ? 'hidden md:flex' : 'flex'
    }`}>
      {/* Top/Left tools list */}
      <div className="flex flex-row md:flex-col space-x-1 md:space-x-0 md:space-y-1 items-center flex-shrink-0">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
              className={`w-9 h-9 rounded flex items-center justify-center transition-tv relative group flex-shrink-0 ${
                isActive
                  ? 'bg-tradingview-border text-tradingview-up'
                  : 'hover:bg-tradingview-border hover:text-tradingview-textPrimary'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              
              {/* Active Indicator bar */}
              {isActive && (
                <>
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-tradingview-up rounded-r hidden md:block" />
                  <div className="absolute bottom-0 left-1.5 right-1.5 h-[3px] bg-tradingview-up rounded-t md:hidden" />
                </>
              )}

              {/* Tooltip */}
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 md:bottom-auto md:left-[52px] md:translate-x-0 bg-[#2a2e39] text-[#d1d4dc] text-[10px] px-2 py-1.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
                {tool.label}
              </div>
            </button>
          );
        })}

        <div className="w-px md:w-6 h-6 md:h-px bg-tradingview-border mx-1.5 md:mx-0 my-0 md:my-2 flex-shrink-0" />

        {/* Lock/Eye Utilities */}
        <button
          onClick={() => setIsLocked(!isLocked)}
          title={isLocked ? '解鎖全部繪圖' : '鎖定全部繪圖'}
          className={`w-9 h-9 rounded flex items-center justify-center transition-tv relative group flex-shrink-0 ${
            isLocked
              ? 'bg-tradingview-border text-[#ff9800]'
              : 'hover:bg-tradingview-border hover:text-tradingview-textPrimary'
          }`}
        >
          <Lock size={18} />
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 md:bottom-auto md:left-[52px] md:translate-x-0 bg-[#2a2e39] text-[#d1d4dc] text-[10px] px-2 py-1.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
            {isLocked ? '解鎖全部繪圖' : '鎖定全部繪圖'}
          </div>
        </button>

        <button
          title="隱藏所有繪圖"
          className="w-9 h-9 rounded flex items-center justify-center transition-tv hover:bg-tradingview-border hover:text-tradingview-textPrimary relative group flex-shrink-0"
        >
          <Eye size={18} />
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 md:bottom-auto md:left-[52px] md:translate-x-0 bg-[#2a2e39] text-[#d1d4dc] text-[10px] px-2 py-1.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
            隱藏所有繪圖
          </div>
        </button>
      </div>

      {/* Bottom/Right Actions */}
      <div className="flex flex-row md:flex-col space-x-1 md:space-x-0 md:space-y-1 items-center flex-shrink-0 ml-4 md:ml-0">
        <button
          onClick={onClearDrawings}
          title="刪除繪圖"
          className="w-9 h-9 rounded flex items-center justify-center transition-tv hover:bg-tradingview-border hover:text-[#ef5350] relative group flex-shrink-0"
        >
          <Trash2 size={18} />
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 md:bottom-auto md:left-[52px] md:translate-x-0 bg-[#2a2e39] text-[#d1d4dc] text-[10px] px-2 py-1.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
            刪除繪圖
          </div>
        </button>

        <button
          title="圖表設置"
          className="w-9 h-9 rounded flex items-center justify-center transition-tv hover:bg-tradingview-border hover:text-tradingview-textPrimary relative group flex-shrink-0"
        >
          <Settings size={18} />
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 md:bottom-auto md:left-[52px] md:translate-x-0 bg-[#2a2e39] text-[#d1d4dc] text-[10px] px-2 py-1.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
            圖表設置
          </div>
        </button>
      </div>
    </div>
  );
}
