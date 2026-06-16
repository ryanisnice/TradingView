import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  LineSeries, 
  HistogramSeries,
  LineStyle
} from 'lightweight-charts';
import { fetchHistoricalKlines, subscribeToRealtime, fetchInstitutionalChips } from '../services/marketData';

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

/**
 * Calculates the shortest distance from point (px, py) to line segment (x1, y1) - (x2, y2).
 */
const getDistanceToSegment = (px, py, x1, y1, x2, y2) => {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
};

export default function Chart({ symbol, timeframe, activeTool, setActiveTool, trendlines, setTrendlines }) {
  const chartContainerRef = useRef(null);
  const hoveredTimeRef = useRef(null);
  
  // O(1) sliding window sum trackers for MA5, MA10, and MA20
  const sma5SumRef = useRef(0);
  const sma10SumRef = useRef(0);
  const sma20SumRef = useRef(0);

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

  // Local text markers state (persisted in localStorage)
  const [textMarkers, setTextMarkers] = useState(() => {
    const saved = localStorage.getItem('tradingview_text_markers');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse text markers:", e);
      }
    }
    return {};
  });

  // Local Fibonacci drawings state (persisted in localStorage)
  const [fibonacciDrawings, setFibonacciDrawings] = useState(() => {
    const saved = localStorage.getItem('tradingview_fibonacci_drawings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse fibonacci drawings:", e);
      }
    }
    return {};
  });

  const [fibDrawStartPoint, setFibDrawStartPoint] = useState(null);
  const [chipsMarkers, setChipsMarkers] = useState([]);
  const [tooltipData, setTooltipData] = useState(null);
  const [chartLoadedToggle, setChartLoadedToggle] = useState(false);

  // References to draw price lines and communicate with closures
  const fibPriceLinesRef = useRef([]);
  const fibDrawStartPointRef = useRef(null);
  const fibonacciDrawingsRef = useRef(fibonacciDrawings);

  // Filter trendlines for the active symbol
  const activeTrendlines = trendlines[symbol] || [];

  const trendlinesRef = useRef(trendlines);
  const mainSeriesRef = useRef(null);

  // Keep refs up-to-date with React states to avoid closure stale-value bugs
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // Dynamically toggle chart panning/scrolling options based on selected tool
  useEffect(() => {
    if (chartRef.current) {
      const isCursor = activeTool === 'cursor';
      chartRef.current.applyOptions({
        handleScale: {
          mouseWheel: isCursor,
          pinch: isCursor,
        },
        handleScroll: {
          mouseDrag: isCursor,
          touchDrag: isCursor,
        },
      });
    }
  }, [activeTool]);

  useEffect(() => {
    drawingPointRef.current = drawingPoint;
  }, [drawingPoint]);

  useEffect(() => {
    trendlinesRef.current = trendlines;
  }, [trendlines]);

  useEffect(() => {
    fibDrawStartPointRef.current = fibDrawStartPoint;
  }, [fibDrawStartPoint]);

  useEffect(() => {
    fibonacciDrawingsRef.current = fibonacciDrawings;
  }, [fibonacciDrawings]);

  useEffect(() => {
    localStorage.setItem('tradingview_text_markers', JSON.stringify(textMarkers));
  }, [textMarkers]);

  useEffect(() => {
    localStorage.setItem('tradingview_fibonacci_drawings', JSON.stringify(fibonacciDrawings));
  }, [fibonacciDrawings]);

  // Effect to update markers dynamically (both user text markers and strategy chips markers)
  useEffect(() => {
    if (mainSeriesRef.current && typeof mainSeriesRef.current.setMarkers === 'function') {
      const activeTextMarkers = textMarkers[symbol] || [];

      // 強制轉換籌碼訊號，確保屬性 100% 吻合 lightweight-charts 規範，並加上超明顯的文字與最大尺寸
      const sanitizedChipsMarkers = chipsMarkers.map((m) => {
        // 利用 position 來反推買賣，最為防呆安全
        const isSell = m.position === 'aboveBar'; 
        return {
          time: m.time,
          position: isSell ? 'aboveBar' : 'belowBar',
          color: isSell ? '#26a69a' : '#ef5350', // 綠色賣出，紅色買進
          shape: isSell ? 'arrowDown' : 'arrowUp', // 強制賦予正確的形狀字串
          size: 3, // lightweight-charts 的最大 size
          text: isSell ? '賣' : '買', // 直接在箭頭旁加上文字，讓訊號更直觀明顯
        };
      });

      const combinedMarkers = [...activeTextMarkers, ...sanitizedChipsMarkers];
      const sortedMarkers = combinedMarkers.sort((a, b) => a.time - b.time);
      
      try {
        mainSeriesRef.current.setMarkers(sortedMarkers);
      } catch (e) {
        console.error("Failed to set markers:", e);
      }
    }
  }, [textMarkers, chipsMarkers, symbol]);

  // Effect to render Fibonacci PriceLines on active series
  useEffect(() => {
    const mainSeries = mainSeriesRef.current;
    if (!mainSeries) return;

    // 1. Clear old price lines
    fibPriceLinesRef.current.forEach((line) => {
      try {
        mainSeries.removePriceLine(line);
      } catch (e) {
        // Line already removed
      }
    });
    fibPriceLinesRef.current = [];

    // 2. Draw current symbol's Fibonacci price lines
    const activeFibs = fibonacciDrawings[symbol] || [];
    
    // level styles (0%, 23.6%, 38.2%, 50.0%, 61.8%, 100%)
    const levelStyles = {
      '0.0': { color: '#ef5350', title: '0.0% (End)' },
      '0.236': { color: '#ff9800', title: '23.6%' },
      '0.382': { color: '#f6c343', title: '38.2%' },
      '0.5': { color: '#26a69a', title: '50.0%' },
      '0.618': { color: '#d4af37', title: '61.8% (Gold)' }, // Golden Ratio
      '1.0': { color: '#29b6f6', title: '100.0% (Start)' }
    };

    activeFibs.forEach((fib) => {
      Object.keys(fib.levels).forEach((level) => {
        const price = fib.levels[level];
        const style = levelStyles[level] || { color: '#787b86', title: `${level}` };

        try {
          const priceLine = mainSeries.createPriceLine({
            price: price,
            color: style.color,
            lineWidth: 1.5,
            lineStyle: LineStyle.Dashed,
            title: style.title,
            axisLabelVisible: true,
          });
          fibPriceLinesRef.current.push(priceLine);
        } catch (e) {
          console.error("Failed to create Fibonacci PriceLine:", level, e);
        }
      });
    });
  }, [fibonacciDrawings, symbol, chartLoadedToggle]);

  // Effect to draw symbol-bound trendlines dynamically without recreating the chart
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

    // Redraw completed trendlines for current symbol
    activeTrendlines.forEach((line) => {
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
  }, [trendlines, symbol]);

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
        let chipsData = [];

        // Parallel load of historical klines and institutional chips data
        const [result, chipsResult] = await Promise.all([
          fetchHistoricalKlines(symbol, timeframe),
          fetchInstitutionalChips(symbol)
        ]);

        candleData = result.candlestick;
        volData = result.volume;

        // 利用後端傳來的 YYYY-MM-DD，去尋找完全對應的那根 K 線，並把 marker 的 time 替換成那根 K 線的 time
        chipsData = chipsResult.map(marker => {
          if (marker.date) {
            const matchingCandle = candleData.find(c => {
              // 將 Yahoo 的 unix time 轉回 YYYY-MM-DD
              const d = new Date(c.time * 1000);
              const y = d.getUTCFullYear();
              const m = String(d.getUTCMonth() + 1).padStart(2, '0');
              const day = String(d.getUTCDate()).padStart(2, '0');
              return `${y}-${m}-${day}` === marker.date;
            });
            if (matchingCandle) {
              return { ...marker, time: matchingCandle.time };
            }
          }
          return marker;
        }).filter(m => m.time && candleData.some(c => c.time === m.time)); // 過濾掉 K 線圖上沒有的日期

        if (!isMounted) return;

        // If no K-line data returned, display error
        if (candleData.length === 0) {
          throw new Error("無法取得此商品的歷史交易資料，請檢查 API 金鑰或網路連線。");
        }

        setLoading(false);

        // Calculate triple SMA historical data (MA5, MA10, and MA20)
        const sma5Data = calculateSMA(candleData, 5);
        const sma10Data = calculateSMA(candleData, 10);
        const sma20Data = calculateSMA(candleData, 20);

        // Initialize O(1) sliding window sum5
        if (candleData.length >= 5) {
          let sum = 0;
          for (let j = candleData.length - 5; j < candleData.length; j++) {
            sum += candleData[j].close;
          }
          sma5SumRef.current = sum;
        } else {
          sma5SumRef.current = 0;
        }

        // Initialize O(1) sliding window sum10
        if (candleData.length >= 10) {
          let sum = 0;
          for (let j = candleData.length - 10; j < candleData.length; j++) {
            sum += candleData[j].close;
          }
          sma10SumRef.current = sum;
        } else {
          sma10SumRef.current = 0;
        }

        // Initialize O(1) sliding window sum20
        if (candleData.length >= 20) {
          let sum = 0;
          for (let j = candleData.length - 20; j < candleData.length; j++) {
            sum += candleData[j].close;
          }
          sma20SumRef.current = sum;
        } else {
          sma20SumRef.current = 0;
        }

        // Prepopulate HUD with last data point
        const lastData = candleData[candleData.length - 1];
        const lastVol = volData[volData.length - 1];
        const lastSma5 = sma5Data[sma5Data.length - 1];
        const lastSma10 = sma10Data[sma10Data.length - 1];
        const lastSma20 = sma20Data[sma20Data.length - 1];
        setHudData({
          open: lastData.open,
          high: lastData.high,
          low: lastData.low,
          close: lastData.close,
          volume: lastVol ? lastVol.value : 0,
          ma5: lastSma5 ? lastSma5.value : null,
          ma10: lastSma10 ? lastSma10.value : null,
          ma20: lastSma20 ? lastSma20.value : null,
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
          leftPriceScale: {
            visible: true,
            borderColor: '#2a2e39',
            textColor: '#787b86',
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
              style: 3,
              labelBackgroundColor: '#2a2e39',
            },
            horzLine: {
              color: '#787b86',
              width: 1,
              style: 3,
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

        // Apply scroll/scale settings based on initial active tool state
        const isCursor = activeToolRef.current === 'cursor';
        chart.applyOptions({
          handleScale: {
            mouseWheel: isCursor,
            pinch: isCursor,
          },
          handleScroll: {
            mouseDrag: isCursor,
            touchDrag: isCursor,
          },
        });

        // Add main series
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

        mainSeriesRef.current = mainSeries;
        setChartLoadedToggle(prev => !prev);

        // Apply initial text markers and chips strategy markers
        const activeTextMarkers = textMarkers[symbol] || [];
        const sanitizedChipsMarkers = chipsData.map(m => {
          let safeShape = 'circle';
          if (m.shape && m.shape.toLowerCase() === 'arrowup') safeShape = 'arrowUp';
          else if (m.shape && m.shape.toLowerCase() === 'arrowdown') safeShape = 'arrowDown';

          return {
            time: m.time,
            position: m.position === 'aboveBar' ? 'aboveBar' : 'belowBar',
            color: m.color || '#ef5350',
            shape: safeShape,
            size: 2,
          };
        });
        const combinedMarkers = [...activeTextMarkers, ...sanitizedChipsMarkers];
        const sortedMarkers = combinedMarkers.sort((a, b) => a.time - b.time);
        if (mainSeriesRef.current && typeof mainSeriesRef.current.setMarkers === 'function') {
          mainSeriesRef.current.setMarkers(sortedMarkers);
        }
        setChipsMarkers(chipsData);

        // Add MA5 Indicator Line (Blue)
        const ma5Series = chart.addSeries(LineSeries, {
          color: '#2962FF', // Blue
          lineWidth: 1.5,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        ma5Series.setData(sma5Data);

        // Add MA10 Indicator Line (Orange)
        const ma10Series = chart.addSeries(LineSeries, {
          color: '#FF6D00', // Orange
          lineWidth: 1.5,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        ma10Series.setData(sma10Data);

        // Add MA20 Indicator Line (Bright Yellow)
        const ma20Series = chart.addSeries(LineSeries, {
          color: '#F6C343', // Bright Yellow
          lineWidth: 1.5,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        ma20Series.setData(sma20Data);

        // Add volume series
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'left',
        });
        
        // Map volume colors to 0.2 opacity background colors
        const adjustedVolData = volData.map((d) => ({
          ...d,
          color: d.color === '#26a69a' || d.color === 'rgba(38, 166, 154, 0.8)'
            ? 'rgba(38, 166, 154, 0.2)'
            : 'rgba(239, 83, 80, 0.2)'
        }));
        volumeSeries.setData(adjustedVolData);
        
        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        });

        // Chips strategy markers are rendered directly as markers on the main series

        // Draw already existing trendlines for current symbol on startup
        trendlineSeriesListRef.current = [];
        activeTrendlines.forEach((line) => {
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

        // Subscribe to chart clicks for drawing trendlines, text markers, and erasing
        chart.subscribeClick((param) => {
          if (!param.time || !param.point) return;

          const currentTool = activeToolRef.current;
          if (currentTool === 'trendline') {
            const price = mainSeries.coordinateToPrice(param.point.y);
            const time = param.time;
            const currentDrawingPoint = drawingPointRef.current;

            if (!currentDrawingPoint) {
              setDrawingPoint({ time, price });
            } else {
              const endPoint = { time, price };
              setTrendlines((prev) => {
                const currentList = prev[symbol] || [];
                return {
                  ...prev,
                  [symbol]: [...currentList, { start: currentDrawingPoint, end: endPoint }],
                };
              });
              setDrawingPoint(null);
              setActiveTool('cursor');
            }
          } else if (currentTool === 'fibonacci') {
            const price = mainSeries.coordinateToPrice(param.point.y);
            const time = param.time;
            const startPoint = fibDrawStartPointRef.current;

            if (!startPoint) {
              setFibDrawStartPoint({ time, price });
            } else {
              const endPoint = { time, price };
              const startPrice = startPoint.price;
              const endPrice = price;
              const diff = startPrice - endPrice;

              const levels = {
                '0.0': endPrice,
                '0.236': endPrice + diff * 0.236,
                '0.382': endPrice + diff * 0.382,
                '0.5': endPrice + diff * 0.5,
                '0.618': endPrice + diff * 0.618,
                '1.0': startPrice
              };

              const newFib = {
                id: `fib_${Date.now()}`,
                start: startPoint,
                end: endPoint,
                levels
              };

              setFibonacciDrawings((prev) => {
                const currentList = prev[symbol] || [];
                return {
                  ...prev,
                  [symbol]: [...currentList, newFib]
                };
              });

              setFibDrawStartPoint(null);
              setActiveTool('cursor');
            }
          } else if (currentTool === 'eraser') {
            // Check trendlines for deletion
            const currentList = trendlinesRef.current[symbol] || [];
            let closestLineIndex = -1;
            let minDistance = Infinity;

            for (let i = 0; i < currentList.length; i++) {
              const line = currentList[i];
              const x1 = chart.timeScale().timeToCoordinate(line.start.time);
              const y1 = mainSeries.priceToCoordinate(line.start.price);
              const x2 = chart.timeScale().timeToCoordinate(line.end.time);
              const y2 = mainSeries.priceToCoordinate(line.end.price);

              if (x1 === null || y1 === null || x2 === null || y2 === null) {
                continue;
              }

              const dist = getDistanceToSegment(param.point.x, param.point.y, x1, y1, x2, y2);
              if (dist < minDistance) {
                minDistance = dist;
                closestLineIndex = i;
              }
            }

            // Check Fibonacci drawings for deletion
            const currentFibs = fibonacciDrawingsRef.current[symbol] || [];
            let closestFibId = null;
            let minFibDistance = Infinity;

            currentFibs.forEach((fib) => {
              Object.keys(fib.levels).forEach((levelKey) => {
                const levelPrice = fib.levels[levelKey];
                const levelY = mainSeries.priceToCoordinate(levelPrice);
                if (levelY !== null) {
                  const dist = Math.abs(param.point.y - levelY);
                  if (dist < minFibDistance) {
                    minFibDistance = dist;
                    closestFibId = fib.id;
                  }
                }
              });
            });

            // Delete visually closer item within 10px tolerance threshold
            if (closestLineIndex !== -1 && minDistance <= 10 && minDistance <= minFibDistance) {
              setTrendlines((prev) => {
                const currentList = prev[symbol] || [];
                const newList = currentList.filter((_, idx) => idx !== closestLineIndex);
                return {
                  ...prev,
                  [symbol]: newList,
                };
              });
            } else if (closestFibId !== null && minFibDistance <= 10) {
              setFibonacciDrawings((prev) => {
                const currentList = prev[symbol] || [];
                const newList = currentList.filter((fib) => fib.id !== closestFibId);
                return {
                  ...prev,
                  [symbol]: newList,
                };
              });
            }
          } else if (currentTool === 'text') {
            const text = window.prompt("請輸入標籤文字 (例如：支撐位、壓力位)：");
            if (text && text.trim()) {
              const newMarker = {
                time: param.time,
                position: 'aboveBar',
                color: '#d1d4dc',
                shape: 'text',
                text: text.trim(),
              };

              setTextMarkers((prev) => {
                const currentList = prev[symbol] || [];
                return {
                  ...prev,
                  [symbol]: [...currentList, newMarker],
                };
              });
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
            if (fibDrawStartPointRef.current) {
              setFibDrawStartPoint(null);
            }
            setActiveTool('cursor');
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        keydownListener = handleKeyDown;

        // Subscribe to crosshair moves for HUD values and Tooltip updates
        chart.subscribeCrosshairMove((param) => {
          if (param.time) {
            hoveredTimeRef.current = param.time;
            
            // Check for strategy markers on this timestamp to update tooltip
            const matchedMarker = chipsData.find(m => m.time === param.time);
            if (matchedMarker && param.point) {
              setTooltipData({
                text: matchedMarker.text,
                x: param.point.x,
                y: param.point.y
              });
            } else {
              setTooltipData(null);
            }

            const candleVal = param.seriesData.get(mainSeries);
            const volVal = param.seriesData.get(volumeSeries);
            const ma5Val = param.seriesData.get(ma5Series);
            const ma10Val = param.seriesData.get(ma10Series);
            const ma20Val = param.seriesData.get(ma20Series);
            
            if (candleVal) {
              const oVal = candleVal.open !== undefined ? candleVal.open : candleVal.value;
              const cVal = candleVal.close !== undefined ? candleVal.close : candleVal.value;
              setHudData({
                open: oVal,
                high: candleVal.high !== undefined ? candleVal.high : candleVal.value,
                low: candleVal.low !== undefined ? candleVal.low : candleVal.value,
                close: cVal,
                volume: volVal ? volVal.value : 0,
                ma5: ma5Val ? ma5Val.value : null,
                ma10: ma10Val ? ma10Val.value : null,
                ma20: ma20Val ? ma20Val.value : null,
                isUp: cVal >= oVal,
              });
            }
          } else {
            hoveredTimeRef.current = null;
            setTooltipData(null);
            // Back to displaying the latest live data point
            const activeLast = candleData[candleData.length - 1];
            const activeVol = volData[volData.length - 1];
            
            // Fetch live SMA values from memory
            let currentLastSma5 = null;
            if (candleData.length >= 5) {
              currentLastSma5 = sma5SumRef.current / 5;
            }
            let currentLastSma10 = null;
            if (candleData.length >= 10) {
              currentLastSma10 = sma10SumRef.current / 10;
            }
            let currentLastSma20 = null;
            if (candleData.length >= 20) {
              currentLastSma20 = sma20SumRef.current / 20;
            }
            
            setHudData({
              open: activeLast.open,
              high: activeLast.high,
              low: activeLast.low,
              close: activeLast.close,
              volume: activeVol ? activeVol.value : 0,
              ma5: currentLastSma5 ? parseFloat(currentLastSma5.toFixed(2)) : null,
              ma10: currentLastSma10 ? parseFloat(currentLastSma10.toFixed(2)) : null,
              ma20: currentLastSma20 ? parseFloat(currentLastSma20.toFixed(2)) : null,
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
            
            const oldClose = lastCandle.close;
            lastCandle.open = o;
            lastCandle.high = h;
            lastCandle.low = l;
            lastCandle.close = c;

            // Incremental O(1) sum adjustments
            if (candleData.length >= 5) {
              sma5SumRef.current = sma5SumRef.current - oldClose + c;
            }
            if (candleData.length >= 10) {
              sma10SumRef.current = sma10SumRef.current - oldClose + c;
            }
            if (candleData.length >= 20) {
              sma20SumRef.current = sma20SumRef.current - oldClose + c;
            }
          } else if (lastCandle) {
            // Creating new tick candle
            o = lastCandle.close; // start open price at previous close price
            h = Math.max(o, c);
            l = Math.min(o, c);

            candleData.push({ time: t, open: o, high: h, low: l, close: c });

            // Incremental O(1) sum adjustments with window slide
            if (candleData.length > 5) {
              const oldest5 = candleData[candleData.length - 6];
              sma5SumRef.current = sma5SumRef.current - oldest5.close + c;
            } else if (candleData.length === 5) {
              let sum = 0;
              for (let j = 0; j < 5; j++) sum += candleData[j].close;
              sma5SumRef.current = sum;
            }

            if (candleData.length > 10) {
              const oldest10 = candleData[candleData.length - 11];
              sma10SumRef.current = sma10SumRef.current - oldest10.close + c;
            } else if (candleData.length === 10) {
              let sum = 0;
              for (let j = 0; j < 10; j++) sum += candleData[j].close;
              sma10SumRef.current = sum;
            }

            if (candleData.length > 20) {
              const oldest20 = candleData[candleData.length - 21];
              sma20SumRef.current = sma20SumRef.current - oldest20.close + c;
            } else if (candleData.length === 20) {
              let sum = 0;
              for (let j = 0; j < 20; j++) sum += candleData[j].close;
              sma20SumRef.current = sum;
            }
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
            color: isUp ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
          });

          // Calculate live SMA values
          let liveSma5 = null;
          if (candleData.length >= 5) {
            liveSma5 = sma5SumRef.current / 5;
            ma5Series.update({ time: t, value: parseFloat(liveSma5.toFixed(2)) });
          }

          let liveSma10 = null;
          if (candleData.length >= 10) {
            liveSma10 = sma10SumRef.current / 10;
            ma10Series.update({ time: t, value: parseFloat(liveSma10.toFixed(2)) });
          }

          let liveSma20 = null;
          if (candleData.length >= 20) {
            liveSma20 = sma20SumRef.current / 20;
            ma20Series.update({ time: t, value: parseFloat(liveSma20.toFixed(2)) });
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
              ma5: liveSma5 ? parseFloat(liveSma5.toFixed(2)) : null,
              ma10: liveSma10 ? parseFloat(liveSma10.toFixed(2)) : null,
              ma20: liveSma20 ? parseFloat(liveSma20.toFixed(2)) : null,
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
      mainSeriesRef.current = null;
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

      {/* Drawing Fibonacci UI Notification Prompt */}
      {fibDrawStartPoint && (
        <div className="absolute top-16 left-4 z-10 flex items-center bg-[#f6c343]/10 border border-[#f6c343]/30 text-[#f6c343] px-3 py-1.5 rounded text-[11px] animate-pulse shadow-lg backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-[#f6c343] mr-2" />
          <span>起點已設定！請在圖表上點擊第二點以計算黃金比例回撤線 (按 ESC 鍵取消)</span>
        </div>
      )}

      {/* Tool Lock Scroll Notification */}
      {activeTool !== 'cursor' && (
        <div className={`absolute left-4 z-10 flex flex-col space-y-1 bg-[#ff6d00]/10 border border-[#ff6d00]/30 text-[#ff6d00] px-3 py-1.5 rounded text-[11px] shadow-lg backdrop-blur-md transition-all duration-300 ${
          (drawingPoint || fibDrawStartPoint) ? 'top-[112px]' : 'top-16'
        }`}>
          <div className="flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff6d00] mr-2 animate-pulse" />
            <span className="font-semibold">繪圖模式已啟用</span>
          </div>
          <span className="text-[10px] text-[#ff6d00]/80">
            圖表已鎖定滑動，請點擊圖表進行操作
          </span>
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
            
            {/* Triple SMAs Display */}
            {hudData.ma5 !== null && hudData.ma5 !== undefined && (
              <div className="flex space-x-1">
                <span className="text-tradingview-textSecondary">MA(5)</span>
                <span className="text-[#2962FF] font-bold">
                  {hudData.ma5.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {hudData.ma10 !== null && hudData.ma10 !== undefined && (
              <div className="flex space-x-1">
                <span className="text-tradingview-textSecondary">MA(10)</span>
                <span className="text-[#FF6D00] font-bold">
                  {hudData.ma10.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
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

      {/* Chart container wrapper */}
      <div className="relative flex-1 w-full min-h-0">
        <div ref={chartContainerRef} className="w-full h-full" />
        
        {/* Tooltip Overlay */}
        {tooltipData && (
          <div
            className="absolute z-50 pointer-events-none bg-[#1c2030]/95 border border-[#2a2e39] text-[#d1d4dc] text-xs px-2.5 py-1.5 rounded shadow-xl max-w-xs transition-opacity duration-150"
            style={{
              left: `${tooltipData.x + 15}px`,
              top: `${tooltipData.y + 15}px`
            }}
          >
            {tooltipData.text}
          </div>
        )}
      </div>
    </div>
  );
}
