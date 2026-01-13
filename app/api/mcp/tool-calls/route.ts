/**
 * API route to fetch MCP tool calls
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const agentRunId = searchParams.get('agentRunId');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    // If agentRunId is provided, verify it belongs to user's project
    if (agentRunId) {
      const agentRun = await prisma.agentRun.findFirst({
        where: {
          id: agentRunId,
          project: {
            userId: user.id,
          },
        },
      });

      if (!agentRun) {
        return NextResponse.json(
          { error: 'Agent run not found' },
          { status: 404 }
        );
      }
    }

    const where: any = {};
    if (agentRunId) {
      where.agentRunId = agentRunId;
    }

    const toolCalls = await prisma.mCPToolCall.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ toolCalls });
  } catch (error: any) {
    console.error('Tool calls fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tool calls' },
      { status: 500 }
    );
  }
}

