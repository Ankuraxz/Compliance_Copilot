/**
 * API route to run compliance assessment
 */

import { NextRequest, NextResponse } from 'next/server';
import { ComplianceOrchestrator } from '@/agents/orchestrator';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId, framework, repoUrl } = await request.json();

    if (!projectId || !framework) {
      return NextResponse.json(
        { error: 'Project ID and framework are required' },
        { status: 400 }
      );
    }

    // Verify project exists and belongs to user
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

    // Create agent run record
    const agentRun = await prisma.agentRun.create({
      data: {
        projectId,
        agentType: 'orchestrator',
        status: 'running',
        input: { framework, repoUrl },
      },
    });

    // Run assessment asynchronously
    const sessionId = agentRun.id; // Use agent run ID as session ID
    const orchestrator = new ComplianceOrchestrator(projectId, sessionId);
    
    // Run in background (in production, use a job queue)
    orchestrator
      .runAssessment(projectId, framework, repoUrl, (state) => {
        // Update agent run with progress
        // In production, use WebSocket or SSE for real-time updates
        // Log progress for monitoring (can be removed in production if needed)
        // console.log('Assessment progress:', state.currentStep);
      })
      .then(async (finalState) => {
        await prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: finalState.status === 'completed' ? 'completed' : 'failed',
            output: finalState.data,
            error: finalState.errors.length > 0 ? finalState.errors.join('\n') : null,
            completedAt: new Date(),
          },
        });
      })
      .catch(async (error) => {
        await prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          },
        });
      });

    return NextResponse.json({
      success: true,
      agentRunId: agentRun.id,
      message: 'Assessment started',
    });
  } catch (error: any) {
    console.error('Assessment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start assessment' },
      { status: 500 }
    );
  }
}

