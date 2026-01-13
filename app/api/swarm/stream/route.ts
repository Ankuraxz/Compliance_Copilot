/**
 * Server-Sent Events (SSE) endpoint for streaming agent swarm activity
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SwarmManagerAgent } from '@/agents/swarm/manager-agent';
import { ReportGenerationAgent } from '@/agents/swarm/report-agent';
import { prisma } from '@/lib/db';
import { mcpClientManager } from '@/mcp/client';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

// Register all MCP servers on module load
registerAllMCPServers(mcpClientManager);

/**
 * Save findings to database
 */
async function saveFindingsToDatabase(
  projectId: string,
  framework: string,
  gapFindings: Array<{
    id: string;
    requirementCode: string;
    severity: string;
    title: string;
    description: string;
    evidence: Array<{
      type: string;
      source: string;
      filePath?: string;
      lineNumber?: number;
      content: string;
      url?: string;
    }>;
    recommendation?: string;
  }>,
  userId: string
): Promise<void> {
  try {
    // Get or create framework
    let frameworkRecord = await prisma.complianceFramework.findFirst({
      where: { name: framework },
    });

    if (!frameworkRecord) {
      frameworkRecord = await prisma.complianceFramework.create({
        data: { name: framework },
      });
    }

    // Create assessment if it doesn't exist
    let assessment = await prisma.complianceAssessment.findFirst({
      where: {
        projectId,
        frameworkId: frameworkRecord.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!assessment) {
      assessment = await prisma.complianceAssessment.create({
        data: {
          projectId,
          frameworkId: frameworkRecord.id,
          score: 0,
          status: 'in_progress',
        },
      });
    }

    // Save findings
    for (const gap of gapFindings) {
      const requirement = await prisma.complianceRequirement.findFirst({
        where: {
          frameworkId: frameworkRecord.id,
          code: gap.requirementCode,
        },
      });

      const finding = await prisma.finding.create({
        data: {
          projectId,
          assessmentId: assessment.id,
          requirementId: requirement?.id,
          severity: gap.severity,
          title: gap.title,
          description: gap.description,
          status: 'open',
        },
      });

      // Save evidence
      for (const evidence of gap.evidence || []) {
        await prisma.evidence.create({
          data: {
            findingId: finding.id,
            type: evidence.type,
            source: evidence.source,
            filePath: evidence.filePath,
            lineNumber: evidence.lineNumber,
            content: typeof evidence.content === 'string' 
              ? evidence.content 
              : JSON.stringify(evidence.content || {}),
            url: evidence.url,
          },
        });
      }
    }

    console.log(`[Database] Saved ${gapFindings.length} findings to database`);
  } catch (error: any) {
    console.error('[Database] Error saving findings:', error.message);
    // Don't throw - findings save is optional
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const agentRunId = searchParams.get('agentRunId');

  if (!agentRunId) {
    return new Response('agentRunId is required', { status: 400 });
  }

  // Verify user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Verify agent run belongs to user
  const agentRun = await prisma.agentRun.findFirst({
    where: {
      id: agentRunId,
      project: {
        userId: user.id,
      },
    },
  });

  if (!agentRun) {
    return new Response('Agent run not found', { status: 404 });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      // Track controller state
      const originalClose = controller.close.bind(controller);
      controller.close = () => {
        isClosed = true;
        return originalClose();
      };

      const sendEvent = (data: any) => {
        try {
          // Check if stream is closed before trying to enqueue
          if (isClosed) {
            console.warn('[SSE] Attempted to send event after stream was closed');
            return;
          }

          // Check controller state
          if (controller.desiredSize === null) {
            console.warn('[SSE] Controller is closed, cannot send event');
            isClosed = true;
            return;
          }

          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error: any) {
          // Handle errors gracefully - don't crash the process
          if (error.code === 'ERR_INVALID_STATE' || error.message?.includes('closed')) {
            console.warn('[SSE] Stream controller is closed, ignoring event');
            isClosed = true;
          } else {
            console.error('[SSE] Error sending event:', error);
          }
        }
      };

      try {
        // Send initial status
        sendEvent({
          type: 'step',
          agent: 'swarm-manager',
          step: 'Initializing swarm...',
          status: 'running',
        });

        // Get project and framework from agent run
        const project = await prisma.project.findUnique({
          where: { id: agentRun.projectId },
        });

        if (!project) {
          sendEvent({
            type: 'error',
            error: 'Project not found',
          });
          if (!isClosed) {
            isClosed = true;
            controller.close();
          }
          return;
        }

        const framework = (agentRun.input as any)?.framework || 'SOC2';

        // Run swarm with progress updates
        const manager = new SwarmManagerAgent();
        const sessionId = agentRun.id;
        let finalSwarmState: any = null;

        finalSwarmState = await manager.run(agentRun.projectId, user.id, framework, (state) => {
          // Determine agent name from current step or state
          let agentName = 'swarm-manager';
          const step = state.currentStep.toLowerCase();
          
          // More specific matching for agent identification
          if (step.includes('phase 1') || step.includes('planning') || step.includes('assessment plan')) {
            agentName = 'phase1_planning';
          } else if (step.includes('phase 2') || (step.includes('scanning') && step.includes('compliance')) || step.includes('cybersecurity specialist') || step.includes('intelligent extraction')) {
            // Intelligent extraction phase - identify by server name
            if (step.includes('github') || step.includes('codebase')) {
              agentName = 'extract_github';
            } else if (step.includes('aws') || step.includes('aws-core') || step.includes('infrastructure')) {
              agentName = 'extract_aws';
            } else if (step.includes('sonarqube')) {
              agentName = 'extract_sonarqube';
            } else if (step.includes('sentry')) {
              agentName = 'extract_sentry';
            } else if (step.includes('atlassian')) {
              agentName = 'extract_atlassian';
            } else {
              agentName = 'phase2_intelligent_extraction';
            }
          } else if (step.includes('starting extract_aws') || step.includes('extracting aws') || step.includes('aws extraction') || step.includes('aws infrastructure')) {
            agentName = 'extract_aws';
          } else if (step.includes('starting extract_github') || step.includes('extracting github') || step.includes('github extraction') || step.includes('github codebase')) {
            agentName = 'extract_github';
          } else if (step.includes('starting extract_sonarqube') || step.includes('extracting sonarqube') || step.includes('sonarqube extraction')) {
            agentName = 'extract_sonarqube';
          } else if (step.includes('starting extract_sentry') || step.includes('extracting sentry') || step.includes('sentry extraction')) {
            agentName = 'extract_sentry';
          } else if (step.includes('starting extract_atlassian') || step.includes('extracting atlassian') || step.includes('atlassian extraction')) {
            agentName = 'extract_atlassian';
          } else if (step.includes('aggregating') || step.includes('aggregate') || step.includes('phase 2 completed')) {
            agentName = 'aggregate_extraction';
          } else if (step.includes('phase 3') && !step.includes('3.1') && !step.includes('3.2') && !step.includes('3.3') && (step.includes('analyzing data') || step.includes('performing research') || step.includes('analysis and research'))) {
            agentName = 'phase3_analysis';
          } else if (step.includes('phase 3.1') || step.includes('regulation rag') || step.includes('retrieving compliance requirements')) {
            agentName = 'phase3_1_regulation_rag';
          } else if (step.includes('phase 3.2') || step.includes('gap analysis') || step.includes('analyzing compliance gaps')) {
            agentName = 'phase3_2_gap_analysis';
          } else if (step.includes('phase 3.3') || step.includes('remediation') || step.includes('creating remediation plan')) {
            agentName = 'phase3_3_remediation';
          } else if (step.includes('phase 4') || step.includes('generating report') || step.includes('report generation') || step.includes('report generated')) {
            agentName = 'phase4_report';
          } else if (step.includes('phase 5') || step.includes('comparing') || step.includes('comparison') || step.includes('assessment finished')) {
            agentName = 'phase5_comparison';
          } else if (step.includes('checking mcp') || step.includes('starting extraction') || step.includes('initializing')) {
            agentName = 'swarm-manager';
          }

          // Determine status - if there are errors in this step, mark as failed
          let status = state.status || 'running';
          if (state.errors.length > 0) {
            // If step mentions error or failed, mark as failed
            if (step.includes('error') || step.includes('failed')) {
              status = 'failed';
            }
          }

          // Send step update - CRITICAL: Always send to ensure frontend tracks agent activity
          sendEvent({
            type: 'step',
            agent: agentName,
            step: state.currentStep || 'Processing...',
            status: status,
            error: state.errors.length > 0 ? state.errors[state.errors.length - 1] : undefined,
            data: {
              extractionResults: state.extractionResults.length,
              errors: state.errors.length,
              errorsList: state.errors,
              toolCalls: state.toolCalls || [], // Include tool calls for stats
            },
          });
        });

        // Use report from Phase 4 if available, otherwise generate it
        let report = finalSwarmState?.report;
        
        if (!report && finalSwarmState?.status === 'completed') {
          // Only generate report if workflow completed successfully but report is missing
          sendEvent({
            type: 'step',
            agent: 'report-generator',
            step: 'Generating compliance report...',
            status: 'running',
          });

          const reportAgent = new ReportGenerationAgent(agentRun.projectId, sessionId);
          report = await reportAgent.generateReport(
            finalSwarmState,
            finalSwarmState?.extractionResults || [],
            finalSwarmState?.analysis
          );
        } else if (report) {
          // Report already generated in Phase 4
          sendEvent({
            type: 'step',
            agent: 'report-generator',
            step: 'Report available from Phase 4',
            status: 'completed',
          });
        } else {
          // Workflow failed, no report
          sendEvent({
            type: 'step',
            agent: 'report-generator',
            step: 'Report generation skipped - workflow failed',
            status: 'failed',
          });
        }

        // MULTI-LAYER PROTECTION: Save report to database and storage if available
        // LAYER 1: Always try to save report, even if status is not 'completed'
        if (report) {
          try {
            const findingsCount = (report as any)?.findings?.length || 0;
            const score = (report as any)?.complianceScore?.overall || null;
            const framework = finalSwarmState?.framework || 'SOC2';
            
            // LAYER 2: Validate report structure before saving
            if (!report.executiveSummary || !report.sections || !report.findings) {
              console.warn('[Stream] Report structure is invalid, attempting to save anyway');
            }
            
            // LAYER 3: Save report with timeout protection
            try {
              // Use absolute URL for production, relative for same-origin
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
              const savePromise = fetch(`${baseUrl}/api/reports`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Cookie': request.headers.get('cookie') || '',
                },
                body: JSON.stringify({
                  projectId: agentRun.projectId,
                  agentRunId: agentRun.id,
                  framework,
                  reportData: report,
                  score,
                  findingsCount,
                }),
              });
              
              const saveTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Report save timeout')), 30000);
              });
              
              await Promise.race([savePromise, saveTimeout]);
              // Report saved successfully (logged for monitoring)
              console.log('[Stream] Report saved successfully');
            } catch (saveError: any) {
              console.warn('[Stream] Report save failed or timed out:', saveError?.message || 'Unknown error');
              // Continue - report save failure is not critical
            }

            // LAYER 4: Save findings to database if available (non-blocking)
            if (finalSwarmState?.gapFindings && finalSwarmState.gapFindings.length > 0) {
              try {
                await saveFindingsToDatabase(
                  agentRun.projectId,
                  framework,
                  finalSwarmState.gapFindings,
                  user.id
                );
                // Findings saved successfully (logged for monitoring)
                console.log('[Stream] Findings saved successfully');
              } catch (findingsError: any) {
                console.warn('[Stream] Findings save failed (non-critical):', findingsError?.message || 'Unknown error');
                // Continue - findings save failure is not critical
              }
            }
          } catch (saveError: any) {
            console.warn('[Stream] Failed to save report or findings:', saveError?.message || 'Unknown error');
            // Continue even if save fails - report is still available in agentRun.output
          }
        } else {
          console.warn('[Stream] No report available to save');
        }

        // Update agent run
        await prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: finalSwarmState?.status === 'completed' ? 'completed' : 'failed',
            output: {
              swarmState: finalSwarmState,
              report,
            },
            error: finalSwarmState?.errors?.length > 0 ? finalSwarmState.errors.join('\n') : null,
            completedAt: new Date(),
          },
        });

        sendEvent({
          type: 'step',
          agent: 'report-generator',
          step: 'Report generated and saved successfully',
          status: 'completed',
        });

        sendEvent({
          type: 'complete',
          status: 'completed',
        });
      } catch (error: any) {
        sendEvent({
          type: 'error',
          error: error.message || 'Unknown error occurred',
        });

        await prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          },
        });
      } finally {
        // Cleanup: Disconnect MCP connections to free resources
        try {
          await mcpClientManager.disconnectAll();
        } catch (cleanupError) {
          console.warn('Error during MCP cleanup:', cleanupError);
        }
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

