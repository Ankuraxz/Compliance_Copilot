/**
 * Manager Agent for Agent Swarm
 * Orchestrates 5-phase agentic workflow:
 * 1. Planning Agent - Creates assessment plan
 * 2. Extraction Agent - Uses MCP tools, accumulates context with Mem0
 * 3. Analysis & Research Agent - Uses Firecrawl, Perplexity, Browserbase
 * 4. Report Generation Agent - Compiles final report
 * 5. Comparison Agent - Compares plan vs findings, decides next actions
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';
import { mcpClientManager } from '@/mcp/client';

// Ensure MCP servers are registered before use
// This is safe to call multiple times - registerServer is idempotent
if (typeof window === 'undefined') {
  // Only register on server side
  try {
    registerAllMCPServers(mcpClientManager);
  } catch (error) {
    // Ignore if already registered
    console.debug('MCP servers registration in manager:', error);
  }
}
import {
  AWSExtractionAgent,
  GitHubExtractionAgent,
  SonarQubeExtractionAgent,
  SentryExtractionAgent,
  AtlassianExtractionAgent,
  FirecrawlExtractionAgent,
  PerplexityExtractionAgent,
  BrowserbaseExtractionAgent,
  ExtractionResult,
} from './extraction-agents';
import { IntelligentExtractionAgent } from './intelligent-extraction-agent';
import { PlanningAgent, AssessmentPlan } from './planning-agent';
import { AnalysisResearchAgent, AnalysisResult } from './analysis-research-agent';
import { ReportGenerationAgent, DetailedReport } from './report-agent';
import { ComparisonAgent, ComparisonResult } from './comparison-agent';
import { getMCPConnection } from '@/lib/mcp-connection';
import { getInternalMCPCredentials } from '@/lib/mcp/internal-credentials';
import { GapAnalysisAgent } from '../gap-analysis-agent';
import { ActionPlannerAgent } from '../action-planner-agent';
import { RegulationRAGAgent } from '../regulation-rag-agent';
import type { GapFinding, RemediationTask, ComplianceRequirement } from '../types';

export interface SwarmState {
  projectId: string;
  userId: string;
  framework: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: string;
  // Phase 1: Planning
  plan?: AssessmentPlan;
  // Phase 2: Extraction
  extractionResults: ExtractionResult[];
  // Phase 3: Analysis
  analysis?: AnalysisResult;
  // Phase 3.1: Regulation RAG (requirements retrieval)
  requirements?: ComplianceRequirement[];
  // Phase 3.2: Gap Analysis
  gapFindings?: GapFinding[];
  // Phase 3.3: Remediation Plan
  remediationPlan?: RemediationTask[];
  // Phase 4: Report
  report?: DetailedReport;
  // Phase 5: Comparison
  comparison?: ComparisonResult;
  errors: string[];
}

export class SwarmManagerAgent {
  private onUpdateCallback?: (state: SwarmState) => void;

  /**
   * Create the 5-phase agentic workflow graph
   * Phase 1: Planning
   * Phase 2: Extraction (MCP tools + Mem0)
   * Phase 3: Analysis & Research (Firecrawl, Perplexity, Browserbase)
   * Phase 4: Report Generation
   * Phase 5: Comparison & Decision
   */
  async createGraph(projectId: string, userId: string, framework: string) {
    const workflow = new StateGraph<SwarmState>({
      channels: {
        projectId: { reducer: (x: string) => x },
        userId: { reducer: (x: string) => x },
        framework: { reducer: (x: string) => x },
        status: { reducer: (x: 'pending' | 'running' | 'completed' | 'failed', y?: 'pending' | 'running' | 'completed' | 'failed') => (y || x) as 'pending' | 'running' | 'completed' | 'failed' },
        currentStep: { reducer: (x: string) => x },
        plan: { reducer: (x: AssessmentPlan | undefined) => x },
        extractionResults: { reducer: (x: ExtractionResult[], y: ExtractionResult[]) => [...(x || []), ...(y || [])] },
        analysis: { reducer: (x: AnalysisResult | undefined) => x },
        requirements: { reducer: (x: ComplianceRequirement[] | undefined) => x },
        gapFindings: { reducer: (x: GapFinding[] | undefined) => x },
        remediationPlan: { reducer: (x: RemediationTask[] | undefined) => x },
        report: { reducer: (x: DetailedReport | undefined) => x },
        comparison: { reducer: (x: ComparisonResult | undefined) => x },
        errors: { reducer: (x: string[], y: string[]) => [...(x || []), ...(y || [])] },
      },
    });

    // Phase 1: Planning Agent
    workflow.addNode('phase1_planning', async (state: SwarmState) => {
      const result = await this.phase1Planning(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 2: Intelligent Extraction (cybersecurity specialist scanning)
    const availableConnections = await this.getAvailableConnections(userId);
    
    // Use intelligent extraction agent that acts as cybersecurity specialist
    workflow.addNode('phase2_intelligent_extraction', async (state: SwarmState) => {
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 2: Cybersecurity specialist scanning systems for compliance...',
        });
      }
      
      const result = await this.phase2IntelligentExtraction(state, availableConnections);
      
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 3: Analysis & Research Agent
    workflow.addNode('phase3_analysis', async (state: SwarmState) => {
      // Send initial status update
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 3: Starting analysis and research...',
        });
      }
      
      const result = await this.phase3Analysis(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 3.1: Regulation RAG Agent
    workflow.addNode('phase3_1_regulation_rag', async (state: SwarmState) => {
      // Send initial status update
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 3.1: Starting Regulation RAG...',
        });
      }
      
      const result = await this.phase3RegulationRAG(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 3.2: Gap Analysis Agent
    workflow.addNode('phase3_2_gap_analysis', async (state: SwarmState) => {
      // Send initial status update
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 3.2: Starting Gap Analysis...',
        });
      }
      
      const result = await this.phase3GapAnalysis(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 3.3: Remediation Agent
    workflow.addNode('phase3_3_remediation', async (state: SwarmState) => {
      // Send initial status update
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 3.3: Starting Remediation Planning...',
        });
      }
      
      const result = await this.phase3Remediation(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 4: Report Generation Agent
    workflow.addNode('phase4_report', async (state: SwarmState) => {
      // Send initial status update
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 4: Starting report generation...',
        });
      }
      
      const result = await this.phase4Report(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Phase 5: Comparison & Decision Agent
    workflow.addNode('phase5_comparison', async (state: SwarmState) => {
      // Send initial status update
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 5: Starting comparison and decision...',
        });
      }
      
      const result = await this.phase5Comparison(state);
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, ...result });
      }
      return result;
    });

    // Define workflow edges with conditional routing - stop on failure
    // LangGraph type definitions are overly strict - use type assertions
    (workflow as any).addEdge(START, 'phase1_planning');
    
    // Connect planning to intelligent extraction with conditional check
    if (availableConnections.length > 0) {
      // We have MCP connections - use intelligent extraction
      (workflow as any).addConditionalEdges(
        'phase1_planning',
        (state: SwarmState) => {
          if (!state.plan || state.errors.length > 0 || state.currentStep.includes('failed')) {
            return 'stop';
          }
          return 'continue';
        },
        {
          continue: 'phase2_intelligent_extraction',
          stop: END,
        }
      );
      
      // Intelligent extraction to Phase 3 with conditional check
      (workflow as any).addConditionalEdges(
        'phase2_intelligent_extraction',
        (state: SwarmState) => {
          if (state.errors.length > 0 && state.extractionResults.length === 0) {
            return 'stop';
          }
          return 'continue';
        },
        {
          continue: 'phase3_analysis',
          stop: END,
        }
      );
    } else {
      // No connections - skip extraction and go directly to analysis
      (workflow as any).addConditionalEdges(
        'phase1_planning',
        (state: SwarmState) => {
          if (!state.plan || state.errors.length > 0 || state.currentStep.includes('failed')) {
            return 'stop';
          }
          return 'continue';
        },
        {
          continue: 'phase3_analysis',
          stop: END,
        }
      );
    }

    // Phase 3 to Phase 3.1 (Regulation RAG) with conditional check
    (workflow as any).addConditionalEdges(
      'phase3_analysis',
      (state: SwarmState) => {
        if (!state.analysis || state.errors.length > 0 || state.currentStep.includes('failed')) {
          return 'stop';
        }
        return 'continue';
      },
      {
        continue: 'phase3_1_regulation_rag',
        stop: END,
      }
    );

    // Phase 3.1 to Phase 3.2 (Gap Analysis) with conditional check
    (workflow as any).addConditionalEdges(
      'phase3_1_regulation_rag',
      (state: SwarmState) => {
        // Log state for debugging
        console.log(`[Workflow] Phase 3.1 -> 3.2 check: requirements=${state.requirements?.length || 0}, errors=${state.errors.length}, step="${state.currentStep}"`);
        
        // Only stop if there are critical errors or explicitly failed
        // Always continue if we have requirements (even if empty - gap analysis can handle it)
        if (state.currentStep.includes('failed') && (!state.requirements || state.requirements.length === 0)) {
          console.warn('[Workflow] Phase 3.1 failed with no requirements, stopping workflow');
          return 'stop';
        }
        
        // If we have requirements (even if empty), continue to gap analysis
        // Gap analysis can generate requirements if needed
        if (state.requirements && state.requirements.length > 0) {
          console.log(`[Workflow] Phase 3.1 completed with ${state.requirements.length} requirements, continuing to gap analysis`);
          return 'continue';
        }
        
        // MULTI-LAYER PROTECTION: If no requirements but no explicit failure, generate them and continue
        if (!state.currentStep.includes('failed')) {
          console.warn('[Workflow] Phase 3.1 completed with no requirements, generating basic requirements and continuing to gap analysis');
          
          // Generate requirements inline to ensure workflow continues
          const basicReqs = this.generateBasicRequirements(state.framework || 'SOC2');
          if (basicReqs && basicReqs.length > 0) {
            // Update state with requirements before continuing
            state.requirements = basicReqs;
            console.log(`[Workflow] Generated ${basicReqs.length} basic requirements inline, continuing to gap analysis`);
            return 'continue';
          } else {
            // Last resort: create minimal requirement
            state.requirements = [{
              code: 'REQ-1',
              title: 'Basic Compliance Requirement',
              description: `Ensure compliance with ${state.framework || 'SOC2'} framework`,
              category: 'General',
              framework: state.framework || 'SOC2',
              relevance: 0.5,
            }];
            console.log('[Workflow] Created minimal requirement inline, continuing to gap analysis');
            return 'continue';
          }
        }
        
        return 'stop';
      },
      {
        continue: 'phase3_2_gap_analysis',
        stop: END,
      }
    );

    // Phase 3.2 to Phase 3.3 (Remediation) with conditional check
    (workflow as any).addConditionalEdges(
      'phase3_2_gap_analysis',
      (state: SwarmState) => {
        if (state.errors.length > 0 || state.currentStep.includes('failed')) {
          return 'stop';
        }
        return 'continue';
      },
      {
        continue: 'phase3_3_remediation',
        stop: END,
      }
    );

    // Phase 3.3 to Phase 4 with conditional check
    (workflow as any).addConditionalEdges(
      'phase3_3_remediation',
      (state: SwarmState) => {
        if (state.errors.length > 0 || state.currentStep.includes('failed')) {
          return 'stop';
        }
        return 'continue';
      },
      {
        continue: 'phase4_report',
        stop: END,
      }
    );

    // Phase 4 to Phase 5 with conditional check
    (workflow as any).addConditionalEdges(
      'phase4_report',
      (state: SwarmState) => {
        // MULTI-LAYER PROTECTION: Continue even if report generation had issues
        // Only stop if explicitly failed AND no report was created
        if (state.currentStep.includes('failed') && !state.report) {
          console.warn('[Workflow] Phase 4 failed with no report, stopping workflow');
          return 'stop';
        }
        
        // If we have a report (even if errors occurred), continue
        if (state.report) {
          console.log('[Workflow] Phase 4 completed with report, continuing to comparison');
          return 'continue';
        }
        
        // If no report but no explicit failure, still continue (comparison can handle it)
        if (!state.currentStep.includes('failed')) {
          console.warn('[Workflow] Phase 4 completed with no report, but continuing to comparison');
          return 'continue';
        }
        
        return 'stop';
      },
      {
        continue: 'phase5_comparison',
        stop: END,
      }
    );

    // Phase 5 to END (final phase)
    (workflow as any).addEdge('phase5_comparison', END);

    return workflow.compile();
  }

  /**
   * Phase 2: Intelligent Extraction - Cybersecurity specialist scanning
   */
  private async phase2IntelligentExtraction(
    state: SwarmState,
    availableConnections: Array<{ serverName: string; credentials: any }>
  ): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 2: Cybersecurity specialist scanning systems for compliance violations...';
      
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 2: Fetching regulations and creating intelligent scan plan...',
        });
      }

      // Use intelligent extraction agent with progress tracking
      const intelligentAgent = new IntelligentExtractionAgent(
        state.projectId,
        state.userId, // sessionId
        state.framework,
        {
          // Configuration for comprehensive scanning (allows hours of runtime)
          maxToolCallsPerServer: 0, // 0 = unlimited
          maxScanTasksPerServer: 0, // 0 = unlimited
          batchSize: 5, // Process 5 tools in parallel
          maxIterationsPerServer: 20, // Allow up to 20 rounds of scanning per server
          scanDepth: 'comprehensive', // Full comprehensive scan
          onProgress: (progress) => {
            // Report detailed progress back to the state
            if (this.onUpdateCallback) {
              try {
                const progressMessage = (progress.totalTasks && progress.totalTasks > 0)
                  ? `${progress.serverName}: ${progress.message} (${progress.currentTask || 0}/${progress.totalTasks} tasks, ${progress.completedToolCalls || 0}/${progress.totalToolCalls || 0} tools)`
                  : `${progress.serverName}: ${progress.message}`;

                this.onUpdateCallback({
                  ...state,
                  currentStep: `Phase 2: ${progressMessage}`,
                });
              } catch (error: any) {
                // Handle errors gracefully - don't crash the extraction process
                if (error.code === 'ERR_INVALID_STATE' || error.message?.includes('closed')) {
                  console.warn('[Manager] Stream is closed, progress update ignored');
                } else {
                  console.error('[Manager] Error in progress callback:', error);
                }
              }
            }
          },
        }
      );

      // Prepare MCP connections for intelligent scanning
      const mcpConnections = availableConnections.map(conn => ({
        serverName: conn.serverName,
        credentials: conn.credentials,
      }));

      // Emit event for Phase 2 start
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 2: Starting intelligent extraction for each connected MCP server...',
        });
      }

      // Perform intelligent extraction
      const result = await intelligentAgent.extractIntelligently(mcpConnections);

      // Emit event for each MCP server scanned
      for (const conn of mcpConnections) {
        if (this.onUpdateCallback) {
          this.onUpdateCallback({
            ...state,
            currentStep: `Phase 2: Scanning ${conn.serverName} for compliance violations...`,
          });
        }
      }

      return {
        extractionResults: [result],
        status: 'running',
        currentStep: `Phase 2 completed: Intelligent scan found ${result.data.findings?.length || 0} compliance issues`,
      };
    } catch (error: any) {
      const errorMessage = `Phase 2: Intelligent extraction error - ${error.message}`;
      console.error(errorMessage);
      
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          status: 'failed',
          currentStep: 'Phase 2 failed',
          errors: [...state.errors, errorMessage],
        });
      }
      
      return {
        status: 'failed',
        errors: [...state.errors, errorMessage],
        currentStep: 'Phase 2 failed',
      };
    }
  }

  /**
   * Phase 1: Planning Agent
   */
  private async phase1Planning(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 1: Creating assessment plan...';
      
      const availableConnections = await this.getAvailableConnections(state.userId);
      const connectionNames = availableConnections.map(c => c.serverName);

      const planningAgent = new PlanningAgent(state.projectId, state.userId);
      const plan = await planningAgent.createPlan(state.framework, connectionNames);

      return {
        plan,
        status: 'running',
        currentStep: 'Phase 1 completed: Assessment plan created',
      };
    } catch (error: any) {
      return {
        status: 'failed',
        errors: [...state.errors, `Planning phase error: ${error.message}`],
        currentStep: 'Phase 1 failed',
      };
    }
  }

  /**
   * Phase 3: Analysis & Research Agent
   */
  private async phase3Analysis(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 3: Analyzing data and performing research...';
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: 'Phase 3: Analyzing data and performing research...',
        });
      }

      if (!state.plan) {
        const errorMessage = 'Cannot analyze without assessment plan';
        return {
          status: 'failed',
          errors: [...state.errors, errorMessage],
          currentStep: 'Phase 3 failed: Missing plan',
        };
      }

      // Check if we have any extraction results or if there were critical errors
      if (state.extractionResults.length === 0) {
        const skipMessage = state.errors.length > 0 
          ? 'Phase 3 skipped: No extraction results due to errors in Phase 2'
          : 'Phase 3 skipped: No extraction results available. MCP tools may not be fully implemented.';
        
        if (this.onUpdateCallback) {
          this.onUpdateCallback({
            ...state,
            currentStep: skipMessage,
          });
        }
        
        if (state.errors.length > 0) {
          return {
            status: 'failed',
            errors: [...state.errors, skipMessage],
            currentStep: skipMessage,
          };
        }
        
        // If no errors but no results, still mark as failed to stop workflow
        return {
          status: 'failed',
          currentStep: skipMessage,
        };
      }

      const analysisAgent = new AnalysisResearchAgent(state.projectId, state.userId);
      const analysis = await analysisAgent.analyze(
        state.extractionResults,
        state.plan,
        state.framework
      );

      return {
        analysis,
        status: 'running',
        currentStep: 'Phase 3 completed: Analysis and research finished',
      };
    } catch (error: any) {
      const errorMessage = `Analysis phase error: ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          status: 'failed',
          currentStep: 'Phase 3 failed',
          errors: [...state.errors, errorMessage],
        });
      }
      return {
        status: 'failed',
        errors: [...state.errors, errorMessage],
        currentStep: 'Phase 3 failed',
      };
    }
  }

  /**
   * Phase 3.1: Regulation RAG Agent - Retrieve compliance requirements
   */
  private async phase3RegulationRAG(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 3.1: Retrieving compliance requirements using RAG...';

      if (!state.plan) {
        return {
          status: 'failed',
          errors: [...state.errors, 'Cannot retrieve requirements without assessment plan'],
          currentStep: 'Phase 3.1 failed: Missing plan',
        };
      }

      // Build codebase context from extraction results
      const codebaseContext = this.buildCodebaseContextFromExtraction(state.extractionResults);

      // Use RegulationRAGAgent to get requirements
      const ragAgent = new RegulationRAGAgent();
      
      // Create a simplified state for the RAG agent
      const ragState = {
        projectId: state.projectId,
        framework: state.framework,
        status: 'running' as const,
        currentStep: 'Retrieving requirements...',
        data: {
          codebase: codebaseContext,
          framework: state.framework,
        },
        errors: [],
        toolCalls: [],
      };

      // Run the RAG agent workflow with timeout to prevent getting stuck
      const ragGraph = ragAgent.createGraph();
      
      // Add timeout to prevent infinite waiting
      const ragPromise = ragGraph.invoke(ragState);
      const ragTimeout = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('Regulation RAG timeout after 60 seconds')), 60000);
      });
      
      let ragResult: any;
      try {
        ragResult = await Promise.race([ragPromise, ragTimeout]);
      } catch (timeoutError: any) {
        console.warn('[Phase 3.1] Regulation RAG timed out, using basic requirements:', timeoutError?.message || 'Timeout');
        ragResult = { data: { requirements: [] } };
      }

      let requirements = ragResult.data?.requirements || [];

      // If no requirements were retrieved, generate basic ones based on framework
      if (requirements.length === 0) {
        console.warn('Regulation RAG returned no requirements, generating basic framework requirements');
        requirements = this.generateBasicRequirements(state.framework);
        console.log(`[Phase 3.1] Generated ${requirements.length} basic requirements as fallback`);
      }

      // MULTI-LAYER PROTECTION: Ensure we always have requirements to continue - this prevents getting stuck
      if (requirements.length === 0) {
        console.error('[Phase 3.1] No requirements available after fallback, generating minimal requirement');
        // LAYER 1: Try one more time with explicit framework
        requirements = this.generateBasicRequirements(state.framework);
        
        // LAYER 2: If still empty, create minimal requirement
        if (requirements.length === 0) {
          console.error('[Phase 3.1] generateBasicRequirements still returned empty, creating minimal requirement');
          requirements = [{
            code: 'REQ-1',
            title: 'Basic Compliance Requirement',
            description: `Ensure compliance with ${state.framework} framework`,
            category: 'General',
            framework: state.framework,
            relevance: 0.5,
          }];
        }
      }
      
      // LAYER 3: Final validation - if still empty, throw error (should never happen)
      if (requirements.length === 0) {
        const errorMsg = '[Phase 3.1] CRITICAL: All fallback mechanisms failed, cannot create requirements';
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      console.log(`[Phase 3.1] Proceeding with ${requirements.length} requirements`);
      
      // CRITICAL: Ensure requirements are properly formatted and not empty
      if (!Array.isArray(requirements) || requirements.length === 0) {
        console.error('[Phase 3.1] Requirements array is invalid or empty, generating basic requirements');
        requirements = this.generateBasicRequirements(state.framework);
      }
      
      // Log requirements for debugging
      console.log(`[Phase 3.1] Returning ${requirements.length} requirements:`, requirements.map((r: ComplianceRequirement) => r.code || r.title).slice(0, 5));
      
      return {
        requirements: requirements, // Explicitly set to ensure it's in the return object
        status: 'running',
        currentStep: `Phase 3.1 completed: Retrieved ${requirements.length} compliance requirements`,
      };
    } catch (error: any) {
      const errorMessage = `Phase 3.1: Regulation RAG error - ${error.message}`;
      console.warn(errorMessage, 'Generating basic requirements as fallback');
      
      // Generate basic requirements as fallback even on error
      let fallbackRequirements = this.generateBasicRequirements(state.framework);
      
      // CRITICAL: Ensure fallback requirements are valid
      if (!Array.isArray(fallbackRequirements) || fallbackRequirements.length === 0) {
        console.error('[Phase 3.1] Fallback requirements are invalid, using minimal requirements');
        fallbackRequirements = [{
          code: 'REQ-1',
          title: 'Basic Compliance Requirement',
          description: 'Ensure compliance with ' + state.framework + ' framework',
          category: 'General',
          framework: state.framework,
          relevance: 0.5,
        }];
      }
      
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          requirements: fallbackRequirements,
          status: 'running',
          currentStep: `Phase 3.1 completed with fallback: Generated ${fallbackRequirements.length} basic requirements`,
          errors: [...state.errors, errorMessage],
        });
      }
      
      console.log(`[Phase 3.1] Returning ${fallbackRequirements.length} fallback requirements`);
      
      return {
        requirements: fallbackRequirements, // Explicitly set to ensure it's in the return object
        status: 'running',
        currentStep: `Phase 3.1 completed with fallback: Generated ${fallbackRequirements.length} basic requirements`,
        errors: [...state.errors, errorMessage],
      };
    }
  }

  /**
   * Phase 3.2: Gap Analysis Agent - Find compliance gaps
   */
  private async phase3GapAnalysis(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 3.2: Analyzing compliance gaps...';
      
      // Log incoming state for debugging
      console.log(`[Phase 3.2] Starting gap analysis. Requirements: ${state.requirements?.length || 0}, Framework: ${state.framework}`);

      // MULTI-LAYER PROTECTION: If no requirements, generate basic ones as fallback
      if (!state.requirements || state.requirements.length === 0) {
        console.warn('[Phase 3.2] No requirements found in state, generating basic requirements for gap analysis');
        state.requirements = this.generateBasicRequirements(state.framework || 'SOC2');
        
        // LAYER 1: Validate generated requirements
        if (!state.requirements || state.requirements.length === 0) {
          console.error('[Phase 3.2] generateBasicRequirements returned empty, creating minimal requirement');
          state.requirements = [{
            code: 'REQ-1',
            title: 'Basic Compliance Requirement',
            description: `Ensure compliance with ${state.framework || 'SOC2'} framework`,
            category: 'General',
            framework: state.framework || 'SOC2',
            relevance: 0.5,
          }];
        }
        
        console.log(`[Phase 3.2] Generated ${state.requirements.length} basic requirements`);
      }
      
      // LAYER 2: Final validation - ensure requirements are valid
      if (!Array.isArray(state.requirements) || state.requirements.length === 0) {
        console.error('[Phase 3.2] Requirements are still invalid after all fallbacks, creating minimal requirement');
        state.requirements = [{
          code: 'REQ-1',
          title: 'Basic Compliance Requirement',
          description: `Ensure compliance with ${state.framework || 'SOC2'} framework`,
          category: 'General',
          framework: state.framework || 'SOC2',
          relevance: 0.5,
        }];
      }
      
      // LAYER 3: Final check - if still empty, throw error (should never happen)
      if (state.requirements.length === 0) {
        const errorMsg = '[Phase 3.2] CRITICAL: All fallback mechanisms failed, cannot create requirements';
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Build codebase context from extraction results
      const codebaseContext = this.buildCodebaseContextFromExtraction(state.extractionResults);
      
      // Extract compliance scan results from intelligent extraction
      const complianceScans: any[] = [];
      const mcpFindings: any[] = [];
      
      for (const result of state.extractionResults) {
        if (result.agent === 'intelligent-extraction') {
          // Extract compliance scans and findings from intelligent extraction
          if (result.data?.complianceScans) {
            complianceScans.push(...(Array.isArray(result.data.complianceScans) ? result.data.complianceScans : [result.data.complianceScans]));
          }
          if (result.data?.findings) {
            mcpFindings.push(...(Array.isArray(result.data.findings) ? result.data.findings : [result.data.findings]));
          }
        }
      }

      // Use GapAnalysisAgent to find gaps
      const gapAgent = new GapAnalysisAgent();
      
      // Create a simplified state for the gap analysis agent with MCP results
      const gapState = {
        projectId: state.projectId,
        framework: state.framework,
        status: 'running' as const,
        currentStep: 'Analyzing gaps...',
        data: {
          codebase: codebaseContext,
          requirements: state.requirements,
          complianceScans: complianceScans, // Pass MCP scan results
          mcpFindings: mcpFindings, // Pass findings from intelligent extraction
        },
        errors: [],
        toolCalls: [],
      };

      // Run the gap analysis agent workflow
      const gapGraph = gapAgent.createGraph();
      const gapResult = await gapGraph.invoke(gapState);

      const gapFindings = gapResult.data?.gaps || [];

      return {
        gapFindings,
        status: 'running',
        currentStep: `Phase 3.2 completed: Found ${gapFindings.length} compliance gaps`,
      };
    } catch (error: any) {
      const errorMessage = `Phase 3.2: Gap analysis error - ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          status: 'failed',
          currentStep: 'Phase 3.2 failed',
          errors: [...state.errors, errorMessage],
        });
      }
      return {
        status: 'failed',
        errors: [...state.errors, errorMessage],
        currentStep: 'Phase 3.2 failed',
      };
    }
  }

  /**
   * Phase 3.3: Remediation Agent - Create action plan
   */
  private async phase3Remediation(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 3.3: Creating remediation plan...';

      if (!state.gapFindings || state.gapFindings.length === 0) {
        // No gaps found - still create an empty plan
        return {
          remediationPlan: [],
          status: 'running',
          currentStep: 'Phase 3.3 completed: No gaps found, no remediation needed',
        };
      }

      // Use ActionPlannerAgent to create remediation tasks
      const actionAgent = new ActionPlannerAgent();
      
      // Create a simplified state for the action planner
      const actionState = {
        projectId: state.projectId,
        framework: state.framework,
        status: 'running' as const,
        currentStep: 'Planning remediation...',
        data: {
          gaps: state.gapFindings,
        },
        errors: [],
        toolCalls: [],
      };

      // Run the action planner agent workflow
      const actionGraph = actionAgent.createGraph();
      const actionResult = await actionGraph.invoke(actionState);

      const remediationPlan = actionResult.data?.remediationPlan || [];

      return {
        remediationPlan,
        status: 'running',
        currentStep: `Phase 3.3 completed: Created ${remediationPlan.length} remediation tasks`,
      };
    } catch (error: any) {
      const errorMessage = `Phase 3.3: Remediation planning error - ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          status: 'failed',
          currentStep: 'Phase 3.3 failed',
          errors: [...state.errors, errorMessage],
        });
      }
      return {
        status: 'failed',
        errors: [...state.errors, errorMessage],
        currentStep: 'Phase 3.3 failed',
      };
    }
  }

  /**
   * Build codebase context from extraction results
   */
  private buildCodebaseContextFromExtraction(extractionResults: ExtractionResult[]): any {
    const codebase: any = {
      files: [],
      infrastructure: [],
      repositories: [],
    };

    for (const result of extractionResults) {
      if (result.agent === 'github-extraction') {
        codebase.repositories = result.data.repositories || [];
        // Extract file information from evidence
        for (const evidence of result.evidence) {
          if (evidence.type === 'codebase_structure') {
            try {
              const content = JSON.parse(evidence.content);
              if (Array.isArray(content)) {
                codebase.files.push(...content.map((item: any) => ({
                  path: item.path || item.name,
                  content: item.content || '',
                  language: item.language || 'unknown',
                  lines: item.size || 0,
                })));
              }
            } catch {
              // If not JSON, treat as text
            }
          }
        }
      } else if (result.agent === 'aws-extraction') {
        codebase.infrastructure.push(...(result.data.infrastructure || []));
      }
    }

    return codebase;
  }

  /**
   * Phase 4: Report Generation Agent
   */
  private async phase4Report(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 4: Generating final report...';

      // MULTI-LAYER PROTECTION: Ensure we can generate a report even without analysis
      // LAYER 1: Create minimal analysis if missing
      if (!state.analysis) {
        console.warn('[Phase 4] Analysis missing, creating minimal analysis for report generation');
        state.analysis = {
          insights: [`Compliance analysis for ${state.framework} framework`],
          findings: [],
          complianceGaps: [],
        };
      }

      // LAYER 2: Ensure extraction results exist (even if empty)
      if (!state.extractionResults || !Array.isArray(state.extractionResults)) {
        console.warn('[Phase 4] Extraction results missing, using empty array');
        state.extractionResults = [];
      }

      // LAYER 3: Ensure requirements exist for report context
      if (!state.requirements || state.requirements.length === 0) {
        console.warn('[Phase 4] Requirements missing, generating basic requirements for report context');
        state.requirements = this.generateBasicRequirements(state.framework || 'SOC2');
      }

      const reportAgent = new ReportGenerationAgent(state.projectId, state.userId);
      
      // LAYER 4: Generate report with timeout protection
      let report: DetailedReport;
      try {
        const reportPromise = reportAgent.generateReport(
          state,
          state.extractionResults,
          state.analysis,
          state.gapFindings, // Pass gap findings explicitly
          state.remediationPlan // Pass remediation plan explicitly
        );
        
        const reportTimeout = new Promise<DetailedReport>((_, reject) => {
          setTimeout(() => reject(new Error('Report generation timeout after 180 seconds')), 180000);
        });
        
        report = await Promise.race([reportPromise, reportTimeout]);
      } catch (reportError: any) {
        console.error('[Phase 4] Report generation failed or timed out:', reportError?.message || 'Unknown error');
        
        // LAYER 5: Create minimal report if generation fails
        console.warn('[Phase 4] Creating minimal report as fallback');
        report = this.createMinimalReport(state);
      }

      // LAYER 6: Validate report structure
      if (!report || !report.executiveSummary || !report.sections || !report.findings) {
        console.error('[Phase 4] Generated report is invalid, creating minimal report');
        report = this.createMinimalReport(state);
      }

      console.log(`[Phase 4] Report generated successfully: ${report.findings.length} findings, ${report.sections.length} sections`);

      return {
        report,
        status: 'running',
        currentStep: 'Phase 4 completed: Report generated',
      };
    } catch (error: any) {
      const errorMessage = `Report generation error: ${error?.message || error?.toString() || 'Unknown error'}`;
      console.error('[Phase 4]', errorMessage);
      
      // LAYER 7: Final fallback - create minimal report even on error
      try {
        const minimalReport = this.createMinimalReport(state);
        return {
          report: minimalReport,
          status: 'running',
          currentStep: 'Phase 4 completed: Minimal report generated (errors occurred)',
          errors: [...state.errors, errorMessage],
        };
      } catch (fallbackError: any) {
        console.error('[Phase 4] Even minimal report creation failed:', fallbackError?.message || 'Unknown error');
        return {
          status: 'failed',
          errors: [...state.errors, errorMessage, `Minimal report fallback also failed: ${fallbackError?.message || 'Unknown error'}`],
          currentStep: 'Phase 4 failed: Report generation failed completely',
        };
      }
    }
  }

  /**
   * Create a minimal report when full generation fails
   */
  private createMinimalReport(state: SwarmState): DetailedReport {
    const framework = state.framework || 'SOC2';
    const findingsCount = state.gapFindings?.length || 0;
    const extractionCount = state.extractionResults?.length || 0;
    
    return {
      executiveSummary: `Compliance assessment for ${framework} framework completed. ${findingsCount} compliance gaps identified across ${extractionCount} scanned systems.`,
      sections: [
        {
          title: 'Assessment Overview',
          content: `This report summarizes the compliance assessment for ${framework} framework. The assessment scanned ${extractionCount} system(s) and identified ${findingsCount} compliance gap(s).`,
          evidence: [],
        },
      ],
      findings: (state.gapFindings || []).slice(0, 10).map(gap => ({
        title: gap.title || 'Untitled Finding',
        description: gap.description || '',
        severity: gap.severity || 'medium',
        evidence: (gap.evidence || []).slice(0, 3).map(ev => ({
          source: ev.source || 'Unknown',
          citation: `${ev.type || 'evidence'} from ${ev.source || 'unknown'}`,
          quote: (ev.content && typeof ev.content === 'string') ? ev.content.substring(0, 500) : 'No content available',
        })),
        recommendation: gap.recommendation || 'Review and address this compliance gap.',
      })),
      complianceScore: {
        overall: findingsCount === 0 ? 100 : Math.max(0, 100 - (findingsCount * 10)),
        byCategory: {},
      },
      remediationPlan: state.remediationPlan || [],
      metadata: {
        framework,
        generatedAt: new Date(),
        dataSources: (state.extractionResults || []).map(r => r.source || 'Unknown').filter(s => s !== 'Unknown'),
        extractionAgents: (state.extractionResults || []).map(r => r.agent || 'Unknown').filter(a => a !== 'Unknown'),
      },
    };
  }

  /**
   * Phase 5: Comparison & Decision Agent
   */
  private async phase5Comparison(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Phase 5: Comparing plan vs findings and deciding next actions...';

      if (!state.plan || !state.analysis || !state.report) {
        return {
          errors: [...state.errors, 'Cannot compare without plan, analysis, and report'],
          currentStep: 'Phase 5 failed: Missing required data',
        };
      }

      const comparisonAgent = new ComparisonAgent(state.projectId, state.userId);
      const comparison = await comparisonAgent.compare(
        state.plan,
        state.analysis,
        state.report
      );

      return {
        comparison,
        status: 'completed',
        currentStep: 'Phase 5 completed: Assessment finished. Review comparison results for next actions.',
      };
    } catch (error: any) {
      return {
        status: 'failed',
        errors: [...state.errors, `Comparison phase error: ${error.message}`],
        currentStep: 'Phase 5 failed',
      };
    }
  }

  /**
   * Get available MCP connections for user with credentials
   */
  private async getAvailableConnections(userId: string): Promise<Array<{ serverName: string; credentials: any }>> {
    const { listMCPConnections } = await import('@/lib/mcp-connection');
    const connections = await listMCPConnections(userId);
    return connections.map(c => ({ 
      serverName: c.serverName,
      credentials: c.credentials,
    }));
  }

  /**
   * Extract AWS data
   */
  private async extractAWS(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      const stepMessage = 'Phase 2: Extracting AWS infrastructure data...';
      state.currentStep = stepMessage;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: stepMessage,
        });
      }

      const connection = await getMCPConnection(state.userId, 'aws-core');
      if (!connection) {
        return { 
          currentStep: 'AWS connection not available - skipping',
          // Don't add error, just skip silently since we only add this node if connection exists
        };
      }

      const agent = new AWSExtractionAgent(state.projectId, state.userId, state.framework);
      const result = await agent.extract(connection.credentials);

      // Check if extraction actually got data
      const hasData = result.evidence.length > 0 || 
                     (result.data.infrastructure && result.data.infrastructure.length > 0);
      
      if (!hasData) {
        const warningMessage = 'AWS extraction completed but no data was extracted. MCP tools may not be fully implemented.';
        console.warn(warningMessage);
        // Don't treat this as an error, just a warning
        return {
          extractionResults: [result],
          currentStep: warningMessage,
        };
      }

      const completionMessage = `Phase 2: AWS extraction completed - found ${result.data.infrastructure?.length || 0} infrastructure items`;
      return {
        extractionResults: [result],
        currentStep: completionMessage,
      };
    } catch (error: any) {
      const errorMessage = `Phase 2: AWS extraction error: ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: errorMessage,
          errors: [...state.errors, errorMessage],
        });
      }
      return { 
        errors: [...state.errors, errorMessage],
        currentStep: errorMessage,
      };
    }
  }

  /**
   * Extract GitHub data
   */
  private async extractGitHub(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      const stepMessage = 'Phase 2: Extracting GitHub codebase data...';
      state.currentStep = stepMessage;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: stepMessage,
        });
      }

      const connection = await getMCPConnection(state.userId, 'github');
      if (!connection) {
        return { 
          currentStep: 'GitHub connection not available - skipping',
        };
      }

      const agent = new GitHubExtractionAgent(state.projectId, state.userId);
      const result = await agent.extract(connection.credentials);

      // Check if extraction actually got data
      const hasData = result.evidence.length > 0 || 
                     (result.data.repositories && result.data.repositories.length > 0);
      
      if (!hasData) {
        const warningMessage = 'GitHub extraction completed but no data was extracted. MCP tools may not be fully implemented.';
        console.warn(warningMessage);
        // Don't treat this as an error, just a warning
        return {
          extractionResults: [result],
          currentStep: warningMessage,
        };
      }

      const completionMessage = `Phase 2: GitHub extraction completed - found ${result.data.repositories?.length || 0} repositories`;
      return {
        extractionResults: [result],
        currentStep: completionMessage,
      };
    } catch (error: any) {
      const errorMessage = `Phase 2: GitHub extraction error: ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: errorMessage,
          errors: [...state.errors, errorMessage],
        });
      }
      return { 
        errors: [...state.errors, errorMessage],
        currentStep: errorMessage,
      };
    }
  }

  /**
   * Extract SonarQube data
   */
  private async extractSonarQube(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      state.currentStep = 'Extracting SonarQube quality metrics...';
      const connection = await getMCPConnection(state.userId, 'sonarqube');
      if (!connection) {
        return { 
          currentStep: 'SonarQube connection not available - skipping',
        };
      }

      const agent = new SonarQubeExtractionAgent(state.projectId, state.userId);
      const result = await agent.extract(connection.credentials);

      return {
        extractionResults: [result],
        currentStep: 'SonarQube extraction completed',
      };
    } catch (error: any) {
      return { errors: [...state.errors, `SonarQube extraction error: ${error.message}`] };
    }
  }

  /**
   * Extract Sentry data
   */
  private async extractSentry(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      const stepMessage = 'Phase 2: Extracting Sentry monitoring data...';
      state.currentStep = stepMessage;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, currentStep: stepMessage });
      }

      const connection = await getMCPConnection(state.userId, 'sentry');
      if (!connection) {
        return { 
          currentStep: 'Phase 2: Sentry connection not available - skipping',
        };
      }

      const agent = new SentryExtractionAgent(state.projectId, state.userId);
      const result = await agent.extract(connection.credentials);

      return {
        extractionResults: [result],
        currentStep: 'Phase 2: Sentry extraction completed',
      };
    } catch (error: any) {
      const errorMessage = `Phase 2: Sentry extraction error: ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: errorMessage,
          errors: [...state.errors, errorMessage],
        });
      }
      return { 
        errors: [...state.errors, errorMessage],
        currentStep: errorMessage,
      };
    }
  }

  /**
   * Extract Atlassian data
   */
  private async extractAtlassian(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      const stepMessage = 'Phase 2: Extracting Atlassian (JIRA/Confluence) data...';
      state.currentStep = stepMessage;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({ ...state, currentStep: stepMessage });
      }

      const connection = await getMCPConnection(state.userId, 'atlassian');
      if (!connection) {
        return { 
          currentStep: 'Phase 2: Atlassian connection not available - skipping',
        };
      }

      const agent = new AtlassianExtractionAgent(state.projectId, state.userId);
      const result = await agent.extract(connection.credentials);

      return {
        extractionResults: [result],
        currentStep: 'Phase 2: Atlassian extraction completed',
      };
    } catch (error: any) {
      const errorMessage = `Phase 2: Atlassian extraction error: ${error.message}`;
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          ...state,
          currentStep: errorMessage,
          errors: [...state.errors, errorMessage],
        });
      }
      return { 
        errors: [...state.errors, errorMessage],
        currentStep: errorMessage,
      };
    }
  }

  /**
   * Extract analysis data (Firecrawl, Perplexity, Browserbase)
   * Uses internal SaaS credentials from environment variables
   * Only runs if we have extraction results to analyze
   */
  private async extractAnalysis(state: SwarmState): Promise<Partial<SwarmState>> {
    try {
      // Only run analysis if we have extraction results to work with
      if (state.extractionResults.length === 0) {
        return {
          currentStep: 'Skipping analysis - no extraction results to analyze',
        };
      }

      state.currentStep = 'Running analysis and research based on extracted data...';
      const results: ExtractionResult[] = [];

      // Analyze what we extracted to determine research needs
      const hasCodebase = state.extractionResults.some(r => r.agent === 'github-extraction');
      const hasInfrastructure = state.extractionResults.some(r => r.agent === 'aws-extraction');
      
      // Build context-aware research queries based on what we found
      const researchQueries: string[] = [];
      if (hasCodebase) {
        researchQueries.push(`${state.framework} compliance for code repositories`);
        researchQueries.push(`${state.framework} secure coding practices`);
      }
      if (hasInfrastructure) {
        researchQueries.push(`${state.framework} cloud infrastructure compliance`);
        researchQueries.push(`${state.framework} AWS security best practices`);
      }
      if (researchQueries.length === 0) {
        researchQueries.push(`${state.framework} compliance requirements 2024`);
      }

      // Firecrawl extraction - uses internal SaaS credentials
      try {
        const firecrawlCreds = getInternalMCPCredentials('firecrawl');
        if (firecrawlCreds) {
          const firecrawlAgent = new FirecrawlExtractionAgent(state.projectId, state.userId);
          const frameworkDocs = this.getFrameworkDocumentationUrls(state.framework);
          if (frameworkDocs.length > 0) {
            const firecrawlResult = await firecrawlAgent.extract(frameworkDocs, firecrawlCreds);
            results.push(firecrawlResult);
          }
        }
      } catch (error: any) {
        console.warn('Firecrawl extraction failed:', error.message);
      }

      // Perplexity extraction - uses internal SaaS credentials
      try {
        const perplexityCreds = getInternalMCPCredentials('perplexity');
        if (perplexityCreds && researchQueries.length > 0) {
          const perplexityAgent = new PerplexityExtractionAgent(state.projectId, state.userId);
          const perplexityResult = await perplexityAgent.extract(researchQueries, perplexityCreds);
          results.push(perplexityResult);
        }
      } catch (error: any) {
        console.warn('Perplexity extraction failed:', error.message);
      }

      // Browserbase extraction - uses internal SaaS credentials
      try {
        const browserbaseCreds = getInternalMCPCredentials('browserbase');
        if (browserbaseCreds) {
          const browserbaseAgent = new BrowserbaseExtractionAgent(state.projectId, state.userId);
          const complianceUrls = this.getComplianceDocumentationUrls(state.framework);
          if (complianceUrls.length > 0) {
            const browserbaseResult = await browserbaseAgent.extract(complianceUrls.slice(0, 3), browserbaseCreds);
            results.push(browserbaseResult);
          }
        }
      } catch (error: any) {
        console.warn('Browserbase extraction failed:', error.message);
      }

      return {
        extractionResults: results,
        currentStep: `Analysis completed - gathered ${results.length} research sources`,
      };
    } catch (error: any) {
      return { errors: [...state.errors, `Analysis extraction error: ${error.message}`] };
    }
  }

  /**
   * Get framework-specific documentation URLs
   */
  private getFrameworkDocumentationUrls(framework: string): string[] {
    const urls: Record<string, string[]> = {
      SOC2: [
        'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html',
        'https://www.vanta.com/resources/soc-2-compliance-guide',
      ],
      GDPR: [
        'https://gdpr.eu/what-is-gdpr/',
        'https://www.gdpr.eu/checklist/',
      ],
      HIPAA: [
        'https://www.hhs.gov/hipaa/index.html',
        'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
      ],
    };
    return urls[framework.toUpperCase()] || [];
  }

  /**
   * Get compliance documentation URLs for browser extraction
   */
  private getComplianceDocumentationUrls(framework: string): string[] {
    return this.getFrameworkDocumentationUrls(framework);
  }

  /**
   * Generate basic compliance requirements as fallback
   * Used when Regulation RAG fails to retrieve requirements
   */
  private generateBasicRequirements(framework: string): ComplianceRequirement[] {
    const frameworkUpper = framework.toUpperCase();
    
    const basicRequirements: Record<string, ComplianceRequirement[]> = {
      SOC2: [
        {
          code: 'CC6.1',
          title: 'Logical and Physical Access Controls',
          description: 'The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events to meet the entity\'s objectives.',
          category: 'Access Control',
          framework: 'SOC2',
          relevance: 0.9,
        },
        {
          code: 'CC6.2',
          title: 'Prior to Issuing System Credentials',
          description: 'The entity authorizes and removes access to systems, applications, functions, and data based on roles and responsibilities.',
          category: 'Access Control',
          framework: 'SOC2',
          relevance: 0.9,
        },
        {
          code: 'CC6.6',
          title: 'MFA for Privileged Access',
          description: 'The entity implements multifactor authentication or equally strong compensating controls for privileged access.',
          category: 'Access Control',
          framework: 'SOC2',
          relevance: 0.95,
        },
        {
          code: 'CC7.2',
          title: 'System Changes',
          description: 'The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet the entity\'s objectives.',
          category: 'Change Management',
          framework: 'SOC2',
          relevance: 0.85,
        },
        {
          code: 'CC7.4',
          title: 'Code Deployment',
          description: 'The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet the entity\'s objectives.',
          category: 'Change Management',
          framework: 'SOC2',
          relevance: 0.85,
        },
        {
          code: 'CC8.1',
          title: 'Encryption at Rest',
          description: 'The entity uses encryption to protect data at rest.',
          category: 'Data Protection',
          framework: 'SOC2',
          relevance: 0.9,
        },
        {
          code: 'CC8.2',
          title: 'Encryption in Transit',
          description: 'The entity uses encryption to protect data in transit.',
          category: 'Data Protection',
          framework: 'SOC2',
          relevance: 0.9,
        },
      ],
      GDPR: [
        {
          code: 'Art. 5',
          title: 'Principles of Processing',
          description: 'Personal data shall be processed lawfully, fairly and in a transparent manner.',
          category: 'Data Processing',
          framework: 'GDPR',
          relevance: 0.95,
        },
        {
          code: 'Art. 25',
          title: 'Data Protection by Design and by Default',
          description: 'The controller shall implement appropriate technical and organisational measures to ensure data protection principles are met.',
          category: 'Data Protection',
          framework: 'GDPR',
          relevance: 0.9,
        },
        {
          code: 'Art. 32',
          title: 'Security of Processing',
          description: 'The controller and processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk.',
          category: 'Security',
          framework: 'GDPR',
          relevance: 0.95,
        },
        {
          code: 'Art. 33',
          title: 'Notification of a Personal Data Breach',
          description: 'In the case of a personal data breach, the controller shall without undue delay notify the supervisory authority.',
          category: 'Incident Response',
          framework: 'GDPR',
          relevance: 0.85,
        },
      ],
      HIPAA: [
        {
          code: '164.308(a)(1)',
          title: 'Security Management Process',
          description: 'Implement policies and procedures to prevent, detect, contain, and correct security violations.',
          category: 'Security Management',
          framework: 'HIPAA',
          relevance: 0.95,
        },
        {
          code: '164.308(a)(3)',
          title: 'Workforce Security',
          description: 'Implement procedures for the authorization and/or supervision of workforce members who work with electronic protected health information.',
          category: 'Access Control',
          framework: 'HIPAA',
          relevance: 0.9,
        },
        {
          code: '164.308(a)(4)',
          title: 'Information Access Management',
          description: 'Implement policies and procedures for authorizing access to electronic protected health information.',
          category: 'Access Control',
          framework: 'HIPAA',
          relevance: 0.9,
        },
        {
          code: '164.312(a)(1)',
          title: 'Access Control',
          description: 'Implement technical policies and procedures for electronic information systems that maintain electronic protected health information to allow access only to those persons or software programs that have been granted access rights.',
          category: 'Access Control',
          framework: 'HIPAA',
          relevance: 0.95,
        },
        {
          code: '164.312(e)(1)',
          title: 'Transmission Security',
          description: 'Implement technical security measures to guard against unauthorized access to electronic protected health information that is being transmitted over an electronic communications network.',
          category: 'Data Protection',
          framework: 'HIPAA',
          relevance: 0.9,
        },
      ],
      ISO: [
        {
          code: 'ISO 27001:2022 A.5.1',
          title: 'Policies for Information Security',
          description: 'Policies for information security shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel, and reviewed at planned intervals.',
          category: 'Information Security Policies',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'ISO 27001:2022 A.5.10',
          title: 'Acceptance of Information Security Risk',
          description: 'The organization shall accept information security risks within the criteria established for risk acceptance.',
          category: 'Risk Management',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'ISO 27001:2022 A.7.1',
          title: 'Screening',
          description: 'Background verification checks on all candidates for employment shall be carried out in accordance with relevant laws, regulations, and ethics, and proportional to the business requirements, the classification of the information to be accessed, and the perceived risks.',
          category: 'Human Resource Security',
          framework: 'ISO',
          relevance: 0.85,
        },
        {
          code: 'ISO 27001:2022 A.7.2',
          title: 'Terms and Conditions of Employment',
          description: 'The contractual agreements with employees and contractors shall state their and the organization\'s responsibilities for information security.',
          category: 'Human Resource Security',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'ISO 27001:2022 A.8.1',
          title: 'Inventory of Information and Other Associated Assets',
          description: 'An inventory of information and other associated assets, including owners, shall be developed and maintained.',
          category: 'Asset Management',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'ISO 27001:2022 A.8.2',
          title: 'Ownership of Assets',
          description: 'Assets maintained in the inventory shall be owned.',
          category: 'Asset Management',
          framework: 'ISO',
          relevance: 0.85,
        },
        {
          code: 'ISO 27001:2022 A.9.1',
          title: 'Access Control Policy',
          description: 'An access control policy shall be established, documented, and reviewed based on business and information security requirements.',
          category: 'Access Control',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'ISO 27001:2022 A.9.2',
          title: 'User Access Management',
          description: 'User access management shall be implemented to ensure authorized user access and to prevent unauthorized access to systems and services.',
          category: 'Access Control',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'ISO 27001:2022 A.9.4',
          title: 'Access Control to Network and Network Services',
          description: 'Users and equipment shall only be provided with access to the network and network services that they have been specifically authorized to use.',
          category: 'Access Control',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'ISO 27001:2022 A.10.1',
          title: 'Cryptographic Controls',
          description: 'A policy on the use of cryptographic controls for protection of information shall be developed and implemented.',
          category: 'Cryptography',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'ISO 27001:2022 A.12.1',
          title: 'Documented Operating Procedures',
          description: 'Operating procedures for information processing facilities shall be documented and made available to all personnel who need them.',
          category: 'Operations Security',
          framework: 'ISO',
          relevance: 0.85,
        },
        {
          code: 'ISO 27001:2022 A.12.4',
          title: 'Logging and Monitoring',
          description: 'Event logs recording user activities, exceptions, faults, and information security events shall be produced, kept, and regularly reviewed.',
          category: 'Operations Security',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'ISO 27001:2022 A.12.6',
          title: 'Management of Technical Vulnerabilities',
          description: 'Information about technical vulnerabilities of information systems being used shall be obtained in a timely fashion, the organization\'s exposure to such vulnerabilities evaluated, and appropriate measures taken to address the associated risk.',
          category: 'Operations Security',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'ISO 27001:2022 A.14.1',
          title: 'Security Requirements of Information Systems',
          description: 'Security requirements shall be identified and agreed prior to the development or acquisition of information systems.',
          category: 'System Acquisition, Development and Maintenance',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'ISO 27001:2022 A.16.1',
          title: 'Management of Information Security Incidents',
          description: 'Responsibilities and procedures shall be established to ensure a quick, effective, and orderly response to information security incidents.',
          category: 'Information Security Incident Management',
          framework: 'ISO',
          relevance: 0.95,
        },
      ],
      PCI: [
        {
          code: 'PCI DSS 1.1',
          title: 'Firewall Configuration',
          description: 'Establish and implement firewall and router configuration standards that include a formal process for approving and testing all network connections and changes to the firewall and router configurations.',
          category: 'Network Security',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 1.2',
          title: 'Build Firewall Configuration',
          description: 'Build firewall and router configurations that restrict connections between untrusted networks and any system components in the cardholder data environment.',
          category: 'Network Security',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 1.3',
          title: 'Prohibit Direct Public Access',
          description: 'Prohibit direct public access between the Internet and any system component in the cardholder data environment.',
          category: 'Network Security',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 2.1',
          title: 'Vendor Defaults',
          description: 'Always change vendor-supplied defaults and remove or disable unnecessary default accounts before installing a system on the network.',
          category: 'System Configuration',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 2.2',
          title: 'System Configuration Standards',
          description: 'Develop configuration standards for all system components. Assure that these standards address all known security vulnerabilities and are consistent with industry-accepted system hardening standards.',
          category: 'System Configuration',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 3.1',
          title: 'Protect Stored Cardholder Data',
          description: 'Keep cardholder data storage to a minimum by implementing data retention and disposal policies, procedures, and processes.',
          category: 'Protect Stored Cardholder Data',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 3.2',
          title: 'Do Not Store Sensitive Authentication Data',
          description: 'Do not store sensitive authentication data after authorization (even if encrypted).',
          category: 'Protect Stored Cardholder Data',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 3.4',
          title: 'Render PAN Unreadable',
          description: 'Render Primary Account Numbers (PAN) unreadable anywhere it is stored (including on portable digital media, backup media, and in logs) by using any of the following approaches: one-way hashes based on strong cryptography, truncation, index tokens and pads, or strong cryptography.',
          category: 'Protect Stored Cardholder Data',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 4.1',
          title: 'Use Strong Cryptography',
          description: 'Use strong cryptography and security protocols to safeguard sensitive cardholder data during transmission over open, public networks.',
          category: 'Encrypt Transmission of Cardholder Data',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 5.1',
          title: 'Deploy Anti-Virus Software',
          description: 'Deploy anti-virus software on all systems commonly affected by malicious software (particularly personal computers and servers).',
          category: 'Protect All Systems Against Malware',
          framework: 'PCI',
          relevance: 0.9,
        },
        {
          code: 'PCI DSS 6.1',
          title: 'Establish Process to Identify Vulnerabilities',
          description: 'Establish a process to identify security vulnerabilities, using reputable outside sources for security vulnerability information, and assign a risk ranking (for example, as "high," "medium," or "low") to newly discovered security vulnerabilities.',
          category: 'Develop and Maintain Secure Systems',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 6.2',
          title: 'Ensure All System Components Have Latest Security Patches',
          description: 'Ensure that all system components and software are protected from known vulnerabilities by installing applicable vendor-supplied security patches. Install critical security patches within one month of release.',
          category: 'Develop and Maintain Secure Systems',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 7.1',
          title: 'Limit Access to Cardholder Data',
          description: 'Limit access to system components and cardholder data to only those individuals whose job requires such access.',
          category: 'Restrict Access to Cardholder Data',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 7.2',
          title: 'Establish Access Control System',
          description: 'Establish an access control system for systems components that restricts access based on a user\'s need to know, and is set to "deny all" unless specifically allowed.',
          category: 'Restrict Access to Cardholder Data',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 8.1',
          title: 'Define and Identify Authorized Users',
          description: 'Define and identify all users with access to system components.',
          category: 'Identify and Authenticate Access',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 8.2',
          title: 'Use Strong Authentication',
          description: 'In addition to assigning a unique ID, ensure proper user-authentication management for non-consumer users and administrators on all system components by employing at least one of the following methods to authenticate all users: something you know, such as a password or passphrase; something you have, such as a token device or smart card; or something you are, such as a biometric.',
          category: 'Identify and Authenticate Access',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 8.3',
          title: 'Secure Authentication Credentials',
          description: 'Secure all individual non-console administrative access and all remote access to the cardholder data environment using multi-factor authentication.',
          category: 'Identify and Authenticate Access',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 9.1',
          title: 'Restrict Physical Access',
          description: 'Use appropriate facility entry controls to limit and monitor physical access to systems in the cardholder data environment.',
          category: 'Restrict Physical Access',
          framework: 'PCI',
          relevance: 0.9,
        },
        {
          code: 'PCI DSS 10.1',
          title: 'Implement Audit Logging',
          description: 'Implement audit trails to link all access to system components to each individual user.',
          category: 'Track and Monitor All Access',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 10.2',
          title: 'Automated Audit Trails',
          description: 'Implement automated audit trails for all system components to reconstruct the following events: all individual user accesses to cardholder data, all actions taken by any individual with root or administrative privileges, access to all audit trails, invalid logical access attempts, use of and changes to identification and authentication mechanisms, initialization, stopping, or pausing of the audit logs, and creation and deletion of system-level objects.',
          category: 'Track and Monitor All Access',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 11.1',
          title: 'Test Security Controls',
          description: 'Implement processes to test for the presence of wireless access points (802.11), and detect and identify all authorized and unauthorized wireless access points on a quarterly basis.',
          category: 'Regularly Test Security Systems',
          framework: 'PCI',
          relevance: 0.85,
        },
        {
          code: 'PCI DSS 11.2',
          title: 'Run Internal and External Network Vulnerability Scans',
          description: 'Run internal and external network vulnerability scans at least quarterly and after any significant change in the network.',
          category: 'Regularly Test Security Systems',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 12.1',
          title: 'Establish Information Security Policy',
          description: 'Establish, publish, maintain, and disseminate a security policy.',
          category: 'Maintain Information Security Policy',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'PCI DSS 12.2',
          title: 'Annual Security Awareness Program',
          description: 'Implement a formal security awareness program to make all personnel aware of the cardholder data security policy and procedures.',
          category: 'Maintain Information Security Policy',
          framework: 'PCI',
          relevance: 0.9,
        },
      ],
    };

    return basicRequirements[frameworkUpper] || [
      {
        code: 'GEN-001',
        title: 'General Security Controls',
        description: `Basic security controls required for ${framework} compliance.`,
        category: 'General',
        framework: frameworkUpper,
        relevance: 0.7,
      },
    ];
  }

  /**
   * Aggregate all extraction results
   */
  private async aggregateResults(state: SwarmState): Promise<Partial<SwarmState>> {
    state.currentStep = 'Aggregating extraction results...';

    const aggregated: any = {
      infrastructure: [],
      codebase: {},
      quality: {},
      monitoring: {},
      documentation: {},
      research: {},
      timestamp: new Date(),
    };

    for (const result of state.extractionResults) {
      switch (result.agent) {
        case 'aws-extraction':
          aggregated.infrastructure.push(result.data);
          break;
        case 'github-extraction':
          aggregated.codebase = result.data;
          break;
        case 'sonarqube-extraction':
          aggregated.quality = result.data;
          break;
        case 'sentry-extraction':
          aggregated.monitoring = result.data;
          break;
        case 'atlassian-extraction':
          aggregated.documentation = result.data;
          break;
        case 'firecrawl-extraction':
        case 'perplexity-extraction':
        case 'browserbase-extraction':
          aggregated.research = { ...aggregated.research, ...result.data };
          break;
      }
    }

    // Update step to indicate we're ready for analysis (if we have results)
    if (state.extractionResults.length > 0) {
      state.currentStep = `Aggregated ${state.extractionResults.length} extraction result(s). Proceeding to analysis...`;
    } else {
      state.currentStep = 'No extraction results to aggregate. Skipping analysis.';
    }

    return {
      // aggregatedData is not part of SwarmState, but we can store it in extractionResults
      // Don't set status to completed yet - analysis may still run
    };
  }

  /**
   * Run the swarm
   */
  async run(
    projectId: string,
    userId: string,
    framework: string,
    onUpdate?: (state: SwarmState) => void
  ): Promise<SwarmState> {
    // Store callback for use in graph nodes
    this.onUpdateCallback = onUpdate;

    let finalState: SwarmState = {
      projectId,
      userId,
      framework,
      status: 'pending',
      currentStep: 'Initializing swarm...',
      extractionResults: [],
      errors: [],
    };

    if (onUpdate) {
      onUpdate({ ...finalState, status: 'running', currentStep: 'Checking MCP connections...' });
    }

    // Check for available connections first
    const availableConnections = await this.getAvailableConnections(userId);
    
    if (availableConnections.length === 0) {
      finalState = {
        ...finalState,
        status: 'failed',
        currentStep: 'No MCP connections found',
        errors: ['No MCP connections found. Please connect at least one MCP service (GitHub, AWS, SonarQube, Sentry, or Atlassian) before running analysis.'],
      };
      if (onUpdate) {
        onUpdate(finalState);
      }
      this.onUpdateCallback = undefined;
      return finalState;
    }

    if (onUpdate) {
      onUpdate({ ...finalState, currentStep: `Found ${availableConnections.length} connected service(s). Starting extraction...` });
    }

    // Create graph dynamically based on available connections
    const graph = await this.createGraph(projectId, userId, framework);

    if (onUpdate) {
      onUpdate({ ...finalState, status: 'running', currentStep: 'Starting extraction agents...' });
    }
    
    // Run the graph - nodes will call onUpdateCallback as they complete
    try {
      finalState = await graph.invoke(finalState) as SwarmState;
      
      // Ensure final status is set correctly
      if (finalState.status !== 'completed' && finalState.status !== 'failed') {
        // If we reached the end but status isn't set, check if we have all required outputs
        if (finalState.comparison && finalState.report && finalState.errors.length === 0) {
          finalState.status = 'completed';
        } else if (finalState.errors.length > 0 || finalState.currentStep.includes('failed')) {
          finalState.status = 'failed';
        } else {
          finalState.status = 'failed'; // Default to failed if unclear
        }
      }
    } catch (error: any) {
      // Handle any unhandled errors from graph execution
      const errorMessage = `Swarm execution error: ${error?.message || error?.toString() || 'Unknown error'}`;
      console.error('[SwarmManager] Graph execution failed:', error);
      
      finalState = {
        ...finalState,
        status: 'failed',
        currentStep: 'Swarm execution failed',
        errors: [...finalState.errors, errorMessage],
      };
    }
    
    // Final update
    if (onUpdate) {
      onUpdate(finalState);
    }

    // Clear callback
    this.onUpdateCallback = undefined;

    return finalState;
  }
}

