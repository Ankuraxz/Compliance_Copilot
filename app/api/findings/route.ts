/**
 * API route to fetch findings
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await import('@/lib/supabase/server').then(m => m.createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const framework = searchParams.get('framework');
    const projectId = searchParams.get('projectId');
    const severity = searchParams.get('severity');

    // Validate projectId belongs to user
    if (projectId) {
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
    }

    const where: any = {};

    if (projectId) {
      where.projectId = projectId;
    }

    if (severity) {
      where.severity = severity;
    }

    if (framework) {
      where.requirement = {
        framework: {
          name: framework,
        },
      };
    }

    const findings = await prisma.finding.findMany({
      where,
      include: {
        requirement: true,
        evidence: true,
        remediation: true,
      },
      orderBy: [
        { severity: 'asc' }, // critical, high, medium, low
        { createdAt: 'desc' },
      ],
      take: 100,
    });

    const formattedFindings = findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      status: finding.status,
      requirementCode: finding.requirement?.code || 'N/A',
      evidenceCount: finding.evidence.length,
      createdAt: finding.createdAt,
      remediation: finding.remediation,
    }));

    return NextResponse.json({ findings: formattedFindings });
  } catch (error: any) {
    console.error('Findings fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch findings' },
      { status: 500 }
    );
  }
}

