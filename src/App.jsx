import React, { useState } from 'react';
import Topbar from './components/Topbar';
import Toolbar from './components/Toolbar';
import Chart from './components/Chart';
import Watchlist from './components/Watchlist';

function App() {
  const [currentSymbol, setCurrentSymbol] = useState('BTCUSDT');
  const [currentTimeframe, setCurrentTimeframe] = useState('1D');
  const [activeTool, setActiveTool] = useState('cursor');
  
  // Restructure trendlines as a dictionary mapped by symbol key
  const [trendlines, setTrendlines] = useState({});

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
      />

      {/* 2. Main content area containing drawing tools, chart canvas, and watchlist sidebar */}
      <div className="flex-1 flex w-full overflow-hidden">
        {/* Left Toolbar - Drawing actions */}
        <Toolbar 
          activeTool={activeTool} 
          setActiveTool={setActiveTool} 
          onClearDrawings={clearAllDrawings}
        />

        {/* Center Main Chart Area */}
        <div className="flex-1 h-full overflow-hidden relative">
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
          onSelectSymbol={setCurrentSymbol}
        />
      </div>
    </div>
  );
}

export default App;
