/**
 * API route to run agent swarm analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SwarmManagerAgent } from '@/agents/swarm/manager-agent';
import { ReportGenerationAgent } from '@/agents/swarm/report-agent';
import { prisma } from '@/lib/db';
import { mcpClientManager } from '@/mcp/client';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

// Register all MCP servers on module load
registerAllMCPServers(mcpClientManager);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, framework } = await request.json();

    if (!framework) {
      return NextResponse.json(
        { error: 'Framework is required' },
        { status: 400 }
      );
    }

    // Validate required MCP connections
    const connections = await prisma.mCPConnection.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
    });

    const isGitHubConnected = connections.some(c => c.serverName === 'github');
    const cloudServers = ['aws-core', 'azure', 'cloudflare', 'gcloud'];
    const isCloudServiceConnected = connections.some(c => cloudServers.includes(c.serverName));

    if (!isGitHubConnected) {
      return NextResponse.json(
        { error: 'GitHub connection is required. Please connect GitHub in MCP Connections tab.' },
        { status: 400 }
      );
    }

    if (!isCloudServiceConnected) {
      return NextResponse.json(
        { error: 'At least one cloud service connection is required (AWS, Azure, Cloudflare, or Google Cloud). Please connect a cloud service in MCP Connections tab.' },
        { status: 400 }
      );
    }

    // Get or create project
    let project = null;
    
    if (projectId && projectId !== 'default') {
      // Try to find existing project
      project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: user.id,
        },
      });
    }

    // Create default project if not found or if projectId is 'default'
    if (!project) {
      // Check if user already has a default project
      project = await prisma.project.findFirst({
        where: {
          userId: user.id,
          name: 'Default Project',
        },
      });

      // Create default project if it doesn't exist
      if (!project) {
        project = await prisma.project.create({
          data: {
            userId: user.id,
            name: 'Default Project',
            description: 'Default compliance assessment project',
          },
        });
      }
    }

    // Create agent run (status will be updated by stream route)
    const agentRun = await prisma.agentRun.create({
      data: {
        projectId: project.id,
        agentType: 'swarm',
        status: 'pending',
        input: { framework },
      },
    });

    // Note: The actual swarm execution happens via the /api/swarm/stream endpoint
    // This allows for real-time progress updates via Server-Sent Events

    return NextResponse.json({
      success: true,
      agentRunId: agentRun.id,
      message: 'Agent swarm started. Connect to /api/swarm/stream for real-time updates.',
    });
  } catch (error: any) {
    console.error('Swarm run error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start swarm' },
      { status: 500 }
    );
  }
}

