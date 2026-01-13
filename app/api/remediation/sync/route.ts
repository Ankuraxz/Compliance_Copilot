/**
 * API route to sync remediation tasks to Linear/Jira via MCP
 */

import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/mcp/client';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { findingIds, provider } = await request.json();

    if (!findingIds || !Array.isArray(findingIds) || findingIds.length === 0) {
      return NextResponse.json(
        { error: 'Finding IDs are required' },
        { status: 400 }
      );
    }

    if (!provider || !['linear', 'jira'].includes(provider)) {
      return NextResponse.json(
        { error: 'Provider must be "linear" or "jira"' },
        { status: 400 }
      );
    }

    // Get remediation tasks
    const tasks = await prisma.remediationTask.findMany({
      where: {
        findingId: { in: findingIds },
      },
      include: {
        finding: {
          include: {
            requirement: true,
          },
        },
      },
    });

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: 'No remediation tasks found' },
        { status: 404 }
      );
    }

    // Get access token
    const cookieStore = await cookies();
    const token = cookieStore.get(`mcp_${provider}_token`)?.value;

    if (!token) {
      return NextResponse.json(
        { error: `Not authenticated with ${provider}. Please connect first.` },
        { status: 401 }
      );
    }

    // Connect to MCP server
    await mcpClientManager.connect(provider, token);

    const syncedTasks = [];

    for (const task of tasks) {
      try {
        // Create ticket via MCP
        const ticket = await mcpClientManager.callTool(provider, 'create_ticket', {
          title: task.title,
          description: task.description,
          priority: task.priority,
          labels: ['compliance', task.finding.requirement?.framework || ''],
        });

        // Update task with external ticket info
        await prisma.remediationTask.update({
          where: { id: task.id },
          data: {
            externalId: ticket.id,
            externalUrl: ticket.url,
            status: 'in_progress',
          },
        });

        syncedTasks.push({
          taskId: task.id,
          ticketId: ticket.id,
          ticketUrl: ticket.url,
        });
      } catch (error: any) {
        console.error(`Error syncing task ${task.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      synced: syncedTasks.length,
      tasks: syncedTasks,
    });
  } catch (error: any) {
    console.error('Remediation sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync remediation tasks' },
      { status: 500 }
    );
  }
}

