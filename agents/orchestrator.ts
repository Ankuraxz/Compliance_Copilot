/**
 * Multi-Agent Orchestrator
 * Coordinates the 5 agents using LangGraph
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { IntakeAgent } from './intake-agent';
import { RegulationRAGAgent } from './regulation-rag-agent';
import { GapAnalysisAgent } from './gap-analysis-agent';
import { ActionPlannerAgent } from './action-planner-agent';
import { ReportingAgent } from './reporting-agent';
import { AgentState } from './types';
import { AgentMemory } from '@/lib/memory';

export class ComplianceOrchestrator {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId?: string) {
    this.memory = new AgentMemory('orchestrator', projectId, sessionId);
  }

  /**
   * Create the main orchestration graph
   */
  createGraph(projectId: string, framework: string, repoUrl?: string) {
    const workflow = new StateGraph<AgentState>({
      channels: {
        projectId: { reducer: (x: string) => x },
        framework: { reducer: (x: string) => x },
        status: { reducer: (x: string) => x },
        currentStep: { reducer: (x: string) => x },
        data: { reducer: (x: any, y: any) => ({ ...x, ...y }) },
        errors: { reducer: (x: string[], y: string[]) => [...(x || []), ...(y || [])] },
        toolCalls: { reducer: (x: any[], y: any[]) => [...(x || []), ...(y || [])] },
      },
    });

    // Initialize agents
    const intakeAgent = new IntakeAgent(projectId, repoUrl);
    const regulationAgent = new RegulationRAGAgent();
    const gapAgent = new GapAnalysisAgent();
    const plannerAgent = new ActionPlannerAgent();
    const reportingAgent = new ReportingAgent();

    // Add nodes with memory integration
    workflow.addNode('intake', async (state: AgentState) => {
      // Recall relevant memories
      const context = await this.memory.getContext(
        `Intake agent for ${framework} compliance assessment`,
        3
      );

      const graph = intakeAgent.createGraph();
      const result = await graph.invoke({
        ...state,
        projectId,
        framework,
        status: 'pending',
        currentStep: '',
        data: {},
        errors: [],
        toolCalls: [],
      });

      // Remember state after intake
      await this.memory.rememberState(result, 'intake');
      return result;
    });

    workflow.addNode('regulation_rag', async (state: AgentState) => {
      const context = await this.memory.getContext(
        `Regulation RAG for ${framework} requirements`,
        3
      );

      const graph = regulationAgent.createGraph();
      const result = await graph.invoke(state);
      
      await this.memory.rememberState(result, 'regulation_rag');
      return result;
    });

    workflow.addNode('gap_analysis', async (state: AgentState) => {
      const context = await this.memory.getContext(
        `Gap analysis for ${framework} compliance`,
        5
      );

      const graph = gapAgent.createGraph();
      const result = await graph.invoke(state);
      
      // Remember findings
      if (result.data?.gaps) {
        for (const gap of result.data.gaps) {
          await this.memory.rememberFinding(gap);
        }
      }
      
      await this.memory.rememberState(result, 'gap_analysis');
      return result;
    });

    workflow.addNode('action_planner', async (state: AgentState) => {
      const context = await this.memory.getContext(
        `Action planning for ${framework} remediation`,
        3
      );

      const graph = plannerAgent.createGraph();
      const result = await graph.invoke(state);
      
      await this.memory.rememberState(result, 'action_planner');
      return result;
    });

    workflow.addNode('reporting', async (state: AgentState) => {
      const graph = reportingAgent.createGraph();
      const result = await graph.invoke(state);
      
      // Remember final assessment
      if (result.data?.report) {
        await this.memory.remember(
          `Compliance assessment completed for ${framework}. Score: ${result.data.report.overallScore}`,
          'assessment_complete'
        );
      }
      
      await this.memory.rememberState(result, 'reporting');
      return result;
    });

    // Define flow
    workflow.addEdge(START, 'intake');
    workflow.addEdge('intake', 'regulation_rag');
    workflow.addEdge('regulation_rag', 'gap_analysis');
    workflow.addEdge('gap_analysis', 'action_planner');
    workflow.addEdge('action_planner', 'reporting');
    workflow.addEdge('reporting', END);

    return workflow.compile();
  }

  /**
   * Run the complete compliance assessment
   */
  async runAssessment(
    projectId: string,
    framework: string,
    repoUrl?: string,
    onUpdate?: (state: AgentState) => void
  ): Promise<AgentState> {
    // Remember assessment start
    await this.memory.remember(
      `Starting ${framework} compliance assessment for project ${projectId}`,
      'assessment_start',
      { repoUrl }
    );

    const graph = this.createGraph(projectId, framework, repoUrl);

    let finalState: AgentState = {
      projectId,
      framework,
      status: 'pending',
      currentStep: 'Initializing...',
      data: {},
      errors: [],
      toolCalls: [],
    };

    // Stream updates if callback provided
    if (onUpdate) {
      const stream = graph.stream(finalState);
      for await (const update of stream) {
        const nodeUpdate = Object.values(update)[0];
        finalState = { ...finalState, ...nodeUpdate };
        onUpdate(finalState);
      }
    } else {
      finalState = await graph.invoke(finalState);
    }

    return finalState;
  }
}

