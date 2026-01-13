/**
 * API route for compliance report management
 * Handles saving reports to Supabase Storage and database
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

/**
 * Generate markdown report from report data
 */
function generateMarkdownReport(reportData: any, framework: string): string {
  const metadata = reportData.metadata || {};
  const executiveSummary = reportData.executiveSummary || '';
  const complianceScore = reportData.complianceScore || { overall: 0, byCategory: {} };
  const findings = reportData.findings || [];
  const sections = reportData.sections || [];

  return `# ${framework} Compliance Report

Generated: ${metadata.generatedAt ? new Date(metadata.generatedAt).toLocaleString() : new Date().toLocaleString()}
Data Sources: ${(metadata.dataSources || []).join(', ')}
Extraction Agents: ${(metadata.extractionAgents || []).join(', ')}

## Executive Summary

${executiveSummary}

## Compliance Score

Overall: ${complianceScore.overall}/100

${Object.entries(complianceScore.byCategory || {})
  .map(([cat, score]) => `- ${cat}: ${score}/100`)
  .join('\n')}

## Findings

${findings
  .map(
    (f: any, i: number) => `
### ${i + 1}. ${f.title || 'Untitled Finding'}

**Severity**: ${(f.severity || 'medium').toUpperCase()}
**Description**: ${f.description || 'No description available'}

**Evidence**:
${(f.evidence || []).map((e: any) => `- ${e.citation || 'Unknown source'}\n  Quote: "${e.quote || 'No quote available'}"`).join('\n')}

**Recommendation**: ${f.recommendation || 'No recommendation available'}
`
  )
  .join('\n')}

## Detailed Sections

${sections
  .map(
    (s: any) => `
### ${s.title || 'Untitled Section'}

${s.content || 'No content available'}

**Evidence Citations**:
${(s.evidence || []).map((e: any) => `- ${e.citation || 'Unknown source'}`).join('\n')}
`
  )
  .join('\n')}
`.trim();
}

/**
 * GET - List all reports for a project
 */
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

    // Get all reports for this project
    const reports = await prisma.complianceReport.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        agentRun: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error('Reports fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

/**
 * POST - Save a new report
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, agentRunId, framework, reportData, score, findingsCount } = await request.json();

    if (!projectId || !framework || !reportData) {
      return NextResponse.json(
        { error: 'Project ID, framework, and report data are required' },
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

    // Save report to Supabase Storage in multiple formats
    let storageUrl: string | null = null;
    const timestamp = Date.now();
    const baseFileName = `reports/${projectId}/${framework}-${timestamp}`;
    
    try {
      // 1. Save JSON version
      const jsonFileName = `${baseFileName}.json`;
      const { data: jsonUpload, error: jsonError } = await supabase.storage
        .from('compliance-reports')
        .upload(jsonFileName, JSON.stringify(reportData, null, 2), {
          contentType: 'application/json',
          upsert: false,
        });

      if (!jsonError && jsonUpload) {
        // Get public URL for JSON (primary storage URL)
        const { data: urlData } = supabase.storage
          .from('compliance-reports')
          .getPublicUrl(jsonFileName);
        
        storageUrl = urlData.publicUrl;

        // 2. Save Markdown version for easy download
        const markdownContent = generateMarkdownReport(reportData, framework);
        const mdFileName = `${baseFileName}.md`;
        const { data: mdUpload, error: mdError } = await supabase.storage
          .from('compliance-reports')
          .upload(mdFileName, markdownContent, {
            contentType: 'text/markdown',
            upsert: false,
          });

        if (!mdError && mdUpload) {
          // Get public URL for Markdown
          const { data: mdUrlData } = supabase.storage
            .from('compliance-reports')
            .getPublicUrl(mdFileName);
          
          // Store markdownStorageUrl in report data for later retrieval
          reportData.markdownStorageUrl = mdUrlData.publicUrl;
        }
      }
    } catch (storageError: any) {
      console.warn('Failed to save report to storage:', storageError.message);
      // Continue without storage URL - report will still be saved to database
    }

    // Save report to database
    const report = await prisma.complianceReport.create({
      data: {
        projectId,
        agentRunId: agentRunId || null,
        framework,
        reportData,
        storageUrl,
        score: score || null,
        findingsCount: findingsCount || 0,
        status: 'completed',
      },
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error('Report save error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save report' },
      { status: 500 }
    );
  }
}

