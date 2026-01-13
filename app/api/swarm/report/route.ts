/**
 * API route to get swarm analysis report
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const agentRunId = searchParams.get('agentRunId');

    if (!agentRunId) {
      return NextResponse.json(
        { error: 'Agent run ID is required' },
        { status: 400 }
      );
    }

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

    const report = (agentRun.output as any)?.report;

    if (!report) {
      return NextResponse.json(
        { error: 'Report not yet generated' },
        { status: 404 }
      );
    }

    // Try to find the saved report in database to get reportId
    let savedReport = null;
    try {
      savedReport = await prisma.complianceReport.findFirst({
        where: {
          agentRunId: agentRunId,
          projectId: agentRun.projectId,
        },
        select: {
          id: true,
          storageUrl: true,
        },
      });
    } catch (dbError) {
      console.warn('Could not fetch saved report from database:', dbError);
    }

    return NextResponse.json({ 
      report, 
      agentRun,
      reportId: savedReport?.id || null,
      storageUrl: savedReport?.storageUrl || null,
    });
  } catch (error: any) {
    console.error('Report fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch report' },
      { status: 500 }
    );
  }
}

