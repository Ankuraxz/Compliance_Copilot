/**
 * Agent Memory Integration
 * Wraps MEM0-Redis for use in agent workflows
 */

import { Mem0Redis, Memory, MemorySearchResult } from './mem0-redis';
import { AgentState } from '@/agents/types';

export class AgentMemory {
  private mem0: Mem0Redis;
  private agentName: string;
  private projectId?: string;
  private sessionId?: string;

  constructor(
    agentName: string,
    projectId?: string,
    sessionId?: string,
    redisUrl?: string
  ) {
    this.mem0 = new Mem0Redis(redisUrl);
    this.agentName = agentName;
    this.projectId = projectId;
    this.sessionId = sessionId;
  }

  /**
   * Remember agent state and decisions
   * Gracefully handles Redis failures - returns empty string if memory fails
   */
  async remember(
    content: string | Array<{ role: string; content: string }>,
    category?: string,
    additionalMetadata?: Record<string, any>
  ): Promise<string> {
    try {
      return await this.mem0.add(content, {
        agent: this.agentName,
        projectId: this.projectId,
        sessionId: this.sessionId,
        category,
        ...additionalMetadata,
      });
    } catch (error: any) {
      // Memory is optional - don't break agent workflow if Redis fails
      console.warn(`Memory operation failed for agent ${this.agentName}:`, error.message);
      return '';
    }
  }

  /**
   * Recall relevant memories for current context
   * Gracefully handles Redis failures - returns empty array if memory fails
   */
  async recall(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      category?: string;
    } = {}
  ): Promise<MemorySearchResult[]> {
    try {
      return await this.mem0.search(query, {
        agent: this.agentName,
        projectId: this.projectId,
        ...options,
      });
    } catch (error: any) {
      // Memory is optional - don't break agent workflow if Redis fails
      console.warn(`Memory search failed for agent ${this.agentName}:`, error.message);
      return [];
    }
  }

  /**
   * Get context from memories for agent state
   */
  async getContext(query: string, maxMemories: number = 5): Promise<string> {
    const memories = await this.recall(query, {
      limit: maxMemories,
      threshold: 0.7,
    });

    if (memories.length === 0) {
      return '';
    }

    const contextParts = memories.map(
      (result, index) =>
        `[Memory ${index + 1} (relevance: ${(result.similarity * 100).toFixed(1)}%)]\n${result.memory.content}`
    );

    return `Previous Context:\n${contextParts.join('\n\n')}`;
  }

  /**
   * Remember agent execution state
   * Gracefully handles Redis failures
   */
  async rememberState(state: AgentState, step: string): Promise<void> {
    try {
      const stateSummary = this.summarizeState(state, step);
      await this.remember(stateSummary, 'agent_state', {
        step,
        framework: state.framework,
        status: state.status,
      });
    } catch (error: any) {
      // Memory is optional - don't break agent workflow
      console.warn(`Memory state save failed for agent ${this.agentName}:`, error.message);
    }
  }

  /**
   * Summarize agent state for memory
   */
  private summarizeState(state: AgentState, step: string): string {
    const summary = [
      `Agent: ${state.currentStep || step}`,
      `Framework: ${state.framework}`,
      `Status: ${state.status}`,
    ];

    if (state.data.gaps && state.data.gaps.length > 0) {
      summary.push(
        `Findings: ${state.data.gaps.length} gaps identified`,
        `Critical: ${state.data.gaps.filter((g) => g.severity === 'critical').length}`
      );
    }

    if (state.errors.length > 0) {
      summary.push(`Errors: ${state.errors.length} errors encountered`);
    }

    return summary.join('\n');
  }

  /**
   * Remember tool calls for debugging and learning
   * Gracefully handles Redis failures
   */
  async rememberToolCall(
    toolName: string,
    parameters: any,
    result: any,
    success: boolean
  ): Promise<void> {
    try {
      const toolCallSummary = `Tool: ${toolName}\nParameters: ${JSON.stringify(parameters)}\nResult: ${success ? 'Success' : 'Failed'}\n${success ? JSON.stringify(result).substring(0, 500) : 'Error occurred'}`;

      await this.remember(toolCallSummary, 'tool_call', {
        tool: toolName,
        success,
      });
    } catch (error: any) {
      // Memory is optional - don't break agent workflow
      console.warn(`Memory tool call save failed for agent ${this.agentName}:`, error.message);
    }
  }

  /**
   * Remember compliance findings for future reference
   * Gracefully handles Redis failures
   */
  async rememberFinding(
    finding: {
      title: string;
      description: string;
      severity: string;
      requirementCode: string;
    }
  ): Promise<void> {
    try {
      const findingSummary = `Finding: ${finding.title}\nSeverity: ${finding.severity}\nRequirement: ${finding.requirementCode}\nDescription: ${finding.description}`;

      await this.remember(findingSummary, 'finding', {
        severity: finding.severity,
        requirementCode: finding.requirementCode,
      });
    } catch (error: any) {
      // Memory is optional - don't break agent workflow
      console.warn(`Memory finding save failed for agent ${this.agentName}:`, error.message);
    }
  }

  /**
   * Get all memories for this agent
   * Gracefully handles Redis failures - returns empty array if memory fails
   */
  async getAllMemories(limit: number = 100): Promise<Memory[]> {
    try {
      return await this.mem0.getAll({
        agent: this.agentName,
        projectId: this.projectId,
        limit,
      });
    } catch (error: any) {
      console.warn(`Memory getAll failed for agent ${this.agentName}:`, error.message);
      return [];
    }
  }

  /**
   * Clear all memories for this agent
   * Gracefully handles Redis failures
   */
  async clearMemories(): Promise<number> {
    try {
      return await this.mem0.deleteAll({
        agent: this.agentName,
        projectId: this.projectId,
      });
    } catch (error: any) {
      console.warn(`Memory clear failed for agent ${this.agentName}:`, error.message);
      return 0;
    }
  }
}

