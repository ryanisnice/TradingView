import React, { useState, useEffect } from 'react';
import Topbar from './components/Topbar';
import Toolbar from './components/Toolbar';
import Chart from './components/Chart';
import Watchlist from './components/Watchlist';
import { symbols } from './mockData';

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

function App() {
  const [currentSymbol, setCurrentSymbol] = useState('BTCUSDT');
  const [currentTimeframe, setCurrentTimeframe] = useState('1D');
  const [activeTool, setActiveTool] = useState('cursor');
  const [showMobileWatchlist, setShowMobileWatchlist] = useState(false);
  
  // Restructure trendlines as a dictionary mapped by symbol key
  const [trendlines, setTrendlines] = useState({});

  const [watchlists, setWatchlists] = useState(loadSavedWatchlists);
  const [activeListId, setActiveListId] = useState(() => loadActiveListId(watchlists));

  // Auto-sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem('tradingview_watchlists', JSON.stringify(watchlists));
  }, [watchlists]);

  useEffect(() => {
    localStorage.setItem('tradingview_active_list_id', activeListId);
  }, [activeListId]);

  const handleSelectSymbol = (symbolOrItem) => {
    if (typeof symbolOrItem === 'string') {
      setCurrentSymbol(symbolOrItem);
    } else {
      // Validated item object from Topbar
      setCurrentSymbol(symbolOrItem.name);
      setWatchlists((prev) => {
        return prev.map((list) => {
          if (list.id === activeListId) {
            const exists = list.items.some((item) => item.name === symbolOrItem.name);
            if (!exists) {
              return {
                ...list,
                items: [symbolOrItem, ...list.items]
              };
            }
          }
          return list;
        });
      });
    }
    setShowMobileWatchlist(false);
  };

  const clearAllDrawings = () => {
    setTrendlines((prev) => ({
      ...prev,
      [currentSymbol]: [],
    }));
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-tradingview-bg text-tradingview-textPrimary overflow-hidden font-sans">
      {/* 1. Top Navigation and Search bar */}
      <Topbar
        currentSymbol={currentSymbol}
        currentTimeframe={currentTimeframe}
        onSelectTimeframe={setCurrentTimeframe}
        onSelectSymbol={handleSelectSymbol}
        showMobileWatchlist={showMobileWatchlist}
        setShowMobileWatchlist={setShowMobileWatchlist}
      />

      {/* 2. Main content area containing drawing tools, chart canvas, and watchlist sidebar */}
      <div className="flex-1 flex flex-col md:flex-row w-full overflow-hidden">
        {/* Left Toolbar - Drawing actions */}
        <Toolbar 
          activeTool={activeTool} 
          setActiveTool={setActiveTool} 
          onClearDrawings={clearAllDrawings}
          showMobileWatchlist={showMobileWatchlist}
        />

        {/* Center Main Chart Area */}
        <div className={`flex-1 h-full overflow-hidden relative ${showMobileWatchlist ? 'hidden md:block' : 'block'}`}>
          <Chart
            symbol={currentSymbol}
            timeframe={currentTimeframe}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            trendlines={trendlines}
            setTrendlines={setTrendlines}
          />
        </div>

        {/* Right Watchlist Sidebar */}
        <Watchlist
          currentSymbol={currentSymbol}
          onSelectSymbol={handleSelectSymbol}
          watchlists={watchlists}
          setWatchlists={setWatchlists}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
          showMobileWatchlist={showMobileWatchlist}
        />
      </div>
    </div>
  );
}

export default App;
