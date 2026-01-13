/**
 * Regulation RAG Agent
 * Retrieves relevant compliance requirements using RAG
 */

import { StateGraph, END } from '@langchain/langgraph';
import { CorrectiveRAG } from '@/lib/rag';
import { ChunkingStrategy } from '@/lib/rag';
import { VectorStore } from '@/lib/rag';
import { AgentState, ComplianceRequirement } from './types';
import OpenAI from 'openai';
// Removed MCP imports - using direct API clients instead

export class RegulationRAGAgent {
  private correctiveRAG: CorrectiveRAG;
  private vectorStore: VectorStore;
  private openai: OpenAI;

  constructor() {
    this.correctiveRAG = new CorrectiveRAG();
    this.vectorStore = new VectorStore();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Create the regulation RAG agent graph
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

    workflow.addNode('analyze_tech_stack', this.analyzeTechStack.bind(this));
    workflow.addNode('retrieve_requirements', this.retrieveRequirements.bind(this));
    workflow.addNode('rank_requirements', this.rankRequirements.bind(this));

    // Set entry point
    workflow.setEntryPoint('analyze_tech_stack');
    
    workflow.addEdge('analyze_tech_stack', 'retrieve_requirements');
    workflow.addEdge('retrieve_requirements', 'rank_requirements');
    workflow.addEdge('rank_requirements', END);

    return workflow.compile();
  }

  /**
   * Analyze tech stack from codebase
   */
  private async analyzeTechStack(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Analyzing technology stack...';

      const codebase = state.data.codebase;
      if (!codebase) {
        throw new Error('Codebase data not available');
      }

      // Extract tech stack information
      const languages = new Set(codebase.files.map((f) => f.language));
      const frameworks: string[] = [];
      const services: string[] = [];

      // Detect frameworks and services from file patterns
      for (const file of codebase.files) {
        if (file.path.includes('package.json')) {
          try {
            const pkg = JSON.parse(file.content);
            if (pkg.dependencies) {
              Object.keys(pkg.dependencies).forEach((dep) => {
                if (dep.includes('react') || dep.includes('next')) frameworks.push('React/Next.js');
                if (dep.includes('express')) frameworks.push('Express');
                if (dep.includes('django')) frameworks.push('Django');
                if (dep.includes('flask')) frameworks.push('Flask');
              });
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Detect cloud services
        if (file.path.includes('aws') || file.content.includes('aws')) services.push('AWS');
        if (file.path.includes('gcp') || file.content.includes('gcp')) services.push('GCP');
        if (file.path.includes('azure') || file.content.includes('azure')) services.push('Azure');
      }

      const techStack = {
        languages: Array.from(languages),
        frameworks: Array.from(new Set(frameworks)),
        services: Array.from(new Set(services)),
      };

      return {
        data: {
          ...state.data,
          techStack,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Tech stack analysis error: ${error.message}`],
      };
    }
  }

  /**
   * Retrieve relevant compliance requirements using RAG + Web Research
   */
  private async retrieveRequirements(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Retrieving compliance requirements...';

      const framework = state.framework;
      const techStack = (state.data as any).techStack;

      // Build query based on framework and tech stack
      const query = this.buildQuery(framework, techStack);

      // Use Perplexity for web research to find latest compliance requirements
      // Use direct API client instead of MCP
      let webResearchResults: any[] = [];
      try {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (apiKey) {
          const { PerplexityClient } = await import('@/lib/api-clients/perplexity');
          const perplexityClient = new PerplexityClient(apiKey);
          
          const researchQuery = `${framework} compliance requirements ${techStack?.services?.join(' ') || ''} best practices 2024`;
          const researchResult = await perplexityClient.search(researchQuery);
          
          if (researchResult && researchResult.trim().length > 0) {
            webResearchResults = [researchResult];
            
            // Store research results in vector store for later use
            await this.vectorStore.storeChunks([
              {
                id: `perplexity-${framework}-${Date.now()}`,
                content: researchResult.substring(0, 10000),
                metadata: {
                  framework,
                  type: 'web_research',
                  source: 'perplexity',
                },
              }
            ]);
          }
        }
      } catch (error) {
        console.warn('Perplexity research failed, continuing with RAG only:', error);
      }

      // Use Firecrawl to scrape compliance documentation
      // Use direct API client instead of MCP
      try {
        const apiKey = process.env.FIRECRAWL_API_KEY;
        if (apiKey) {
          const { FirecrawlClient } = await import('@/lib/api-clients/firecrawl');
          const firecrawlClient = new FirecrawlClient(apiKey);
          
          const complianceDocs = this.getComplianceDocumentationUrls(framework);
          for (const docUrl of complianceDocs.slice(0, 3)) {
            try {
              const scraped = await firecrawlClient.scrape(docUrl);
              
              if (scraped && scraped.trim().length > 0) {
                await this.vectorStore.storeChunks([{
                  id: `firecrawl-${framework}-${Date.now()}-${docUrl.slice(-20)}`,
                  content: scraped.substring(0, 5000),
                  metadata: {
                    framework,
                    type: 'documentation',
                    source: 'firecrawl',
                    url: docUrl,
                  },
                }]);
              }
            } catch (err: any) {
              console.warn(`Firecrawl scrape failed for ${docUrl}:`, err.message);
              // Skip if URL fails
              continue;
            }
          }
        }
      } catch (error) {
        console.warn('Firecrawl documentation scraping failed:', error);
      }

      // Use Corrective RAG to find relevant requirements with timeout
      let ragResult: any = { chunks: [] };
      try {
        const ragPromise = this.correctiveRAG.search(query, undefined, {
          framework,
          type: 'requirement',
        });
        
        const ragTimeout = new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error('RAG search timeout')), 30000); // 30 second timeout
        });
        
        ragResult = await Promise.race([ragPromise, ragTimeout]);
      } catch (ragError: any) {
        console.warn('[Regulation RAG] RAG search failed or timed out:', ragError?.message || ragError?.toString() || 'Unknown error');
        // Continue with empty chunks - will use web research and defaults
      }

      // Extract requirements from chunks
      const requirements: ComplianceRequirement[] = [];

      for (const chunk of ragResult.chunks || []) {
        try {
          // Parse requirement from chunk
          const requirement = await this.parseRequirement(chunk.content, framework);
          if (requirement) {
            requirements.push({
              ...requirement,
              relevance: this.calculateRelevance(requirement, techStack),
            });
          }
        } catch (parseError: any) {
          console.warn('[Regulation RAG] Failed to parse requirement from chunk:', parseError?.message || 'Unknown error');
          // Continue with next chunk
        }
      }

      // Also parse requirements from web research results
      for (const research of webResearchResults.slice(0, 10)) {
        try {
          const researchContent = typeof research === 'string' ? research : JSON.stringify(research);
          const requirement = await this.parseRequirement(researchContent.substring(0, 2000), framework);
          if (requirement) {
            requirements.push({
              ...requirement,
              relevance: this.calculateRelevance(requirement, techStack) + 0.1, // Boost relevance for recent research
            });
          }
        } catch (parseError: any) {
          console.warn('[Regulation RAG] Failed to parse requirement from research:', parseError?.message || 'Unknown error');
          // Continue with next research result
        }
      }

      // If still no requirements, generate basic ones immediately (don't wait)
      if (requirements.length === 0) {
        console.warn('[Regulation RAG] No requirements extracted, generating basic requirements');
        const basicRequirements = this.generateBasicRequirements(framework);
        if (basicRequirements && basicRequirements.length > 0) {
          requirements.push(...basicRequirements);
          console.log(`[Regulation RAG] Generated ${basicRequirements.length} basic requirements as fallback`);
        } else {
          console.error('[Regulation RAG] generateBasicRequirements returned empty, creating minimal requirement');
          // Create a minimal requirement to ensure we don't get stuck
          requirements.push({
            code: 'REQ-1',
            title: 'Basic Compliance Requirement',
            description: `Ensure compliance with ${framework} framework`,
            category: 'General',
            framework: framework,
            relevance: 0.5,
          });
        }
      }

      // CRITICAL: Ensure we always return requirements, even if empty
      if (requirements.length === 0) {
        console.error('[Regulation RAG] Still no requirements after all fallbacks, creating minimal requirement');
        requirements.push({
          code: 'REQ-1',
          title: 'Basic Compliance Requirement',
          description: `Ensure compliance with ${framework} framework`,
          category: 'General',
          framework: framework,
          relevance: 0.5,
        });
      }

      console.log(`[Regulation RAG] Returning ${requirements.length} requirements to workflow`);

      return {
        data: {
          ...state.data,
          requirements,
          webResearch: webResearchResults,
        },
      };
    } catch (error: any) {
      // If error occurred, still return basic requirements to prevent getting stuck
      console.warn('[Regulation RAG] Error retrieving requirements, using basic requirements as fallback');
      let basicRequirements = this.generateBasicRequirements(framework);
      
      // Ensure we have at least one requirement
      if (!basicRequirements || basicRequirements.length === 0) {
        console.error('[Regulation RAG] generateBasicRequirements returned empty in error handler, creating minimal requirement');
        basicRequirements = [{
          code: 'REQ-1',
          title: 'Basic Compliance Requirement',
          description: `Ensure compliance with ${framework} framework`,
          category: 'General',
          framework: framework,
          relevance: 0.5,
        }];
      }
      
      console.log(`[Regulation RAG] Returning ${basicRequirements.length} fallback requirements after error`);
      
      return {
        data: {
          ...state.data,
          requirements: basicRequirements,
          webResearch: [],
        },
        errors: [...state.errors, `Requirement retrieval error: ${error?.message || error?.toString() || 'Unknown error'}`],
      };
    }
  }
  
  /**
   * Generate basic compliance requirements as fallback
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
          code: 'CC7.3',
          title: 'Detection and Monitoring',
          description: 'The entity monitors system components and the operation of those components to meet the entity\'s objectives.',
          category: 'Monitoring',
          framework: 'SOC2',
          relevance: 0.9,
        },
        {
          code: 'CC8.1',
          title: 'Encryption',
          description: 'The entity uses encryption to protect data at rest and in transit.',
          category: 'Data Protection',
          framework: 'SOC2',
          relevance: 0.95,
        },
      ],
      GDPR: [
        {
          code: 'Article 5',
          title: 'Principles of Processing',
          description: 'Personal data shall be processed lawfully, fairly and in a transparent manner.',
          category: 'Data Processing',
          framework: 'GDPR',
          relevance: 0.9,
        },
        {
          code: 'Article 6',
          title: 'Lawfulness of Processing',
          description: 'Processing shall be lawful only if and to the extent that at least one of the lawful bases applies.',
          category: 'Data Processing',
          framework: 'GDPR',
          relevance: 0.9,
        },
        {
          code: 'Article 32',
          title: 'Security of Processing',
          description: 'The controller and processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk.',
          category: 'Security',
          framework: 'GDPR',
          relevance: 0.95,
        },
        {
          code: 'Article 15',
          title: 'Right of Access',
          description: 'The data subject shall have the right to obtain confirmation as to whether or not personal data concerning them are being processed.',
          category: 'Data Subject Rights',
          framework: 'GDPR',
          relevance: 0.85,
        },
        {
          code: 'Article 17',
          title: 'Right to Erasure',
          description: 'The data subject shall have the right to obtain the erasure of personal data concerning them.',
          category: 'Data Subject Rights',
          framework: 'GDPR',
          relevance: 0.85,
        },
        {
          code: 'Article 25',
          title: 'Data Protection by Design and by Default',
          description: 'The controller shall implement appropriate technical and organisational measures to ensure data protection principles are met.',
          category: 'Privacy by Design',
          framework: 'GDPR',
          relevance: 0.9,
        },
        {
          code: 'Article 33',
          title: 'Notification of Personal Data Breach',
          description: 'In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the supervisory authority.',
          category: 'Breach Notification',
          framework: 'GDPR',
          relevance: 0.9,
        },
      ],
      HIPAA: [
        {
          code: '§164.308',
          title: 'Administrative Safeguards',
          description: 'A covered entity must implement policies and procedures to prevent, detect, contain, and correct security violations.',
          category: 'Administrative',
          framework: 'HIPAA',
          relevance: 0.9,
        },
        {
          code: '§164.310',
          title: 'Physical Safeguards',
          description: 'A covered entity must implement physical safeguards for all workstations that access electronic protected health information.',
          category: 'Physical',
          framework: 'HIPAA',
          relevance: 0.85,
        },
        {
          code: '§164.312',
          title: 'Technical Safeguards',
          description: 'A covered entity must implement technical policies and procedures for electronic information systems that maintain electronic protected health information.',
          category: 'Technical',
          framework: 'HIPAA',
          relevance: 0.95,
        },
        {
          code: '§164.314',
          title: 'Organizational Requirements',
          description: 'A covered entity must ensure that its business associates comply with applicable security requirements.',
          category: 'Organizational',
          framework: 'HIPAA',
          relevance: 0.85,
        },
        {
          code: '§164.316',
          title: 'Policies and Procedures',
          description: 'A covered entity must implement reasonable and appropriate policies and procedures to comply with the security standards.',
          category: 'Policies',
          framework: 'HIPAA',
          relevance: 0.8,
        },
      ],
      ISO: [
        {
          code: 'A.9.1.1',
          title: 'Access Control Policy',
          description: 'An access control policy shall be established, documented and reviewed based on business and security requirements.',
          category: 'Access Control',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'A.9.2.1',
          title: 'User Registration and De-registration',
          description: 'A formal user registration and de-registration process shall be implemented to enable assignment of access rights.',
          category: 'Access Control',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'A.10.1.1',
          title: 'Cryptographic Controls',
          description: 'A policy on the use of cryptographic controls for protection of information shall be developed and implemented.',
          category: 'Cryptography',
          framework: 'ISO',
          relevance: 0.95,
        },
        {
          code: 'A.12.1.1',
          title: 'Documented Operating Procedures',
          description: 'Operating procedures shall be documented and made available to all users who need them.',
          category: 'Operations',
          framework: 'ISO',
          relevance: 0.85,
        },
        {
          code: 'A.12.2.1',
          title: 'Controls Against Malicious Code',
          description: 'Detection, prevention and recovery controls to protect against malicious code shall be implemented.',
          category: 'Security',
          framework: 'ISO',
          relevance: 0.9,
        },
        {
          code: 'A.14.1.1',
          title: 'Information Security Requirements',
          description: 'Information security requirements shall be included in the requirements for new information systems.',
          category: 'Development',
          framework: 'ISO',
          relevance: 0.85,
        },
      ],
      PCI: [
        {
          code: 'Req 1',
          title: 'Install and Maintain Firewall Configuration',
          description: 'Install and maintain a firewall configuration to protect cardholder data.',
          category: 'Network Security',
          framework: 'PCI',
          relevance: 0.9,
        },
        {
          code: 'Req 2',
          title: 'Do Not Use Vendor-Supplied Defaults',
          description: 'Do not use vendor-supplied defaults for system passwords and other security parameters.',
          category: 'Configuration',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'Req 3',
          title: 'Protect Stored Cardholder Data',
          description: 'Protect stored cardholder data using encryption, truncation, masking, and hashing.',
          category: 'Data Protection',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'Req 4',
          title: 'Encrypt Transmission of Cardholder Data',
          description: 'Encrypt transmission of cardholder data across open, public networks.',
          category: 'Encryption',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'Req 7',
          title: 'Restrict Access to Cardholder Data',
          description: 'Restrict access to cardholder data by business need-to-know.',
          category: 'Access Control',
          framework: 'PCI',
          relevance: 0.9,
        },
        {
          code: 'Req 8',
          title: 'Identify and Authenticate Access',
          description: 'Assign a unique ID to each person with computer access and use strong authentication.',
          category: 'Authentication',
          framework: 'PCI',
          relevance: 0.95,
        },
        {
          code: 'Req 10',
          title: 'Track and Monitor Access',
          description: 'Track and monitor all access to network resources and cardholder data.',
          category: 'Monitoring',
          framework: 'PCI',
          relevance: 0.9,
        },
        {
          code: 'Req 11',
          title: 'Regularly Test Security Systems',
          description: 'Regularly test security systems and processes.',
          category: 'Testing',
          framework: 'PCI',
          relevance: 0.85,
        },
        {
          code: 'Req 12',
          title: 'Maintain Information Security Policy',
          description: 'Maintain a policy that addresses information security for all personnel.',
          category: 'Policy',
          framework: 'PCI',
          relevance: 0.85,
        },
      ],
    };
    
    // MULTI-LAYER PROTECTION: Always return at least one requirement
    const requirements = basicRequirements[frameworkUpper] || [];
    
    // LAYER 1: If framework not found, return minimal requirement
    if (requirements.length === 0) {
      console.warn(`[Regulation RAG] Framework ${frameworkUpper} not found in basic requirements, creating minimal requirement`);
      return [{
        code: 'REQ-1',
        title: 'Basic Compliance Requirement',
        description: `Ensure compliance with ${framework} framework`,
        category: 'General',
        framework: framework,
        relevance: 0.5,
      }];
    }
    
    // LAYER 2: Validate all requirements have required fields
    const validRequirements = requirements.filter(req => 
      req && 
      typeof req === 'object' && 
      req.code && 
      req.title && 
      req.framework
    );
    
    // LAYER 3: If validation removed all requirements, return minimal
    if (validRequirements.length === 0) {
      console.error(`[Regulation RAG] All requirements for ${frameworkUpper} failed validation, creating minimal requirement`);
      return [{
        code: 'REQ-1',
        title: 'Basic Compliance Requirement',
        description: `Ensure compliance with ${framework} framework`,
        category: 'General',
        framework: framework,
        relevance: 0.5,
      }];
    }
    
    return validRequirements;
  }

  /**
   * Rank requirements by relevance
   */
  private async rankRequirements(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Ranking requirements by relevance...';

      const requirements = state.data.requirements || [];
      
      // Sort by relevance
      const ranked = requirements.sort((a, b) => b.relevance - a.relevance);

      // Keep top 50 most relevant
      const topRequirements = ranked.slice(0, 50);

      return {
        data: {
          ...state.data,
          requirements: topRequirements,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Ranking error: ${error.message}`],
      };
    }
  }

  private buildQuery(framework: string, techStack: any): string {
    const parts = [framework, 'compliance requirements'];
    
    if (techStack?.languages?.length) {
      parts.push(`for ${techStack.languages.join(', ')} applications`);
    }
    
    if (techStack?.services?.length) {
      parts.push(`deployed on ${techStack.services.join(', ')}`);
    }

    return parts.join(' ');
  }

  private async parseRequirement(content: string, framework: string): Promise<ComplianceRequirement | null> {
    // Use LLM to extract structured requirement data
    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `Extract compliance requirement information from the following text. Return JSON with: code, title, description, category.`,
          },
          {
            role: 'user',
            content: `Framework: ${framework}\n\nText:\n${content.substring(0, 2000)}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      if (parsed.code && parsed.title) {
        return {
          code: parsed.code,
          title: parsed.title,
          description: parsed.description || content.substring(0, 500),
          category: parsed.category || 'General',
          framework,
          relevance: 0.5, // Will be calculated later
        };
      }
    } catch (error) {
      console.error('Requirement parsing error:', error);
    }

    return null;
  }

  private calculateRelevance(requirement: ComplianceRequirement, techStack: any): number {
    let relevance = 0.5; // Base relevance

    const content = `${requirement.title} ${requirement.description}`.toLowerCase();

    // Boost relevance if tech stack matches
    if (techStack?.languages) {
      for (const lang of techStack.languages) {
        if (content.includes(lang.toLowerCase())) relevance += 0.1;
      }
    }

    if (techStack?.services) {
      for (const service of techStack.services) {
        if (content.includes(service.toLowerCase())) relevance += 0.15;
      }
    }

    return Math.min(relevance, 1.0);
  }

  private getComplianceDocumentationUrls(framework: string): string[] {
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
}

