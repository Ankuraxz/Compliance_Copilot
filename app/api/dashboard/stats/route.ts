/**
 * API route to fetch dashboard statistics
 * Returns overview metrics: report scores, findings counts, remediation tasks
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
    const projectId = searchParams.get('projectId');
    const framework = searchParams.get('framework') || 'SOC2';

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: user.id,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get latest report for this project and framework
    const latestReport = await prisma.complianceReport.findFirst({
      where: {
        projectId,
        framework,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get findings statistics - handle cases where requirement might be null
    // First, get all findings for the project
    const allFindings = await prisma.finding.findMany({
      where: {
        projectId,
      },
      include: {
        requirement: {
          include: {
            framework: true,
          },
        },
      },
    });

    // Filter by framework (requirement might be null, so we filter in memory)
    const frameworkFindings = allFindings.filter(f => 
      f.requirement?.framework?.name === framework
    );

    const findingsCount = frameworkFindings.length;
    const criticalFindings = frameworkFindings.filter(f => f.severity === 'critical').length;
    const highFindings = frameworkFindings.filter(f => f.severity === 'high').length;
    const mediumFindings = frameworkFindings.filter(f => f.severity === 'medium').length;
    const lowFindings = frameworkFindings.filter(f => f.severity === 'low').length;

    // Get remediation tasks count - filter by framework
    const allRemediationTasks = await prisma.remediationTask.findMany({
      where: {
        finding: {
          projectId,
        },
      },
      include: {
        finding: {
          include: {
            requirement: {
              include: {
                framework: true,
              },
            },
          },
        },
      },
    });

    const remediationTasksCount = allRemediationTasks.filter(rt => 
      rt.finding.requirement?.framework?.name === framework
    ).length;

    // Extract report data if available
    let reportData: any = null;
    let complianceScores: Record<string, number> = {};
    let overallScore = 0;

    if (latestReport && latestReport.reportData) {
      reportData = latestReport.reportData as any;
      if (reportData.complianceScore) {
        overallScore = reportData.complianceScore.overall || 0;
        complianceScores = reportData.complianceScore.byCategory || {};
      }
    }

    // Get agent run statistics
    const agentRuns = await prisma.agentRun.findMany({
      where: {
        projectId,
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: 1,
    });

    const latestRun = agentRuns[0];
    const overallStatus = latestRun?.status || 'pending';

    return NextResponse.json({
      stats: {
        // Report data
        latestReport: latestReport ? {
          id: latestReport.id,
          score: latestReport.score || overallScore,
          findingsCount: latestReport.findingsCount || findingsCount,
          createdAt: latestReport.createdAt,
          status: latestReport.status,
        } : null,
        overallScore,
        complianceScores,
        
        // Findings
        findings: {
          total: findingsCount,
          critical: criticalFindings,
          high: highFindings,
          medium: mediumFindings,
          low: lowFindings,
        },
        
        // Remediation
        remediationTasks: remediationTasksCount,
        
        // Agent run status
        overallStatus,
        latestRunId: latestRun?.id || null,
      },
    });
  } catch (error: any) {
    console.error('Dashboard stats fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
