/**
 * API route to download reports from Supabase Storage
 * Supports multiple formats: json, md, pdf
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = params;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'md'; // md, json, or pdf

    // Get report with project verification
    const report = await prisma.complianceReport.findFirst({
      where: {
        id: reportId,
        project: {
          userId: user.id,
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // Try to get from storage first
    if (report.storageUrl) {
      try {
        // Extract file path from storage URL
        const urlParts = report.storageUrl.split('/compliance-reports/');
        if (urlParts.length > 1) {
          const baseFileName = urlParts[1].split('?')[0].replace('.json', '');
          const fileName = `${baseFileName}.${format}`;
          
          // Try to download from storage
          const { data, error } = await supabase.storage
            .from('compliance-reports')
            .download(fileName);

          if (!error && data) {
            // Return the file with appropriate content type
            const contentType = 
              format === 'json' ? 'application/json' :
              format === 'md' ? 'text/markdown' :
              format === 'pdf' ? 'application/pdf' :
              'application/octet-stream';

            return new NextResponse(data, {
              headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${report.framework}-compliance-report-${reportId}.${format}"`,
              },
            });
          }
        }
      } catch (storageError: any) {
        console.warn('Failed to download from storage, generating on-the-fly:', storageError.message);
      }
    }

    // Fallback: Generate file on-the-fly from database
    const reportData = report.reportData as any;
    
    if (format === 'json') {
      return new NextResponse(JSON.stringify(reportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${report.framework}-compliance-report-${reportId}.json"`,
        },
      });
    }

    if (format === 'md') {
      // Generate markdown from report data
      const markdown = generateMarkdownReport(reportData, report.framework);
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="${report.framework}-compliance-report-${reportId}.md"`,
        },
      });
    }

    // PDF format - return JSON for now (PDF generation would require a library like puppeteer)
    return NextResponse.json(
      { error: 'PDF format not yet supported. Please use md or json format.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Report download error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download report' },
      { status: 500 }
    );
  }
}

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
