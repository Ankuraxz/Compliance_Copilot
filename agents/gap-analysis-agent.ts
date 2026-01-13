/**
 * Gap Analysis Agent
 * Compares codebase/documentation against compliance requirements
 */

import { StateGraph, END } from '@langchain/langgraph';
import { AgentState, GapFinding, Evidence } from './types';
import OpenAI from 'openai';
import { PerplexityClient } from '@/lib/api-clients/perplexity';
import { FirecrawlClient } from '@/lib/api-clients/firecrawl';
// Temperature always set to 1 globally
import { CYBERSECURITY_SYSTEM_PROMPTS, OPTIMIZED_PROMPTS } from '@/lib/prompts/cybersecurity-prompts';

export class GapAnalysisAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Create the gap analysis agent graph
   */
  createGraph() {
    const workflow = new StateGraph<AgentState>({
      channels: {
        projectId: { reducer: (x: string) => x },
        framework: { reducer: (x: string) => x },
        status: { reducer: (x: string) => x },
        currentStep: { reducer: (x: string) => x },
        data: { reducer: (x: any) => x },
        errors: { reducer: (x: string[], y: string[]) => [...x, ...y] },
        toolCalls: { reducer: (x: any[], y: any[]) => [...x, ...y] },
      },
    });

    workflow.addNode('analyze_gaps', this.analyzeGaps.bind(this));
    workflow.addNode('collect_evidence', this.collectEvidence.bind(this));
    workflow.addNode('categorize_findings', this.categorizeFindings.bind(this));

    // Set entry point
    workflow.setEntryPoint('analyze_gaps');
    
    workflow.addEdge('analyze_gaps', 'collect_evidence');
    workflow.addEdge('collect_evidence', 'categorize_findings');
    workflow.addEdge('categorize_findings', END);

    return workflow.compile();
  }

  /**
   * Analyze gaps between requirements and reality
   * Uses MCP scan results and extraction data for comprehensive gap analysis
   */
  private async analyzeGaps(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Analyzing compliance gaps...';

      const requirements = state.data.requirements || [];
      const codebase = state.data.codebase;
      const complianceScans = state.data.complianceScans || [];
      const mcpFindings = state.data.mcpFindings || [];
      const gaps: GapFinding[] = [];

      // First, convert MCP scan results to gap findings (these are already identified issues)
      for (const scan of complianceScans) {
        if (scan.status === 'non-compliant' || scan.status === 'partial') {
          for (const evidence of scan.evidence || []) {
            gaps.push({
              id: `gap-${scan.requirement}-${Date.now()}-${Math.random()}`,
              requirementCode: scan.requirement,
              severity: evidence.severity || 'medium',
              title: `${scan.requirement}: ${evidence.finding}`,
              description: evidence.finding,
              evidence: [{
                type: evidence.type,
                source: evidence.source,
                filePath: evidence.location,
                lineNumber: evidence.lineNumber,
                content: evidence.content,
              }],
              recommendation: scan.recommendation || '',
            });
          }
        }
      }

      // Also add findings from intelligent extraction
      for (const finding of mcpFindings) {
        if (finding.status === 'non-compliant' || finding.status === 'partial') {
          for (const evidence of finding.evidence || []) {
            gaps.push({
              id: `gap-${finding.requirement}-${Date.now()}-${Math.random()}`,
              requirementCode: finding.requirement,
              severity: evidence.severity || 'medium',
              title: `${finding.requirement}: ${evidence.finding}`,
              description: evidence.finding,
              evidence: [{
                type: evidence.type,
                source: evidence.source,
                filePath: evidence.location,
                lineNumber: evidence.lineNumber,
                content: evidence.content,
              }],
              recommendation: finding.recommendation || '',
            });
          }
        }
      }

      // Then analyze requirements that weren't covered by MCP scans
      const coveredRequirements = new Set(gaps.map(g => g.requirementCode));
      const uncoveredRequirements = requirements.filter((req: any) => {
        const reqCode = typeof req === 'string' ? req : req.code || req.requirementCode;
        return !coveredRequirements.has(reqCode);
      });

      // Analyze uncovered requirements using codebase analysis
      for (const requirement of uncoveredRequirements.slice(0, 10)) {
        const gap = await this.analyzeRequirement(requirement, codebase);
        if (gap) {
          gaps.push(gap);
        }
      }

      return {
        data: {
          ...state.data,
          gaps,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Gap analysis error: ${error.message}`],
      };
    }
  }

  /**
   * Collect evidence for each gap
   */
  private async collectEvidence(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Collecting evidence for findings...';

      const gaps = state.data.gaps || [];
      const codebase = state.data.codebase;

      for (const gap of gaps) {
        gap.evidence = await this.findEvidence(gap, codebase);
      }

      return {
        data: {
          ...state.data,
          gaps,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Evidence collection error: ${error.message}`],
      };
    }
  }

  /**
   * Categorize findings by severity
   */
  private async categorizeFindings(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Categorizing findings...';

      const gaps = state.data.gaps || [];

      // Use LLM to determine severity
      for (const gap of gaps) {
        gap.severity = await this.determineSeverity(gap);
        gap.recommendation = await this.generateRecommendation(gap);
      }

      return {
        data: {
          ...state.data,
          gaps,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Categorization error: ${error.message}`],
      };
    }
  }

  private async analyzeRequirement(
    requirement: any,
    codebase: any
  ): Promise<GapFinding | null> {
    const codebaseContext = this.buildCodebaseContext(codebase);

    const prompt = OPTIMIZED_PROMPTS.analyzeGap(
      `${requirement.code} - ${requirement.title}: ${requirement.description}`,
      codebaseContext.substring(0, 4000)
    );

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.gapAnalysis,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');

      if (analysis.isCompliant === false || analysis.hasGap) {
        return {
          id: `gap-${requirement.code}-${Date.now()}`,
          requirementCode: requirement.code,
          severity: analysis.severity || 'medium',
          title: analysis.gapTitle || `Gap in ${requirement.code}`,
          description: analysis.gapDescription || 'Compliance gap identified',
          evidence: [],
          recommendation: '',
        };
      }
    } catch (error) {
      console.error('Requirement analysis error:', error);
    }

    return null;
  }

  private async findEvidence(gap: GapFinding, codebase: any): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    if (!codebase) return evidence;

    // Search codebase for relevant files
    const searchTerms = gap.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

    for (const file of codebase.files || []) {
      const content = file.content.toLowerCase();
      const matches = searchTerms.filter((term) => content.includes(term));

      if (matches.length > 0) {
        // Find relevant line numbers
        const lines = file.content.split('\n');
        const relevantLines: number[] = [];

        lines.forEach((line: string, index: number) => {
          if (searchTerms.some((term) => line.toLowerCase().includes(term))) {
            relevantLines.push(index + 1);
          }
        });

        evidence.push({
          type: 'code',
          source: 'github',
          filePath: file.path,
          lineNumber: relevantLines[0],
          content: lines.slice(Math.max(0, relevantLines[0] - 2), relevantLines[0] + 3).join('\n'),
        });
      }
    }

    // Use web research tools to find additional evidence and best practices
    try {
      // Use Perplexity to research the gap and find remediation examples
      const perplexityKey = process.env.PERPLEXITY_API_KEY;
      if (perplexityKey) {
        try {
          const perplexityClient = new PerplexityClient(perplexityKey);
          const researchQuery = `${gap.requirementCode} ${gap.title} compliance remediation best practices`;
          const researchResult = await perplexityClient.search(researchQuery);
          
          if (researchResult && researchResult.trim().length > 0) {
            evidence.push({
              type: 'documentation',
              source: 'perplexity',
              content: researchResult.substring(0, 1000),
              url: `https://perplexity.ai/search?q=${encodeURIComponent(researchQuery)}`,
            });
          }
        } catch (err: any) {
          console.warn('Perplexity evidence extraction failed:', err.message);
        }
      }

      // Use Firecrawl to scrape relevant compliance documentation URLs if available
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (firecrawlKey) {
        try {
          const firecrawlClient = new FirecrawlClient(firecrawlKey);
          
          // Common compliance documentation URLs
          const complianceDocs = [
            `https://www.soc2.com/${gap.requirementCode?.toLowerCase()}`,
            `https://gdpr.eu/${gap.requirementCode?.toLowerCase()}`,
          ];
          
          for (const docUrl of complianceDocs.slice(0, 2)) {
            try {
              const scraped = await firecrawlClient.scrape(docUrl);
              
              if (scraped && scraped.trim().length > 0) {
                evidence.push({
                  type: 'documentation',
                  source: 'firecrawl',
                  content: scraped.substring(0, 1000),
                  url: docUrl,
                });
              }
            } catch (err) {
              // Skip if URL doesn't exist or fails
              continue;
            }
          }
        } catch (err: any) {
          console.warn('Firecrawl evidence extraction failed:', err.message);
        }
      }
    } catch (error: any) {
      console.warn('Web research for evidence failed:', error.message);
    }

    return evidence.slice(0, 10); // Limit evidence but include web research
  }

  private async determineSeverity(gap: GapFinding): Promise<'critical' | 'high' | 'medium' | 'low'> {
    const prompt = `Determine the severity of this compliance gap:

Title: ${gap.title}
Description: ${gap.description}
Requirement: ${gap.requirementCode}

Return JSON with:
- severity: "critical" | "high" | "medium" | "low"
- reasoning: string`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a compliance expert determining gap severity.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      return result.severity || 'medium';
    } catch (error) {
      return 'medium';
    }
  }

  private async generateRecommendation(gap: GapFinding): Promise<string> {
    // Use web research to enhance recommendations with best practices
    let bestPractices = '';
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (perplexityKey) {
      try {
        const perplexityClient = new PerplexityClient(perplexityKey);
        const bestPracticeQuery = `${gap.requirementCode} ${gap.title} remediation implementation guide`;
        const practiceResult = await perplexityClient.search(bestPracticeQuery);
        
        if (practiceResult && practiceResult.trim().length > 0) {
          bestPractices = practiceResult.substring(0, 500);
        }
      } catch (error: any) {
        console.warn('Best practices research failed:', error.message);
      }
    }

    const prompt = `Generate a remediation recommendation for this compliance gap:

Title: ${gap.title}
Description: ${gap.description}
Requirement: ${gap.requirementCode}
Evidence: ${gap.evidence.map((e) => e.content.substring(0, 200)).join('\n\n')}
${bestPractices ? `\nBest Practices Research:\n${bestPractices}` : ''}

Provide a concise, actionable recommendation based on the evidence and best practices.`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a compliance expert providing remediation recommendations.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 1,
      });

      return response.choices[0]?.message?.content || 'Review and implement compliance controls.';
    } catch (error) {
      return 'Review and implement compliance controls.';
    }
  }

  private buildCodebaseContext(codebase: any): string {
    if (!codebase) return '';

    const context: string[] = [];

    // Add file list
    context.push(`Files (${codebase.files?.length || 0}):`);
    codebase.files?.slice(0, 20).forEach((file: any) => {
      context.push(`- ${file.path} (${file.language}, ${file.lines} lines)`);
    });

    // Add infrastructure
    if (codebase.infrastructure?.length) {
      context.push(`\nInfrastructure:`);
      codebase.infrastructure.forEach((infra: any) => {
        context.push(`- ${infra.type}: ${infra.source}`);
      });
    }

    return context.join('\n');
  }
}

