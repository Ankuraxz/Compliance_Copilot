/**
 * Action Planner Agent
 * Creates remediation tasks and roadmap
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState, RemediationTask } from './types';
import OpenAI from 'openai';
import { CYBERSECURITY_SYSTEM_PROMPTS, OPTIMIZED_PROMPTS } from '@/lib/prompts/cybersecurity-prompts';

export class ActionPlannerAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Create the action planner agent graph
   */
  createGraph() {
    const workflow = new StateGraph<AgentState>({
      channels: {
        projectId: { reducer: (x: string) => x },
        framework: { reducer: (x: string) => x },
        status: { reducer: (x: 'pending' | 'running' | 'completed' | 'failed', y?: 'pending' | 'running' | 'completed' | 'failed') => (y || x) as 'pending' | 'running' | 'completed' | 'failed' },
        currentStep: { reducer: (x: string) => x },
        data: { reducer: (x: any) => x },
        errors: { reducer: (x: string[], y: string[]) => [...(x || []), ...(y || [])] },
        toolCalls: { reducer: (x: any[], y: any[]) => [...(x || []), ...(y || [])] },
      },
    });

    workflow.addNode('plan_remediation', this.planRemediation.bind(this));
    workflow.addNode('prioritize_tasks', this.prioritizeTasks.bind(this));
    workflow.addNode('estimate_effort', this.estimateEffort.bind(this));

    // Set entry point - same pattern as gap-analysis-agent
    workflow.setEntryPoint('plan_remediation');
    
    // Add edges
    workflow.addEdge('plan_remediation', 'prioritize_tasks');
    workflow.addEdge('prioritize_tasks', 'estimate_effort');
    workflow.addEdge('estimate_effort', END);

    return workflow.compile();
  }

  /**
   * Plan remediation tasks for each gap
   */
  private async planRemediation(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Planning remediation tasks...';

      const gaps = state.data.gaps || [];
      const tasks: RemediationTask[] = [];

      for (const gap of gaps) {
        const task = await this.createRemediationTask(gap);
        if (task) {
          tasks.push(task);
        }
      }

      return {
        data: {
          ...state.data,
          remediationPlan: tasks,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Remediation planning error: ${error.message}`],
      };
    }
  }

  /**
   * Prioritize tasks
   */
  private async prioritizeTasks(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Prioritizing remediation tasks...';

      const tasks = state.data.remediationPlan || [];
      
      // Sort by priority (critical > high > medium > low)
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      tasks.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

      return {
        data: {
          ...state.data,
          remediationPlan: tasks,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Prioritization error: ${error.message}`],
      };
    }
  }

  /**
   * Estimate effort for each task
   */
  private async estimateEffort(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Estimating effort...';

      const tasks = state.data.remediationPlan || [];

      for (const task of tasks) {
        task.estimatedEffort = await this.estimateTaskEffort(task);
      }

      return {
        data: {
          ...state.data,
          remediationPlan: tasks,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Effort estimation error: ${error.message}`],
      };
    }
  }

  private async createRemediationTask(gap: any): Promise<RemediationTask | null> {
    const prompt = OPTIMIZED_PROMPTS.createRemediation(
      `${gap.title}: ${gap.description} (Severity: ${gap.severity}, Recommendation: ${gap.recommendation})`,
      gap.requirementCode
    );

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.remediation,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const taskData = JSON.parse(response.choices[0]?.message?.content || '{}');

      if (taskData.title) {
        return {
          findingId: gap.id,
          title: taskData.title,
          description: taskData.description || gap.recommendation,
          priority: gap.severity,
          steps: taskData.steps || [],
          estimatedEffort: '',
        };
      }
    } catch (error) {
      console.error('Task creation error:', error);
    }

    return null;
  }

  private async estimateTaskEffort(task: RemediationTask): Promise<string> {
    const prompt = `Estimate the effort required for this remediation task:

Title: ${task.title}
Description: ${task.description}
Steps: ${task.steps.join(', ')}
Priority: ${task.priority}

Return a time estimate like "2-4 hours", "1-2 days", "1 week", etc.`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a project manager estimating task effort.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 1,
      });

      return response.choices[0]?.message?.content?.trim() || 'TBD';
    } catch (error) {
      return 'TBD';
    }
  }
}

