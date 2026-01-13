/**
 * Planning Agent
 * Phase 1: Initialization & Planning based on compliance framework
 */

import OpenAI from 'openai';
import { AgentMemory } from '@/lib/memory';
// Temperature always set to 1 globally
import { CYBERSECURITY_SYSTEM_PROMPTS, OPTIMIZED_PROMPTS } from '@/lib/prompts/cybersecurity-prompts';

export interface AssessmentPlan {
  framework: string;
  objectives: string[];
  focusAreas: Array<{
    category: string;
    requirements: string[];
    priority: 'high' | 'medium' | 'low';
  }>;
  extractionStrategy: {
    dataSources: string[];
    keyMetrics: string[];
    evidenceTypes: string[];
  };
  timeline: {
    phase: string;
    estimatedDuration: string;
    deliverables: string[];
  }[];
  successCriteria: string[];
}

export class PlanningAgent {
  private openai: OpenAI;
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.memory = new AgentMemory('planning-agent', projectId, sessionId);
  }

  /**
   * Generate assessment plan based on compliance framework
   */
  async createPlan(framework: string, availableConnections: string[]): Promise<AssessmentPlan> {
    const prompt = OPTIMIZED_PROMPTS.createAssessmentPlan(framework, availableConnections);

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.planning,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const plan: AssessmentPlan = JSON.parse(response.choices[0]?.message?.content || '{}');

      // Store plan in memory
      await this.memory.remember(
        `Assessment plan created for ${framework} with ${plan.focusAreas.length} focus areas`,
        'planning',
        {
          framework,
          focusAreas: plan.focusAreas.length,
          objectives: plan.objectives.length,
        }
      );

      return plan;
    } catch (error: any) {
      console.error('Planning agent error:', error);
      // Return default plan
      return this.getDefaultPlan(framework, availableConnections);
    }
  }

  /**
   * Get default plan if LLM fails
   */
  private getDefaultPlan(framework: string, availableConnections: string[]): AssessmentPlan {
    const frameworkPlans: Record<string, Partial<AssessmentPlan>> = {
      SOC2: {
        focusAreas: [
          { category: 'Access Control', requirements: ['CC6.1', 'CC6.2', 'CC6.3'], priority: 'high' },
          { category: 'Data Protection', requirements: ['CC6.6', 'CC6.7'], priority: 'high' },
          { category: 'Monitoring', requirements: ['CC7.2', 'CC7.3'], priority: 'medium' },
        ],
        objectives: [
          'Assess access control mechanisms',
          'Evaluate data protection measures',
          'Review monitoring and logging capabilities',
        ],
      },
      GDPR: {
        focusAreas: [
          { category: 'Data Privacy', requirements: ['Article 5', 'Article 6'], priority: 'high' },
          { category: 'Data Subject Rights', requirements: ['Article 15-22'], priority: 'high' },
          { category: 'Security', requirements: ['Article 32'], priority: 'high' },
        ],
        objectives: [
          'Assess data privacy controls',
          'Evaluate data subject rights implementation',
          'Review security measures',
        ],
      },
      HIPAA: {
        focusAreas: [
          { category: 'Administrative Safeguards', requirements: ['§164.308'], priority: 'high' },
          { category: 'Physical Safeguards', requirements: ['§164.310'], priority: 'medium' },
          { category: 'Technical Safeguards', requirements: ['§164.312'], priority: 'high' },
        ],
        objectives: [
          'Assess administrative safeguards',
          'Evaluate physical safeguards',
          'Review technical safeguards',
        ],
      },
      ISO: {
        focusAreas: [
          { category: 'Information Security Policies', requirements: ['A.5.1'], priority: 'high' },
          { category: 'Access Control', requirements: ['A.9.1', 'A.9.2'], priority: 'high' },
          { category: 'Cryptography', requirements: ['A.10.1'], priority: 'high' },
          { category: 'Operations Security', requirements: ['A.12.4', 'A.12.6'], priority: 'high' },
        ],
        objectives: [
          'Assess information security policies',
          'Evaluate access control mechanisms',
          'Review cryptographic controls',
          'Assess operations security and monitoring',
        ],
      },
      PCI: {
        focusAreas: [
          { category: 'Network Security', requirements: ['1.1', '1.2', '1.3'], priority: 'high' },
          { category: 'Protect Stored Cardholder Data', requirements: ['3.1', '3.2', '3.4'], priority: 'high' },
          { category: 'Encrypt Transmission', requirements: ['4.1'], priority: 'high' },
          { category: 'Restrict Access', requirements: ['7.1', '7.2', '8.1', '8.2', '8.3'], priority: 'high' },
          { category: 'Track and Monitor', requirements: ['10.1', '10.2'], priority: 'high' },
        ],
        objectives: [
          'Assess network security controls',
          'Evaluate cardholder data protection',
          'Review access control mechanisms',
          'Assess monitoring and logging capabilities',
        ],
      },
    };

    const basePlan = frameworkPlans[framework] || frameworkPlans.SOC2;

    return {
      framework,
      objectives: basePlan.objectives || [],
      focusAreas: basePlan.focusAreas || [],
      extractionStrategy: {
        dataSources: availableConnections,
        keyMetrics: ['compliance_score', 'findings_count', 'evidence_coverage'],
        evidenceTypes: ['code', 'config', 'documentation', 'logs'],
      },
      timeline: [
        {
          phase: 'Extraction',
          estimatedDuration: '30 minutes',
          deliverables: ['Extracted data from all sources'],
        },
        {
          phase: 'Analysis',
          estimatedDuration: '20 minutes',
          deliverables: ['Compliance findings', 'Evidence collection'],
        },
        {
          phase: 'Report Generation',
          estimatedDuration: '10 minutes',
          deliverables: ['Final assessment report'],
        },
      ],
      successCriteria: [
        'All focus areas assessed',
        'Evidence collected for each finding',
        'Report generated with actionable recommendations',
      ],
    };
  }
}

