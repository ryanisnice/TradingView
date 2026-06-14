import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  LineSeries, 
  HistogramSeries 
} from 'lightweight-charts';
import { fetchHistoricalKlines, subscribeToRealtime } from '../services/marketData';

/**
 * Calculates Simple Moving Average (SMA) for K-line data.
 * @param {Array} data - K-line array containing { time, close }
 * @param {number} period - SMA period length
 * @returns {Array} - Array of { time, value }
 */
export const calculateSMA = (data, period = 20) => {
  const sma = [];
  if (data.length < period) return sma;
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  sma.push({
    time: data[period - 1].time,
    value: parseFloat((sum / period).toFixed(2)),
  });

  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period].close + data[i].close;
    sma.push({
      time: data[i].time,
      value: parseFloat((sum / period).toFixed(2)),
    });
  }
  
  return sma;
};

export default function Chart({ symbol, timeframe, activeTool, setActiveTool, trendlines, setTrendlines }) {
  const chartContainerRef = useRef(null);
  const hoveredTimeRef = useRef(null);
  
  // O(1) sliding window sum tracker
  const smaSumRef = useRef(0);

  // References to communicate with click & keydown handler closures
  const activeToolRef = useRef(activeTool);
  const drawingPointRef = useRef(null);

  // Chart and Series references to draw trendlines dynamically
  const chartRef = useRef(null);
  const trendlineSeriesListRef = useRef([]);

  // Local drawing point State (only relevant during active drawing)
  const [drawingPoint, setDrawingPoint] = useState(null);

  const [hudData, setHudData] = useState(null);
  const [activeChartType, setActiveChartType] = useState('candle'); // 'candle' or 'line'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Keep refs up-to-date with React states to avoid closure stale-value bugs
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    drawingPointRef.current = drawingPoint;
  }, [drawingPoint]);

  // Effect to draw trendlines dynamically without recreating the entire chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove old trendline series
    trendlineSeriesListRef.current.forEach((series) => {
      try {
        chart.removeSeries(series);
      } catch (e) {
        // Series already removed
      }
    });
    trendlineSeriesListRef.current = [];

    // Redraw all completed trendlines
    trendlines.forEach((line) => {
      const series = chart.addSeries(LineSeries, {
        color: '#29b6f6', // Light Blue for Trendlines
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData([
        { time: line.start.time, value: line.start.price },
        { time: line.end.time, value: line.end.price },
      ]);
      trendlineSeriesListRef.current.push(series);
    });
  }, [trendlines]);

  // Main K-line and live updates effect
  useEffect(() => {
    let isMounted = true;
    let chart = null;
    let unsubscribeRealtime = null;
    let resizeListener = null;
    let keydownListener = null;

    const initChart = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      try {
        let candleData = [];
        let volData = [];

        // Load historical time series data from abstract Market Data service
        const result = await fetchHistoricalKlines(symbol, timeframe);
        candleData = result.candlestick;
        volData = result.volume;

        if (!isMounted) return;

        // If no K-line data returned, display error
        if (candleData.length === 0) {
          throw new Error("無法取得此商品的歷史交易資料，請檢查 API 金鑰或網路連線。");
        }

        setLoading(false);

        // Calculate SMA(20) historical data
        const smaData = calculateSMA(candleData, 20);

        // Initialize O(1) sliding window sum to the sum of the last 20 elements
        if (candleData.length >= 20) {
          let sum = 0;
          for (let j = candleData.length - 20; j < candleData.length; j++) {
            sum += candleData[j].close;
          }
          smaSumRef.current = sum;
        } else {
          smaSumRef.current = 0;
        }

        // Prepopulate HUD with last data point
        const lastData = candleData[candleData.length - 1];
        const lastVol = volData[volData.length - 1];
        const lastSma = smaData[smaData.length - 1];
        setHudData({
          open: lastData.open,
          high: lastData.high,
          low: lastData.low,
          close: lastData.close,
          volume: lastVol ? lastVol.value : 0,
          ma20: lastSma ? lastSma.value : null,
          isUp: lastData.close >= lastData.open,
        });

        // Initialize Chart
        chart = createChart(chartContainerRef.current, {
          layout: {
            background: { type: 'solid', color: '#131722' },
            textColor: '#787b86',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: '#1c2030' },
            horzLines: { color: '#1c2030' },
          },
          rightPriceScale: {
            borderColor: '#2a2e39',
            textColor: '#d1d4dc',
          },
          timeScale: {
            borderColor: '#2a2e39',
            timeVisible: true,
            secondsVisible: false,
          },
          crosshair: {
            vertLine: {
              color: '#787b86',
              width: 1,
              style: 3, // dashed
              labelBackgroundColor: '#2a2e39',
            },
            horzLine: {
              color: '#787b86',
              width: 1,
              style: 3, // dashed
              labelBackgroundColor: '#2a2e39',
            },
          },
          handleScale: {
            mouseWheel: true,
            pinch: true,
          },
          handleScroll: {
            mouseDrag: true,
            touchDrag: true,
          },
        });

        chartRef.current = chart;

        // Add main series (using lightweight-charts v5 unified API)
        let mainSeries;
        if (activeChartType === 'candle') {
          mainSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
          });
          mainSeries.setData(candleData);
        } else {
          mainSeries = chart.addSeries(LineSeries, {
            color: '#29b6f6',
            lineWidth: 2,
          });
          mainSeries.setData(candleData.map(d => ({ time: d.time, value: d.close })));
        }

        // Add SMA(20) Indicator Line (using lightweight-charts v5 unified API)
        const maSeries = chart.addSeries(LineSeries, {
          color: '#F6C343', // Bright yellow
          lineWidth: 1.5,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        maSeries.setData(smaData);

        // Add volume series (using lightweight-charts v5 unified API)
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: '', // Overlay series
        });
        volumeSeries.setData(volData);
        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        });

        // Draw already existing trendlines on new chart creation
        trendlineSeriesListRef.current = [];
        trendlines.forEach((line) => {
          const series = chart.addSeries(LineSeries, {
            color: '#29b6f6',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          series.setData([
            { time: line.start.time, value: line.start.price },
            { time: line.end.time, value: line.end.price },
          ]);
          trendlineSeriesListRef.current.push(series);
        });

        chart.timeScale().fitContent();

        // Subscribe to chart clicks for drawing trendlines
        chart.subscribeClick((param) => {
          if (!param.time || !param.point) return;

          const currentTool = activeToolRef.current;
          if (currentTool === 'trendline') {
            const price = mainSeries.coordinateToPrice(param.point.y);
            const time = param.time;
            const currentDrawingPoint = drawingPointRef.current;

            if (!currentDrawingPoint) {
              // Clicked first point: Save start point coordinate
              setDrawingPoint({ time, price });
            } else {
              // Clicked second point: Package trendline, reset, restore cursor
              const endPoint = { time, price };
              setTrendlines((prev) => [
                ...prev,
                { start: currentDrawingPoint, end: endPoint },
              ]);
              setDrawingPoint(null);
              setActiveTool('cursor');
            }
          }
        });

        // Escape Keydown listener to cancel drawing
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            if (drawingPointRef.current) {
              setDrawingPoint(null);
            }
            setActiveTool('cursor');
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        keydownListener = handleKeyDown;

        // Subscribe to crosshair moves for HUD values
        chart.subscribeCrosshairMove((param) => {
          if (param.time) {
            hoveredTimeRef.current = param.time;
            const candleVal = param.seriesData.get(mainSeries);
            const volVal = param.seriesData.get(volumeSeries);
            const maVal = param.seriesData.get(maSeries);
            
            if (candleVal) {
              const oVal = candleVal.open !== undefined ? candleVal.open : candleVal.value;
              const cVal = candleVal.close !== undefined ? candleVal.close : candleVal.value;
              setHudData({
                open: oVal,
                high: candleVal.high !== undefined ? candleVal.high : candleVal.value,
                low: candleVal.low !== undefined ? candleVal.low : candleVal.value,
                close: cVal,
                volume: volVal ? volVal.value : 0,
                ma20: maVal ? maVal.value : null,
                isUp: cVal >= oVal,
              });
            }
          } else {
            hoveredTimeRef.current = null;
            // Back to displaying the latest live data point
            const activeLast = candleData[candleData.length - 1];
            const activeVol = volData[volData.length - 1];
            
            // Fetch live SMA value from memory
            let currentLastSma = null;
            if (candleData.length >= 20) {
              currentLastSma = smaSumRef.current / 20;
            }
            
            setHudData({
              open: activeLast.open,
              high: activeLast.high,
              low: activeLast.low,
              close: activeLast.close,
              volume: activeVol ? activeVol.value : 0,
              ma20: currentLastSma ? parseFloat(currentLastSma.toFixed(2)) : null,
              isUp: activeLast.close >= activeLast.open,
            });
          }
        });

        // Resize handler
        const handleResize = () => {
          if (chart && chartContainerRef.current) {
            chart.resize(
              chartContainerRef.current.clientWidth,
              chartContainerRef.current.clientHeight
            );
          }
        };
        window.addEventListener('resize', handleResize);
        resizeListener = handleResize;
        handleResize();

        // Subscribe to real-time quotes / live updates
        unsubscribeRealtime = subscribeToRealtime(symbol, timeframe, (tick) => {
          if (!isMounted) return;

          const t = tick.time;
          const c = tick.price;
          const v = tick.volume;

          // Process and derive O, H, L from price ticks dynamically
          let o = tick.o !== undefined ? tick.o : c;
          let h = tick.h !== undefined ? tick.h : c;
          let l = tick.l !== undefined ? tick.l : c;

          const lastCandle = candleData[candleData.length - 1];
          if (lastCandle && t === lastCandle.time) {
            // Updating current tick candle
            o = lastCandle.open;
            h = tick.h !== undefined ? tick.h : Math.max(lastCandle.high, c);
            l = tick.l !== undefined ? tick.l : Math.min(lastCandle.low, c);
          } else if (lastCandle) {
            // Creating new tick candle
            o = lastCandle.close; // start open price at previous close price
            h = Math.max(o, c);
            l = Math.min(o, c);
          }

          const isUp = c >= o;

          // Update chart series
          if (activeChartType === 'candle') {
            mainSeries.update({ time: t, open: o, high: h, low: l, close: c });
          } else {
            mainSeries.update({ time: t, value: c });
          }

          volumeSeries.update({
            time: t,
            value: v,
            color: isUp ? '#26a69a' : '#ef5350',
          });

          // Dynamic O(1) recalculation of SMA sum
          let liveSma = null;
          if (candleData.length >= 20) {
            if (t === lastCandle.time) {
              // Case A: Updating the current active K-line
              smaSumRef.current = smaSumRef.current - lastCandle.close + c;
              
              // Modify the in-memory last candle
              lastCandle.open = o;
              lastCandle.high = h;
              lastCandle.low = l;
              lastCandle.close = c;
            } else {
              // Case B: Initiating a new K-line. Slide window
              const oldestCandle = candleData[candleData.length - 20];
              smaSumRef.current = smaSumRef.current - oldestCandle.close + c;
              
              // Push new K-line to array
              candleData.push({ time: t, open: o, high: h, low: l, close: c });
            }
            liveSma = smaSumRef.current / 20;
            maSeries.update({ time: t, value: parseFloat(liveSma.toFixed(2)) });
          } else {
            // Not enough data (less than 20 items)
            if (lastCandle && t === lastCandle.time) {
              lastCandle.open = o;
              lastCandle.high = h;
              lastCandle.low = l;
              lastCandle.close = c;
            } else {
              candleData.push({ time: t, open: o, high: h, low: l, close: c });
            }

            // If this tick makes it reach exactly 20 elements, calculate initial sum
            if (candleData.length === 20) {
              let sum = 0;
              for (let j = 0; j < 20; j++) {
                sum += candleData[j].close;
              }
              smaSumRef.current = sum;
              liveSma = sum / 20;
              maSeries.update({ time: t, value: parseFloat(liveSma.toFixed(2)) });
            }
          }

          // Update volume reference list
          const existingVolIdx = volData.findIndex(d => d.time === t);
          const newVol = { time: t, value: v, color: isUp ? '#26a69a' : '#ef5350' };
          if (existingVolIdx !== -1) {
            volData[existingVolIdx] = newVol;
          } else {
            volData.push(newVol);
          }

          // Keep local state in sync so HUD gets live updates (only if user is not hovering historic candles)
          if (hoveredTimeRef.current === null || hoveredTimeRef.current === t) {
            setHudData({
              open: o,
              high: h,
              low: l,
              close: c,
              volume: v,
              ma20: liveSma ? parseFloat(liveSma.toFixed(2)) : null,
              isUp,
            });
          }
        });

      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    initChart();

    // Cleanup hook
    return () => {
      isMounted = false;
      chartRef.current = null;
      if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
      }
      if (keydownListener) {
        window.removeEventListener('keydown', keydownListener);
      }
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
      if (chart) {
        chart.remove();
      }
    };
  }, [symbol, timeframe, activeChartType]);

  return (
    <div className="relative w-full h-full flex flex-col bg-tradingview-bg select-none">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-tradingview-bg/80 backdrop-blur-sm">
          <div className="w-10 h-10 border-4 border-tradingview-up/30 border-t-tradingview-up rounded-full animate-spin"></div>
          <span className="mt-3 text-xs font-semibold text-tradingview-textSecondary tracking-wider animate-pulse">
            正在載入 {symbol} 即時市場數據...
          </span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-tradingview-bg/95 p-6 text-center">
          <span className="text-tradingview-down text-3xl font-bold">⚠️</span>
          <span className="mt-3 text-sm font-semibold text-tradingview-textPrimary">
            連線數據源失敗
          </span>
          <span className="mt-1 text-xs text-tradingview-textSecondary max-w-md">
            {error}
          </span>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-tradingview-border hover:bg-tradingview-border/80 text-xs text-tradingview-textPrimary font-semibold rounded transition-tv"
          >
            重新整理
          </button>
        </div>
      )}

      {/* Drawing Trendline UI Notification Prompt */}
      {drawingPoint && (
        <div className="absolute top-16 left-4 z-10 flex items-center bg-[#29b6f6]/10 border border-[#29b6f6]/30 text-[#29b6f6] px-3 py-1.5 rounded text-[11px] animate-pulse shadow-lg backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-[#29b6f6] mr-2" />
          <span>起點已設定！請在圖表上點擊第二點以繪製趨勢線 (按 ESC 鍵取消)</span>
        </div>
      )}

      {/* Chart Toolbar Overlay */}
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-4 bg-tradingview-card/85 backdrop-blur-md px-3 py-1.5 rounded border border-tradingview-border text-xs">
        <div className="flex items-center space-x-1.5">
          <span className="font-bold text-tradingview-textPrimary text-sm">{symbol}</span>
          <span className="text-[10px] text-tradingview-textSecondary bg-tradingview-border px-1 rounded">
            {timeframe}
          </span>
        </div>
        
        <div className="h-3.5 w-px bg-tradingview-border"></div>

        {/* HUD data fields */}
        {hudData && (
          <div className="flex items-center space-x-3 text-[11px] font-mono">
            <div className="flex space-x-1">
              <span className="text-tradingview-textSecondary">O</span>
              <span className={hudData.isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
                {hudData.open?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex space-x-1">
              <span className="text-tradingview-textSecondary">H</span>
              <span className={hudData.isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
                {hudData.high?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex space-x-1">
              <span className="text-tradingview-textSecondary">L</span>
              <span className={hudData.isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
                {hudData.low?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex space-x-1">
              <span className="text-tradingview-textSecondary">C</span>
              <span className={hudData.isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
                {hudData.close?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex space-x-1 hidden sm:flex">
              <span className="text-tradingview-textSecondary">Vol</span>
              <span className="text-tradingview-textPrimary">
                {hudData.volume?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            {hudData.ma20 !== null && hudData.ma20 !== undefined && (
              <div className="flex space-x-1">
                <span className="text-tradingview-textSecondary">MA(20)</span>
                <span className="text-[#F6C343] font-bold">
                  {hudData.ma20.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="h-3.5 w-px bg-tradingview-border"></div>

        {/* Chart Type Toggle */}
        <div className="flex items-center space-x-1 bg-tradingview-bg/50 p-0.5 rounded border border-tradingview-border">
          <button
            onClick={() => setActiveChartType('candle')}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-tv ${
              activeChartType === 'candle'
                ? 'bg-tradingview-border text-tradingview-textPrimary font-semibold'
                : 'text-tradingview-textSecondary hover:text-tradingview-textPrimary'
            }`}
          >
            蠟燭圖
          </button>
          <button
            onClick={() => setActiveChartType('line')}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-tv ${
              activeChartType === 'line'
                ? 'bg-tradingview-border text-tradingview-textPrimary font-semibold'
                : 'text-tradingview-textSecondary hover:text-tradingview-textPrimary'
            }`}
          >
            折線圖
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div ref={chartContainerRef} className="flex-1 w-full" />
    </div>
  );
}
