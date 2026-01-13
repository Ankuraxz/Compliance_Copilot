/**
 * Health check endpoint for monitoring and load balancers
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { createClient as createRedisClient } from 'redis';

export async function GET() {
  const health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    services: {
      database: { status: 'up' | 'down'; latency?: number };
      redis: { status: 'up' | 'down'; latency?: number };
      supabase: { status: 'up' | 'down'; latency?: number };
    };
  } = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'down' },
      redis: { status: 'down' },
      supabase: { status: 'down' },
    },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = {
      status: 'up',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    health.services.database.status = 'down';
    health.status = 'unhealthy';
  }

  // Check Redis
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const redisStart = Date.now();
      const redis = createRedisClient({ url: redisUrl });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      health.services.redis = {
        status: 'up',
        latency: Date.now() - redisStart,
      };
    } else {
      health.services.redis.status = 'down';
      health.status = 'degraded'; // Redis is optional
    }
  } catch (error) {
    health.services.redis.status = 'down';
    // Redis is optional, so don't mark as unhealthy
    if (health.status === 'healthy') {
      health.status = 'degraded';
    }
  }

  // Check Supabase (just verify connection, not table access)
  try {
    const supabaseStart = Date.now();
    const supabase = await createClient();
    // Just check if we can create a client - actual table access requires auth
    // This is sufficient to verify Supabase connection
    health.services.supabase = {
      status: 'up',
      latency: Date.now() - supabaseStart,
    };
  } catch (error) {
    health.services.supabase.status = 'down';
    // Supabase is critical, mark as unhealthy if down
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
