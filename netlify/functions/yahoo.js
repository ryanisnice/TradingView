// netlify/functions/yahoo.js
import { Redis } from '@upstash/redis';

// Initialize the Redis client using environment variables
// Gracefully fallback if the environment variables are not yet present or initialization fails
let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  }
} catch (e) {
  console.warn("Failed to initialize Upstash Redis client:", e);
}

export const handler = async (event, context) => {
  // CORS Headers to allow requests from local dev server and production deployments
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request from browser
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { symbol, interval, range } = event.queryStringParameters || {};

    if (!symbol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required query parameter: symbol" })
      };
    }

    // Default values if parameters are missing
    const queryInterval = interval || '1d';
    const queryRange = range || '1mo';

    // Generate unique cache key based on query configuration
    const cacheKey = `yahoo:chart:${symbol}:${queryInterval}:${queryRange}`;

    // 1. Try to query Redis cache first
    if (redis) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          // Cache HIT: return cached data immediately
          return {
            statusCode: 200,
            headers: {
              ...headers,
              'X-Cache': 'HIT'
            },
            body: typeof cachedData === 'string' ? cachedData : JSON.stringify(cachedData)
          };
        }
      } catch (redisError) {
        // Log error and fall through to direct fetch (graceful degradation)
        console.warn("Redis GET failed, falling back to direct Yahoo API fetch:", redisError);
      }
    }

    // Cache MISS: Fetch from Yahoo Finance API
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${queryInterval}&range=${queryRange}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: `Yahoo Finance API responded with status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();

    // 2. Try to cache the fetched data in Redis with 60 seconds expiration TTL
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(data), { ex: 60 });
      } catch (redisError) {
        console.warn("Redis SET failed to cache data:", redisError);
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-Cache': 'MISS'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Yahoo API Serverless Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to fetch data from Yahoo Finance API",
        message: error.message
      })
    };
  }
};
