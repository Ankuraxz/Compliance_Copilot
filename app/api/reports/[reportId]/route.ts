/**
 * API route for individual report operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

/**
 * GET - Get a specific report by ID
 */
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

    // Get report with project verification
    const report = await prisma.complianceReport.findFirst({
      where: {
        id: reportId,
        project: {
          userId: user.id,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
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

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error('Report fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch report' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a report
 */
export async function DELETE(
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

    // Verify report belongs to user
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

    // Delete from storage if URL exists
    if (report.storageUrl) {
      try {
        // Extract file path from URL
        const urlParts = report.storageUrl.split('/compliance-reports/');
        if (urlParts.length > 1) {
          const fileName = urlParts[1].split('?')[0];
          await supabase.storage
            .from('compliance-reports')
            .remove([`reports/${report.projectId}/${fileName}`]);
        }
      } catch (storageError: any) {
        console.warn('Failed to delete report from storage:', storageError.message);
        // Continue with database deletion
      }
    }

    // Delete from database
    await prisma.complianceReport.delete({
      where: {
        id: reportId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Report delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete report' },
      { status: 500 }
    );
  }
}

