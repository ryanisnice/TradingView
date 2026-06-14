import React, { useEffect, useState, useRef } from 'react';
import { symbols } from '../mockData';
import { fetchWatchlistQuotes } from '../services/marketData';
import { isCryptoSymbol } from '../binanceService';
import { Plus, Search, ChevronDown, TrendingUp, TrendingDown, X } from 'lucide-react';

export default function Watchlist({ currentSymbol, onSelectSymbol }) {
  // Load initial watchlists from localStorage
  const loadSavedWatchlists = () => {
    const saved = localStorage.getItem('tradingview_watchlists');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].items !== undefined) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse watchlists from localStorage:", e);
      }
    }
    
    // Check if there is an old single-array format in localStorage
    const oldSaved = localStorage.getItem('tradingview_watchlist');
    if (oldSaved) {
      try {
        const parsedOld = JSON.parse(oldSaved);
        if (Array.isArray(parsedOld)) {
          const defaultList = {
            id: 'default',
            name: '預設自選',
            items: parsedOld
          };
          return [defaultList];
        }
      } catch (e) {
        console.error("Failed to parse old watchlist:", e);
      }
    }
    
    // Default fallback
    return [
      {
        id: 'default',
        name: '預設自選',
        items: symbols
      }
    ];
  };

  const loadActiveListId = (lists) => {
    const savedId = localStorage.getItem('tradingview_active_list_id');
    if (savedId && lists.some(l => l.id === savedId)) {
      return savedId;
    }
    return lists[0]?.id || 'default';
  };

  const [watchlists, setWatchlists] = useState(loadSavedWatchlists);
  const [activeListId, setActiveListId] = useState(() => loadActiveListId(watchlists));
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // Auto-sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem('tradingview_watchlists', JSON.stringify(watchlists));
  }, [watchlists]);

  useEffect(() => {
    localStorage.setItem('tradingview_active_list_id', activeListId);
  }, [activeListId]);

  const activeList = watchlists.find((l) => l.id === activeListId) || watchlists[0] || { id: 'default', name: '預設自選', items: [] };
  const activeListItems = activeList.items;
  const activeSymbolNames = activeListItems.map((item) => item.name).join(',');

  // Poll real watchlist quotes only for current active watchlist
  useEffect(() => {
    let isMounted = true;

    if (activeListItems.length === 0) return;

    const loadQuotes = async () => {
      try {
        const freshQuotes = await fetchWatchlistQuotes(activeListItems);
        if (isMounted) {
          setWatchlists((prev) =>
            prev.map((l) => {
              if (l.id === activeListId) {
                return { ...l, items: freshQuotes };
              }
              return l;
            })
          );
        }
      } catch (err) {
        console.warn("Failed to load watchlist quotes:", err);
      }
    };

    loadQuotes();

    // Poll actual market quotes every 10 seconds
    const pollTimer = setInterval(loadQuotes, 10000);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
    };
  }, [activeListId, activeSymbolNames]);

  // Handle adding and validating a new symbol
  const handleAddSymbol = async (e) => {
    if (e.key === 'Enter') {
      const trimmed = newSymbolInput.trim().toUpperCase();
      if (!trimmed) return;
      
      // Prevent duplicate entry in the active list
      if (activeListItems.some((item) => item.name === trimmed)) {
        alert("此商品已在自選股清單中！");
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
        // Pre-validate the ticker price via API call
        const validatedQuotes = await fetchWatchlistQuotes([tempItem]);
        const validatedItem = validatedQuotes[0];

        if (validatedItem && validatedItem.price > 0) {
          // Formalize the addition to states
          const updated = watchlists.map(l => {
            if (l.id === activeListId) {
              return {
                ...l,
                items: [validatedItem, ...l.items]
              };
            }
            return l;
          });
          setWatchlists(updated);
          setNewSymbolInput('');
          setShowAddInput(false);
        } else {
          alert('找不到此商品或代號錯誤！請確認後再加 (台股請加上 .TW)');
        }
      } catch (err) {
        console.error("Symbol validation error:", err);
        alert('找不到此商品或代號錯誤！請確認後再加 (台股請加上 .TW)');
      } finally {
        setIsValidating(false);
      }
    }
  };

  // Handle removing a symbol from the current active list
  const handleRemoveSymbol = (symbolName) => {
    const updated = watchlists.map(l => {
      if (l.id === activeListId) {
        return {
          ...l,
          items: l.items.filter(item => item.name !== symbolName)
        };
      }
      return l;
    });
    setWatchlists(updated);
  };

  // List management operations
  const handleCreateList = () => {
    setShowDropdown(false);
    const name = window.prompt("請輸入新自選單名稱：");
    if (!name || !name.trim()) return;
    
    const newId = `list_${Date.now()}`;
    const newList = {
      id: newId,
      name: name.trim(),
      items: []
    };
    
    const updated = [...watchlists, newList];
    setWatchlists(updated);
    setActiveListId(newId);
  };

  const handleRenameList = () => {
    setShowDropdown(false);
    const currentList = watchlists.find(l => l.id === activeListId);
    if (!currentList) return;

    const newName = window.prompt("請輸入新的清單名稱：", currentList.name);
    if (!newName || !newName.trim() || newName.trim() === currentList.name) return;

    const updated = watchlists.map(l => {
      if (l.id === activeListId) {
        return { ...l, name: newName.trim() };
      }
      return l;
    });
    setWatchlists(updated);
  };

  const handleDeleteList = () => {
    setShowDropdown(false);
    if (watchlists.length <= 1) return;

    const currentList = watchlists.find(l => l.id === activeListId);
    if (!currentList) return;

    const confirmed = window.confirm(`確定要刪除「${currentList.name}」自選單嗎？`);
    if (!confirmed) return;

    const updated = watchlists.filter(l => l.id !== activeListId);
    setWatchlists(updated);

    const nextListId = updated[0].id;
    setActiveListId(nextListId);
  };

  const activeSymbolInfo = activeListItems.find((s) => s.name === currentSymbol) || activeListItems[0] || symbols[0];
  
  // Calculate day high/low bounds based on dynamic price
  const activePrice = activeSymbolInfo.price;
  const dayLow = activePrice * 0.985;
  const dayHigh = activePrice * 1.015;
  const rangePercent = 50;

  return (
    <div className="w-[300px] h-full flex flex-col bg-tradingview-card border-l border-tradingview-border select-none overflow-hidden">
      {/* Watchlist Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-tradingview-border relative z-30">
        <div 
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center space-x-1.5 cursor-pointer text-tradingview-textPrimary hover:text-white select-none min-w-0"
        >
          <span className="text-xs font-semibold uppercase tracking-wider truncate max-w-[150px]">
            {activeList.name}
          </span>
          <ChevronDown size={14} className={`text-tradingview-textSecondary transition-transform duration-200 flex-shrink-0 ${
            showDropdown ? 'rotate-180' : ''
          }`} />
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button className="p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv">
            <Search size={15} />
          </button>
          <button 
            onClick={() => setShowAddInput(!showAddInput)}
            disabled={isValidating}
            className={`p-1.5 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-tradingview-textPrimary transition-tv ${
              showAddInput ? 'bg-tradingview-border text-tradingview-up' : ''
            }`}
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Dropdown Menu */}
        {showDropdown && (
          <>
            <div 
              className="fixed inset-0 z-40 cursor-default" 
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute left-4 top-11 w-[200px] bg-tradingview-card border border-tradingview-border rounded shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="max-h-[160px] overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-bold text-tradingview-textSecondary uppercase tracking-wider">
                  切換自選單
                </div>
                {watchlists.map((list) => (
                  <div
                    key={list.id}
                    onClick={() => {
                      setActiveListId(list.id);
                      setShowDropdown(false);
                    }}
                    className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-tv ${
                      list.id === activeListId
                        ? 'text-tradingview-up bg-tradingview-border/40 font-semibold'
                        : 'text-tradingview-textPrimary hover:bg-tradingview-border/20'
                    }`}
                  >
                    <span className="truncate">{list.name}</span>
                    <span className="text-[10px] text-tradingview-textSecondary ml-2 flex-shrink-0">
                      ({list.items.length})
                    </span>
                  </div>
                ))}
              </div>

              <div className="h-px bg-tradingview-border my-1.5" />

              <button
                onClick={handleCreateList}
                className="w-full text-left px-3 py-2 text-xs text-tradingview-textPrimary hover:bg-tradingview-border/20 transition-tv flex items-center space-x-2"
              >
                <span>➕</span>
                <span>新增自選單</span>
              </button>
              <button
                onClick={handleRenameList}
                className="w-full text-left px-3 py-2 text-xs text-tradingview-textPrimary hover:bg-tradingview-border/20 transition-tv flex items-center space-x-2"
              >
                <span>✏️</span>
                <span>重新命名清單</span>
              </button>
              <button
                onClick={handleDeleteList}
                disabled={watchlists.length <= 1}
                className={`w-full text-left px-3 py-2 text-xs flex items-center space-x-2 transition-tv ${
                  watchlists.length <= 1
                    ? 'text-tradingview-textSecondary/40 cursor-not-allowed'
                    : 'text-red-400 hover:bg-red-500/10'
                }`}
              >
                <span>🗑️</span>
                <span>刪除目前清單</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Dynamic Add Symbol Input Field */}
      {showAddInput && (
        <div className="px-4 py-2 bg-tradingview-bg/40 border-b border-tradingview-border relative">
          <input
            type="text"
            value={newSymbolInput}
            onChange={(e) => setNewSymbolInput(e.target.value)}
            onKeyDown={handleAddSymbol}
            disabled={isValidating}
            placeholder={isValidating ? "正在驗證商品代號..." : "輸入代碼 (如 2330.TW, TSLA, BTCUSDT)..."}
            className="w-full bg-tradingview-bg text-tradingview-textPrimary border border-tradingview-border rounded px-2.5 py-1 text-xs outline-none focus:border-tradingview-up disabled:opacity-50"
            autoFocus
          />
          {isValidating && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center">
              <div className="w-3.5 h-3.5 border-2 border-tradingview-up/30 border-t-tradingview-up rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {/* List Headers */}
      <div className="grid grid-cols-12 px-4 py-2 border-b border-tradingview-border text-[10px] font-semibold text-tradingview-textSecondary uppercase tracking-wider bg-tradingview-bg/20">
        <span className="col-span-5">商品</span>
        <span className="col-span-4 text-right">最新價</span>
        <span className="col-span-3 text-right">漲跌%</span>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto">
        {activeListItems.map((item) => {
          const isSelected = item.name === currentSymbol;
          const isUp = item.change >= 0;
          return (
            <div
              key={item.name}
              onClick={() => onSelectSymbol(item.name)}
              className={`grid grid-cols-12 px-4 py-3 items-center border-b border-tradingview-border/40 cursor-pointer transition-tv hover:bg-tradingview-border/30 relative group ${
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
              <div className="col-span-3 text-right flex items-center justify-end">
                <span
                  className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded font-mono text-white min-w-[55px] text-center transform transition-transform duration-200 group-hover:-translate-x-6 ${
                    isUp ? 'bg-[#26a69a]' : 'bg-[#ef5350]'
                  }`}
                >
                  {isUp ? '+' : ''}{item.change.toFixed(2)}%
                </span>
              </div>

              {/* Delete Button (visible on hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent selecting symbol
                  handleRemoveSymbol(item.name);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-tradingview-border text-tradingview-textSecondary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                title="移除此商品"
              >
                <X size={12} />
              </button>
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
