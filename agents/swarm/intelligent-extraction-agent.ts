/**
 * Intelligent Extraction Agent
 * Acts as a cybersecurity specialist that intelligently scans systems for compliance
 * Instead of blind extraction, this agent uses LLM reasoning to strategically scan
 * codebases, dependencies, logs, services, and roles for compliance violations
 */

import OpenAI from 'openai';
import { AgentMemory } from '@/lib/memory';
// Temperature always set to 1 globally
import { mcpClientManager } from '@/mcp/client';
import { VectorStore } from '@/lib/rag';
import { ChunkingStrategy } from '@/lib/rag';
import { PerplexityClient } from '@/lib/api-clients/perplexity';
import { FirecrawlClient } from '@/lib/api-clients/firecrawl';
import { ExtractionResult } from './extraction-agents';

export interface ComplianceScanResult {
  requirement: string;
  status: 'compliant' | 'non-compliant' | 'partial' | 'unknown';
  evidence: Array<{
    source: string;
    type: 'code' | 'config' | 'log' | 'service' | 'role' | 'dependency';
    location: string;
    content: string;
    lineNumber?: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    finding: string;
  }>;
  recommendation?: string;
}

export interface ScanConfiguration {
  // Maximum number of tool calls per server (0 = unlimited, but still respects other limits)
  maxToolCallsPerServer?: number;
  // Maximum number of scan tasks to execute per server (0 = unlimited)
  maxScanTasksPerServer?: number;
  // Batch size for parallel tool execution (default: 3)
  batchSize?: number;
  // Maximum number of iterations/rounds of scanning per server (default: 10)
  maxIterationsPerServer?: number;
  // Scan depth: 'quick' (fewer tools), 'standard' (balanced), 'comprehensive' (all tools)
  scanDepth?: 'quick' | 'standard' | 'comprehensive';
  // Progress callback for detailed tracking
  onProgress?: (progress: {
    serverName: string;
    phase: 'connecting' | 'planning' | 'scanning' | 'analyzing' | 'completed';
    currentTask?: number;
    totalTasks?: number;
    currentTool?: string;
    completedToolCalls?: number;
    totalToolCalls?: number;
    message: string;
  }) => void;
}

export class IntelligentExtractionAgent {
  private openai: OpenAI;
  private memory: AgentMemory;
  private vectorStore: VectorStore;
  private framework: string;
  private projectId: string;
  private sessionId: string;
  private userId: string; // CRITICAL: User ID for MCP client isolation
  private config: ScanConfiguration;

  constructor(
    projectId: string, 
    sessionId: string, 
    framework: string,
    config?: ScanConfiguration,
    userId?: string // CRITICAL: User ID for multi-user isolation
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.memory = new AgentMemory('intelligent-extraction', projectId, sessionId);
    this.vectorStore = new VectorStore();
    this.framework = framework;
    this.projectId = projectId;
    this.sessionId = sessionId;
    this.userId = userId || sessionId; // Use userId if provided, fallback to sessionId
    // Default configuration - allows for hours of runtime
    this.config = {
      maxToolCallsPerServer: config?.maxToolCallsPerServer ?? 0, // 0 = unlimited
      maxScanTasksPerServer: config?.maxScanTasksPerServer ?? 0, // 0 = unlimited
      batchSize: config?.batchSize ?? 5, // Increased from 3 to 5 for better throughput
      maxIterationsPerServer: config?.maxIterationsPerServer ?? 20, // Allow multiple rounds
      scanDepth: config?.scanDepth ?? 'comprehensive', // Default to comprehensive
      onProgress: config?.onProgress,
    };
  }

  /**
   * Main extraction method - intelligently scans for compliance
   */
  async extractIntelligently(
    mcpConnections: Array<{ serverName: string; credentials: any }>
  ): Promise<ExtractionResult> {
    const evidence: ExtractionResult['evidence'] = [];
    const scanResults: ComplianceScanResult[] = [];
    const data: any = {
      complianceScans: [],
      regulations: [],
      findings: [],
    };

    try {
      // Step 1: Fetch and store regulations in RAG pipeline
      this.reportProgress('', 'planning', 0, 0, 0, 0, `Fetching ${this.framework} regulations...`);
      console.log(`[Intelligent Extraction] Fetching ${this.framework} regulations...`);
      const regulations = await this.fetchAndStoreRegulations();
      data.regulations = regulations;

      // Step 2: Get compliance requirements from stored regulations
      this.reportProgress('', 'planning', 0, 0, 0, 0, `Retrieving compliance requirements...`);
      const requirements = await this.getComplianceRequirements();
      console.log(`[Intelligent Extraction] Found ${requirements.length} compliance requirements`);

      // Step 3: For each connected MCP, intelligently scan for compliance
      const totalServers = mcpConnections.length;
      for (let serverIndex = 0; serverIndex < mcpConnections.length; serverIndex++) {
        const connection = mcpConnections[serverIndex];
        console.log(`[Intelligent Extraction] Scanning ${connection.serverName} for compliance... (${serverIndex + 1}/${totalServers})`);
        
        try {
          this.reportProgress(
            connection.serverName,
            'connecting',
            0,
            0,
            0,
            0,
            `Connecting to ${connection.serverName}...`
          );
          
          const serverScans = await this.scanMCPServer(
            connection.serverName,
            connection.credentials,
            requirements
          );
          
          // Save important findings to memory as they're discovered (real-time)
          if (serverScans && serverScans.length > 0) {
            await this.saveImportantFindingsToMemory(serverScans);
          }
          
          scanResults.push(...serverScans);
          
          this.reportProgress(
            connection.serverName,
            'completed',
            0,
            0,
            0,
            0,
            `Completed scan of ${connection.serverName}: Found ${serverScans.length} compliance issues`
          );
          
          await this.memory.remember(
            `Completed compliance scan for ${connection.serverName}. Found ${serverScans.length} scan results.`,
            'extraction',
            {
              serverName: connection.serverName,
              scanResults: serverScans.length,
            }
          );
        } catch (error: any) {
          console.error(`[Intelligent Extraction] Failed to scan ${connection.serverName}:`, error);
          this.reportProgress(
            connection.serverName,
            'completed',
            0,
            0,
            0,
            0,
            `Failed to scan ${connection.serverName}: ${error?.message || error?.toString() || 'Unknown error'}`
          );
          // Continue with other servers even if one fails
          const errorMsg = error?.message || error?.toString() || 'Unknown error';
          await this.memory.remember(
            `Failed to scan ${connection.serverName}: ${errorMsg}`,
            'extraction',
            {
              serverName: connection.serverName,
              error: errorMsg,
            }
          );
        }
      }

      // Step 4: Generate scan summary
      const scanSummary = {
        totalServersScanned: mcpConnections.length,
        totalScanResults: scanResults.length,
        servers: mcpConnections.map(conn => ({
          serverName: conn.serverName,
          scanResults: scanResults.filter(r => r.evidence.some(e => e.source === conn.serverName)).length,
        })),
        configuration: {
          batchSize: this.config.batchSize,
          maxIterationsPerServer: this.config.maxIterationsPerServer,
          scanDepth: this.config.scanDepth,
          maxToolCallsPerServer: this.config.maxToolCallsPerServer || 'unlimited',
          maxScanTasksPerServer: this.config.maxScanTasksPerServer || 'unlimited',
        },
      };
      
      console.log(`[Intelligent Extraction] Scan Summary:`, JSON.stringify(scanSummary, null, 2));
      data.scanSummary = scanSummary;

      // Step 5: Convert scan results to evidence
      for (const scan of scanResults) {
        for (const ev of scan.evidence) {
          evidence.push({
            type: ev.type,
            content: `${scan.requirement}: ${ev.finding}\n\nLocation: ${ev.location}\n\n${ev.content}`,
            metadata: {
              requirement: scan.requirement,
              status: scan.status,
              severity: ev.severity,
              source: ev.source,
              location: ev.location,
              lineNumber: ev.lineNumber,
            },
          });
        }
      }

      data.complianceScans = scanResults;
      data.findings = scanResults.filter(s => s.status === 'non-compliant' || s.status === 'partial');

      // Save important findings to memory in real-time
      await this.saveImportantFindingsToMemory(scanResults);

      await this.memory.remember(
        `Intelligent compliance scan completed. Found ${data.findings.length} non-compliant items across ${mcpConnections.length} MCP servers`,
        'extraction',
        {
          framework: this.framework,
          scans: scanResults.length,
          findings: data.findings.length,
        }
      );

      return {
        agent: 'intelligent-extraction',
        source: 'multi-mcp',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('Intelligent extraction error:', error);
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      throw new Error(`Intelligent extraction failed: ${errorMsg}`);
    }
  }

  /**
   * Fetch regulations from internet and store in RAG pipeline
   */
  private async fetchAndStoreRegulations(): Promise<string[]> {
    try {
      // Check if regulations already exist in RAG
      const existingRegs = await this.vectorStore.similaritySearch(
        `${this.framework} compliance requirements regulations`,
        5,
        { framework: this.framework, type: 'requirement' }
      );

      if (existingRegs.length >= 3) {
        console.log(`[Regulations] Found ${existingRegs.length} existing regulations in RAG`);
        return existingRegs.map(r => r.chunk.content);
      }

      // Fetch fresh regulations using Perplexity
      const perplexityKey = process.env.PERPLEXITY_API_KEY;
      if (!perplexityKey) {
        console.warn('[Regulations] Perplexity API key not available, using default regulations');
        return this.getDefaultRegulations();
      }

      const perplexity = new PerplexityClient(perplexityKey);
      
      // Comprehensive regulation queries
      const queries = [
        `${this.framework} official compliance requirements complete text`,
        `${this.framework} security controls implementation guide`,
        `${this.framework} audit criteria and assessment procedures`,
      ];

      const regulations: string[] = [];
      
      for (const query of queries) {
        try {
          const result = await perplexity.search(query);
          if (result && result.length > 100) {
            regulations.push(result);
          }
        } catch (error: any) {
          console.warn(`[Regulations] Perplexity query failed:`, error?.message || error?.toString() || 'Unknown error');
        }
      }

      // Also fetch from official documentation using Firecrawl
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (firecrawlKey) {
        const firecrawl = new FirecrawlClient(firecrawlKey);
        const docUrls = this.getOfficialDocumentationUrls();
        
        for (const url of docUrls.slice(0, 3)) {
          try {
            const scraped = await firecrawl.scrape(url);
            if (scraped && scraped.length > 100) {
              regulations.push(scraped);
            }
          } catch (error: any) {
            console.warn(`[Regulations] Firecrawl failed for ${url}:`, error?.message || error?.toString() || 'Unknown error');
          }
        }
      }

      if (regulations.length === 0) {
        return this.getDefaultRegulations();
      }

      // Store regulations in RAG pipeline
      const chunks = ChunkingStrategy.createChunks(
        regulations.join('\n\n'),
        {
          source: 'internet',
          type: 'documentation',
          framework: this.framework,
        },
        'semantic'
      );

      await this.vectorStore.storeChunks(chunks);
      console.log(`[Regulations] Stored ${chunks.length} regulation chunks in RAG pipeline`);

      return regulations;
    } catch (error: any) {
      console.error('[Regulations] Error fetching regulations:', error);
      return this.getDefaultRegulations();
    }
  }

  /**
   * Get compliance requirements from stored regulations
   */
  private async getComplianceRequirements(): Promise<string[]> {
    try {
      this.reportProgress('', 'planning', 0, 0, 0, 0, 'Searching stored regulations...');
      console.log('[Requirements] Searching stored regulations...');

      // Search RAG for specific requirements with timeout
      // Try multiple search strategies to find regulations
      let ragResults: any[] = [];
      try {
        // Strategy 1: Search with framework and type filters
        const searchPromise1 = this.vectorStore.similaritySearch(
          `${this.framework} compliance requirements controls criteria`,
          20,
          { framework: this.framework, type: 'regulation' }
        );
        
        // Strategy 2: Search without type filter (broader search)
        const searchPromise2 = this.vectorStore.similaritySearch(
          `${this.framework} requirements controls`,
          20,
          { framework: this.framework }
        );
        
        // Strategy 3: Search without any filters (broadest search)
        const searchPromise3 = this.vectorStore.similaritySearch(
          `${this.framework} compliance`,
          30,
          undefined
        );
        
        // Add timeout for similarity search (30 seconds)
        const timeoutPromise = new Promise<any[]>((_, reject) => {
          setTimeout(() => reject(new Error('Similarity search timeout')), 30000);
        });
        
        // Try all strategies in parallel, use first successful result
        const [results1, results2, results3] = await Promise.allSettled([
          Promise.race([searchPromise1, timeoutPromise]),
          Promise.race([searchPromise2, timeoutPromise]),
          Promise.race([searchPromise3, timeoutPromise]),
        ]);
        
        // Combine results from all strategies, deduplicate by chunk ID
        const allResults: any[] = [];
        const seenIds = new Set<string>();
        
        for (const result of [results1, results2, results3]) {
          if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            for (const item of result.value) {
              const chunkId = item.chunk?.id || item.id;
              if (chunkId && !seenIds.has(chunkId)) {
                seenIds.add(chunkId);
                allResults.push(item);
              }
            }
          }
        }
        
        // Sort by similarity score (highest first) and take top results
        ragResults = allResults
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, 30);
        
        console.log(`[Requirements] Found ${ragResults.length} relevant regulation chunks (from ${allResults.length} total)`);
      } catch (searchError: any) {
        console.warn('[Requirements] Similarity search failed or timed out:', searchError.message);
        // Don't return defaults immediately - try web search first
      }

      // If no results from vector store, use web search tools to fetch requirements
      if (ragResults.length === 0) {
        console.log('[Requirements] No regulation chunks found in vector store, fetching from web...');
        this.reportProgress('', 'planning', 0, 0, 0, 0, 'Fetching requirements from web using search tools...');
        
        try {
          // Add timeout to web fetch (30 seconds)
          const webFetchPromise = this.fetchRequirementsFromWeb();
          const webFetchTimeout = new Promise<string[]>((_, reject) => {
            setTimeout(() => reject(new Error('Web fetch timeout')), 30000);
          });
          
          const webRequirements = await Promise.race([webFetchPromise, webFetchTimeout]);
          if (webRequirements && webRequirements.length > 0) {
            console.log(`[Requirements] Fetched ${webRequirements.length} requirements from web`);
            return webRequirements;
          }
        } catch (webError: any) {
          console.warn('[Requirements] Web search failed or timed out:', webError?.message || webError?.toString() || 'Unknown error');
        }
        
        console.log('[Requirements] Using default requirements as fallback');
        return this.getDefaultRequirements();
      }

      this.reportProgress('', 'planning', 0, 0, 0, 0, 'Extracting requirements using AI...');
      console.log('[Requirements] Extracting requirements using AI...');

      // Use LLM to extract structured requirements
      const regulationsText = ragResults.map(r => r.chunk.content).join('\n\n');
      
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      // Add timeout for LLM call (60 seconds)
      const llmPromise = this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a cybersecurity expert extracting ${this.framework} compliance requirements from regulations. Extract all specific requirements, controls, and criteria. Return a JSON object with a "requirements" array of requirement codes/identifiers.`,
          },
          {
            role: 'user',
            content: `Extract all ${this.framework} compliance requirements from this text:\n\n${regulationsText.length > 8000 ? regulationsText.substring(0, 8000) : regulationsText}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('LLM call timeout')), 60000);
      });

      let response;
      try {
        response = await Promise.race([llmPromise, timeoutPromise]);
      } catch (llmError: any) {
        console.warn('[Requirements] LLM call failed or timed out, using defaults:', llmError?.message || llmError?.toString() || 'Unknown error');
        return this.getDefaultRequirements();
      }

      let parsed: any;
      try {
        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== 'string') {
          console.warn('[Requirements] Invalid response content from LLM');
          return this.getDefaultRequirements();
        }
        parsed = JSON.parse(content);
      } catch (parseError: any) {
        console.error('[Requirements] JSON parse error:', parseError.message);
        return this.getDefaultRequirements();
      }
      
      const requirements = parsed.requirements || parsed.items || [];

      // Fallback to framework-specific defaults
      if (requirements.length === 0) {
        console.log('[Requirements] No requirements extracted, using default requirements');
        return this.getDefaultRequirements();
      }

      console.log(`[Requirements] Extracted ${requirements.length} compliance requirements`);
      return requirements;
    } catch (error: any) {
      console.error('[Requirements] Error extracting requirements:', error);
      return this.getDefaultRequirements();
    }
  }

  /**
   * Report progress to callback if configured
   * Wrapped in try-catch to prevent crashes if stream is closed
   */
  private reportProgress(
    serverName: string,
    phase: 'connecting' | 'planning' | 'scanning' | 'analyzing' | 'completed',
    currentTask: number,
    totalTasks: number,
    completedToolCalls: number,
    totalToolCalls: number,
    message: string,
    currentTool?: string
  ): void {
    if (this.config.onProgress) {
      try {
        this.config.onProgress({
          serverName,
          phase,
          currentTask,
          totalTasks,
          currentTool,
          completedToolCalls,
          totalToolCalls,
          message,
        });
      } catch (error: any) {
        // Handle errors gracefully - don't crash the extraction process
        if (error.code === 'ERR_INVALID_STATE' || error.message?.includes('closed')) {
          console.warn('[Progress] Stream is closed, progress update ignored');
        } else {
          console.error('[Progress] Error reporting progress:', error);
        }
        // Continue execution even if progress reporting fails
      }
    }
  }

  /**
   * Intelligently scan a specific MCP server for compliance
   */
  private async scanMCPServer(
    serverName: string,
    credentials: any,
    requirements: string[]
  ): Promise<ComplianceScanResult[]> {
    const results: ComplianceScanResult[] = [];

    try {
      // Ensure credentials are properly formatted
      let formattedCredentials = credentials;
      if (credentials && typeof credentials === 'object') {
        // For AWS, ensure customEnv structure is correct
        if (serverName === 'aws-core' || serverName === 'aws') {
          // AWS credentials should be in customEnv format
          if (!formattedCredentials.customEnv && (credentials.AWS_ACCESS_KEY_ID || credentials.AWS_SECRET_ACCESS_KEY)) {
            formattedCredentials = {
              ...credentials,
              customEnv: {
                AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID || credentials.customEnv?.AWS_ACCESS_KEY_ID || '',
                AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY || credentials.customEnv?.AWS_SECRET_ACCESS_KEY || '',
                AWS_REGION: credentials.AWS_REGION || credentials.customEnv?.AWS_REGION || process.env.AWS_REGION || 'us-east-1',
              },
            };
          } else if (formattedCredentials.customEnv) {
            // Ensure all required AWS env vars are present
            formattedCredentials = {
              ...credentials,
              customEnv: {
                ...formattedCredentials.customEnv,
                AWS_ACCESS_KEY_ID: formattedCredentials.customEnv.AWS_ACCESS_KEY_ID || '',
                AWS_SECRET_ACCESS_KEY: formattedCredentials.customEnv.AWS_SECRET_ACCESS_KEY || '',
                AWS_REGION: formattedCredentials.customEnv.AWS_REGION || process.env.AWS_REGION || 'us-east-1',
              },
            };
          }
        } else {
          // For other servers, ensure token is extracted correctly
          const token = credentials.accessToken || credentials.apiToken || credentials.token || credentials.apiKey;
          if (token) {
            formattedCredentials = {
              ...credentials,
              accessToken: token,
              apiToken: token,
              token: token,
            };
          }
        }
      }
      
      // Log credential presence (but not the actual values for security)
      const hasCredentials = formattedCredentials && (
        (formattedCredentials.customEnv && Object.keys(formattedCredentials.customEnv).length > 0) ||
        formattedCredentials.accessToken ||
        formattedCredentials.apiToken ||
        formattedCredentials.token ||
        formattedCredentials.apiKey
      );
      console.log(`[${serverName}] Connecting with credentials:`, hasCredentials ? 'Present' : 'Missing');
      if (serverName === 'aws-core' || serverName === 'aws') {
        const awsCreds = formattedCredentials?.customEnv || {};
        console.log(`[${serverName}] AWS credentials check:`, {
          hasAccessKey: !!awsCreds.AWS_ACCESS_KEY_ID,
          hasSecretKey: !!awsCreds.AWS_SECRET_ACCESS_KEY,
          region: awsCreds.AWS_REGION || 'not set',
        });
      }
      
      // Connect with retry logic
      let client;
      let retries = 3;
      while (retries > 0) {
        try {
          client = await mcpClientManager.connect(serverName, { ...formattedCredentials, userId: this.userId });
          break;
        } catch (connectError: any) {
          retries--;
          if (retries === 0) {
            throw connectError;
          }
          console.warn(`[${serverName}] Connection attempt failed, retrying... (${retries} left)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // List tools with timeout and retry logic
      let tools: any[] = [];
      let listRetries = 2;
      while (listRetries > 0) {
        try {
          tools = await Promise.race([
            mcpClientManager.listTools(serverName, this.userId),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Tool listing timeout')), 20000)
            )
          ]) as any[];
          break; // Success
        } catch (listError: any) {
          listRetries--;
          if (listRetries === 0) {
            throw listError;
          }
          console.warn(`[${serverName}] Tool listing failed, retrying... (${listRetries} left)`);
          // Reconnect if connection was closed
          if (listError.message?.includes('closed') || listError.message?.includes('not connected')) {
            try {
              await mcpClientManager.connect(serverName, { ...formattedCredentials, userId: this.userId });
            } catch (reconnectError) {
              console.error(`[${serverName}] Reconnection failed:`, reconnectError);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!tools || tools.length === 0) {
        console.warn(`[${serverName}] No tools available`);
        return results;
      }

      const toolNames = tools.map((t: any) => typeof t === 'string' ? t : t.name || String(t));
      console.log(`[${serverName}] Available tools: ${toolNames.length}`);

      // Use LLM to determine which tools to use and how to scan
      this.reportProgress(serverName, 'planning', 0, 0, 0, 0, `Creating scan plan for ${serverName}...`);
      const scanPlan = await this.createScanPlan(serverName, toolNames, requirements);
      
      // Apply scan depth filter if configured
      let tasksToExecute = scanPlan.tasks;
      if (this.config.scanDepth === 'quick') {
        // Quick scan: Use only 30% of tasks, focusing on high-priority security checks
        tasksToExecute = scanPlan.tasks.filter((task, index) => {
          const purpose = task.purpose || '';
          return index % 3 === 0 || (purpose && (purpose.toLowerCase().includes('security') || purpose.toLowerCase().includes('compliance')));
        }).slice(0, Math.ceil(scanPlan.tasks.length * 0.3));
      } else if (this.config.scanDepth === 'standard') {
        // Standard scan: Use 60% of tasks
        tasksToExecute = scanPlan.tasks.slice(0, Math.ceil(scanPlan.tasks.length * 0.6));
      }
      // comprehensive uses all tasks
      
      // Apply max scan tasks limit if configured
      if (this.config.maxScanTasksPerServer && this.config.maxScanTasksPerServer > 0) {
        tasksToExecute = tasksToExecute.slice(0, this.config.maxScanTasksPerServer);
      }
      
      const totalTasks = tasksToExecute.length;
      console.log(`[${serverName}] Executing ${totalTasks} scan tasks (from ${scanPlan.tasks.length} planned)`);
      
      // Execute intelligent scans based on plan - process in batches
      const batchSize = this.config.batchSize || 5;
      const taskBatches = [];
      for (let i = 0; i < tasksToExecute.length; i += batchSize) {
        taskBatches.push(tasksToExecute.slice(i, i + batchSize));
      }

      let completedToolCalls = 0;
      const totalToolCalls = totalTasks; // Estimate: 1 tool call per task
      
      // Track iterations to respect maxIterationsPerServer
      let iteration = 0;
      const maxIterations = this.config.maxIterationsPerServer || 20;
      
      for (let batchIndex = 0; batchIndex < taskBatches.length && iteration < maxIterations; batchIndex++) {
        const batch = taskBatches[batchIndex];
        const batchStartTask = batchIndex * batchSize + 1;
        const batchEndTask = Math.min(batchStartTask + batch.length - 1, totalTasks);
        
        this.reportProgress(
          serverName,
          'scanning',
          batchStartTask,
          totalTasks,
          completedToolCalls,
          totalToolCalls,
          `Scanning ${serverName}: Processing batch ${batchIndex + 1}/${taskBatches.length} (tasks ${batchStartTask}-${batchEndTask} of ${totalTasks})`
        );
        
        const batchResults = await Promise.allSettled(
          batch.map((scanTask, taskIndexInBatch) => {
            const currentTaskNum = batchStartTask + taskIndexInBatch;
            const toolName = typeof scanTask.tool === 'string' ? scanTask.tool : (scanTask.tool as any)?.name || 'unknown';
            
            // Skip if tool name is invalid
            if (!toolName || toolName === 'undefined' || toolName === 'null') {
              console.error(`[${serverName}] Skipping scan task with invalid tool name:`, scanTask);
              return Promise.resolve(null);
            }
            
            this.reportProgress(
              serverName,
              'scanning',
              currentTaskNum,
              totalTasks,
              completedToolCalls,
              totalToolCalls,
              `Executing ${toolName} on ${serverName}...`,
              toolName
            );
            
            return this.executeIntelligentScan(serverName, scanTask, requirements).then(result => {
              completedToolCalls++;
              this.reportProgress(
                serverName,
                'scanning',
                currentTaskNum,
                totalTasks,
                completedToolCalls,
                totalToolCalls,
                `Completed ${toolName} (${completedToolCalls}/${totalToolCalls} tools)`
              );
              return result;
            });
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            // Handle both single result and array of results
            if (Array.isArray(result.value)) {
              results.push(...result.value);
            } else {
              results.push(result.value);
            }
          } else if (result.status === 'rejected') {
            console.warn(`[${serverName}] Scan task failed:`, result.reason?.message || 'Unknown error');
            completedToolCalls++; // Count failed calls too
          }
        }
        
        // Check if we've hit max tool calls limit
        if (this.config.maxToolCallsPerServer && this.config.maxToolCallsPerServer > 0) {
          if (completedToolCalls >= this.config.maxToolCallsPerServer) {
            console.log(`[${serverName}] Reached max tool calls limit (${this.config.maxToolCallsPerServer}), stopping scan`);
            this.reportProgress(
              serverName,
              'scanning',
              totalTasks,
              totalTasks,
              completedToolCalls,
              totalToolCalls,
              `Reached tool call limit (${completedToolCalls}/${this.config.maxToolCallsPerServer}), stopping scan`
            );
            break;
          }
        }
        
        iteration++;
        
        // Small delay between batches to avoid overwhelming the server
        if (batchIndex < taskBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      this.reportProgress(
        serverName,
        'analyzing',
        totalTasks,
        totalTasks,
        completedToolCalls,
        totalToolCalls,
        `Analyzing ${results.length} scan results from ${serverName}...`
      );

      return results;
    } catch (error: any) {
      console.error(`[${serverName}] Scan error:`, error?.message || error?.toString() || 'Unknown error');
      
      // Generate a finding for connection failure to ensure it's reported
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const isConnectionError = errorMessage.includes('Failed to connect') || 
                                errorMessage.includes('Connection') ||
                                errorMessage.includes('MODULE_NOT_FOUND') ||
                                errorMessage.includes('Cannot find module');
      
      if (isConnectionError) {
        // Create a finding for connection failure
        results.push({
          requirement: 'MCP_CONNECTION',
          status: 'non-compliant',
          evidence: [{
            source: serverName,
            type: 'config',
            location: 'MCP Connection',
            content: `Failed to connect to ${serverName} MCP server: ${errorMessage}`,
            severity: 'high',
            finding: `MCP server connection failure prevents compliance scanning of ${serverName}. This may indicate missing credentials, network issues, or server configuration problems.`,
          }],
          recommendation: `Fix ${serverName} MCP connection: 1) Verify credentials are correctly configured, 2) Check network connectivity, 3) Ensure MCP server is properly installed and accessible.`,
        });
      }
      
      // If it's a rate limit error, provide helpful message
      if (error.message?.includes('rate limit') || error.message?.includes('Rate limit')) {
        console.error(`[${serverName}] Rate limit exceeded. Ensure authenticated requests are being used.`);
        if (serverName === 'github') {
          console.error(`[${serverName}] GitHub requires GITHUB_TOKEN environment variable for authenticated requests.`);
        }
      }
      
      return results;
    }
  }

  /**
   * Create an intelligent scan plan using LLM
   * Focuses on cybersecurity compliance scanning, not blind extraction
   */
  private async createScanPlan(
    serverName: string,
    availableTools: string[],
    requirements: string[]
  ): Promise<{ tasks: Array<{ tool: string; purpose: string; parameters: any }> }> {
    const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
    
    // Framework-specific scan focus
    const scanFocus: Record<string, string> = {
      SOC2: 'Focus on: access controls (CC6.1-6.6), encryption (CC8.1-8.2), monitoring (CC7.2-7.4), change management',
      GDPR: 'Focus on: data protection (Art. 32), privacy by design (Art. 25), data subject rights (Art. 15-22), breach notification (Art. 33)',
      HIPAA: 'Focus on: administrative safeguards (§164.308), technical safeguards (§164.312), access controls, encryption, audit logs',
      ISO: 'Focus on: ISMS implementation (A.5-A.18), access controls (A.9), cryptography (A.10), operations security (A.12), incident management (A.16)',
      PCI: 'Focus on: firewall configuration (Req 1), default credentials (Req 2), cardholder data protection (Req 3-4), access restrictions (Req 7-8), monitoring (Req 10)',
    };

    const prompt = `As a cybersecurity auditor, create a ${this.framework} compliance scan plan.

MCP Server: ${serverName}
Available Tools for ${serverName}: ${availableTools.join(', ')}
Requirements: ${requirements.slice(0, 15).join(', ')}
${scanFocus[this.framework] || ''}

**CRITICAL RULE**: You MUST ONLY use tools from the "Available Tools for ${serverName}" list above.
- If serverName is "github", ONLY use tools that exist in the GitHub MCP server (e.g., "search_code", "get_file", "list_repositories")
- If serverName is "aws-core" or "aws", ONLY use AWS tools (e.g., "iam_list_users", "s3_list_buckets", "cloudwatch_logs") - NEVER use "search_code" (it's GitHub-only)
- NEVER suggest tools that are not in the Available Tools list
- Before suggesting any tool, verify it exists in the Available Tools list

Scan areas:
1. Code: Hardcoded secrets, weak encryption, missing auth, SQL injection, insecure storage, missing validation
2. Dependencies: CVE vulnerabilities, outdated packages, insecure deps
3. Configuration: Exposed credentials, weak settings, missing encryption, improper access
4. Infrastructure (AWS): Excessive IAM permissions, public S3, unencrypted RDS, missing CloudWatch, permissive security groups
5. Monitoring: Missing audit logs, no security monitoring, insufficient retention

For each tool, specify:
- Requirement it checks
- Security issue to identify
- Parameters to use

**ABSOLUTE RULE - TOOL VALIDATION**:
- For serverName="${serverName}", you MUST ONLY suggest tools that are in the "Available Tools for ${serverName}" list above
- If serverName is "github", you can ONLY use: ${availableTools.filter((t: any) => typeof t === 'string' ? t.includes('search') || t.includes('file') || t.includes('repo') : String(t).includes('search') || String(t).includes('file') || String(t).includes('repo')).join(', ') || 'search_code, get_file, list_repositories'}
- If serverName is "aws-core" or "aws", you can ONLY use AWS tools like: ${availableTools.filter((t: any) => typeof t === 'string' ? (t.includes('iam') || t.includes('s3') || t.includes('cloudwatch') || t.includes('ec2')) : (String(t).includes('iam') || String(t).includes('s3') || String(t).includes('cloudwatch') || String(t).includes('ec2'))).join(', ') || 'iam_list_users, s3_list_buckets, cloudwatch_logs'}
- NEVER suggest "search_code" for AWS servers - it doesn't exist in AWS MCP
- NEVER suggest AWS tools (s3_list_buckets, iam_list_users, cloudwatch_logs) for GitHub server - they don't exist in GitHub MCP
- Before suggesting ANY tool, check if it exists in the Available Tools list above

**CRITICAL FOR AWS TOOLS** (only if serverName is "aws-core" or "aws"): 
- NEVER use template variables like \${each_region_from_task_1}, \${region}, or \${task_1} in parameters
- For AWS tools that need a region, use a valid AWS region like "us-east-1", "eu-west-1", etc.
- If region is needed, use "region_name": "us-east-1" (use the actual region from AWS_REGION environment variable, default to "us-east-1")
- Do NOT use placeholder values or template syntax in any parameter values
- All parameter values must be literal strings or numbers, never template variables

**CRITICAL for GitHub search_code tool** (only if serverName="github"):
- The "q" parameter MUST use valid GitHub Search API syntax
- ALWAYS include at least one qualifier: repo:owner/name, user:username, or org:orgname
- NEVER use "OR", "AND", "NOT" operators - use space-separated terms instead
- NEVER use parentheses () in queries
- NEVER use "+" operator (it's treated as logical operator, not literal plus)
- NEVER use "/**" patterns (confuses parser)
- Wrap multi-word phrases and special patterns in double quotes: "BEGIN RSA PRIVATE KEY", "SELECT FROM", "hashlib.md5"
- Wrap method calls and code patterns in quotes: "cursor.execute", "Cipher.getInstance", "mysql.query"
- Wrap all-caps identifiers in quotes: "AWS_ACCESS_KEY_ID", "SELECT", "FROM"
- Example VALID queries:
  - "user:@me filename:.env \"AWS_ACCESS_KEY_ID\""
  - "user:@me \"BEGIN RSA PRIVATE KEY\" filename:id_rsa"
  - "user:@me \"cursor.execute\""
  - "user:@me \"hashlib.md5\""
- Example INVALID queries (will cause 422 error):
  - "user:@me cursor.execute SELECT + FROM" (has + operator and unquoted phrases)
  - "user:@me AllowAnonymous permitAll antMatchers /** permitAll" (has /** pattern)
  - "user:@me mysql.query SELECT + sequelize.query SELECT +" (has + operators)
- If you need to search for multiple concepts, make SEPARATE search_code calls instead of combining them

Return JSON:
{
  "tasks": [
    {
      "tool": "search_code",
      "purpose": "Find hardcoded API keys and secrets violating ${this.framework} encryption requirements",
      "parameters": {"q": "user:@me api_key password secret", "language": "all"}
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'Senior cybersecurity expert creating compliance scan plans. Focus on identifying security vulnerabilities, misconfigurations, and compliance gaps. Be specific about tools and parameters needed.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const plan = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      // Validate and filter tasks to only include tools that actually exist
      if (plan.tasks && Array.isArray(plan.tasks)) {
        const validTasks = plan.tasks.filter((task: any) => {
          const toolName = typeof task.tool === 'string' ? task.tool : task.tool?.name || String(task.tool);
          const isValid = availableTools.some((availableTool: any) => {
            const availableToolName = typeof availableTool === 'string' ? availableTool : availableTool?.name || String(availableTool);
            return availableToolName === toolName;
          });
          
          if (!isValid) {
            console.warn(`[Scan Plan] Filtered out invalid tool "${toolName}" for ${serverName} - not in available tools list`);
          }
          
          return isValid;
        });
        
        return { tasks: validTasks };
      }
      
      return { tasks: [] };
    } catch (error: any) {
      console.error('[Scan Plan] Error creating plan:', error);
      // Return default scan tasks based on server type
      return this.getDefaultScanPlan(serverName, availableTools);
    }
  }

  /**
   * Get default scan plan if LLM fails
   */
  private getDefaultScanPlan(
    serverName: string,
    availableTools: string[]
  ): { tasks: Array<{ tool: string; purpose: string; parameters: any }> } {
    const tasks: Array<{ tool: string; purpose: string; parameters: any }> = [];

    if (serverName === 'github') {
      // GitHub-specific security scans
      // All queries must use valid GitHub Search API syntax:
      // - Include repo/user/org qualifier
      // - Wrap multi-word phrases and special patterns in quotes
      // - Avoid +, OR, AND, NOT, /**, parentheses
      // - Make separate calls for different concepts
      const securityQueries = [
        { q: 'user:@me filename:.env "password"', purpose: 'Find hardcoded passwords in .env files' },
        { q: 'user:@me filename:.env "AWS_ACCESS_KEY_ID"', purpose: 'Find AWS access keys' },
        { q: 'user:@me filename:.env "AWS_SECRET_ACCESS_KEY"', purpose: 'Find AWS secret keys' },
        { q: 'user:@me filename:.env "token"', purpose: 'Find tokens in .env files' },
        { q: 'user:@me "BEGIN RSA PRIVATE KEY"', purpose: 'Find RSA private keys' },
        { q: 'user:@me "BEGIN OPENSSH PRIVATE KEY"', purpose: 'Find OpenSSH private keys' },
        { q: 'user:@me filename:id_rsa', purpose: 'Find SSH key files' },
        { q: 'user:@me filename:.npmrc "_authToken"', purpose: 'Find npm auth tokens' },
        { q: 'user:@me filename:.pypirc "password"', purpose: 'Find Python registry passwords' },
        { q: 'user:@me filename:.dockerconfigjson "auth"', purpose: 'Find Docker auth configs' },
        { q: 'user:@me "AKIA"', purpose: 'Find AWS access key IDs (AKIA prefix)' },
        { q: 'user:@me "hashlib.md5"', purpose: 'Find MD5 hash usage' },
        { q: 'user:@me "hashlib.sha1"', purpose: 'Find SHA1 hash usage' },
        { q: 'user:@me "crypto.createHash"', purpose: 'Find crypto hash usage' },
        { q: 'user:@me "Cipher.getInstance"', purpose: 'Find Java cipher usage' },
        { q: 'user:@me "AllowAnonymous"', purpose: 'Find anonymous access patterns' },
        { q: 'user:@me "permitAll"', purpose: 'Find permitAll security patterns' },
        { q: 'user:@me "@AnonymousAllowed"', purpose: 'Find anonymous allowed annotations' },
        { q: 'user:@me "app.get"', purpose: 'Find Express app.get routes' },
        { q: 'user:@me "router.post"', purpose: 'Find Express router.post routes' },
        { q: 'user:@me "cursor.execute"', purpose: 'Find raw SQL cursor.execute calls' },
        { q: 'user:@me "mysql.query"', purpose: 'Find mysql.query calls' },
        { q: 'user:@me "sequelize.query"', purpose: 'Find sequelize.query calls' },
      ];

      for (const query of securityQueries) {
        const searchCodeTool = availableTools.find((t: any) => 
          typeof t === 'string' ? t === 'search_code' : (t?.name || String(t)) === 'search_code'
        );
        if (searchCodeTool) {
          tasks.push({
            tool: 'search_code',
            purpose: `${query.purpose} - ${this.framework} compliance`,
            parameters: { q: query.q },
          });
        }
      }

      // Get file contents for key security files
      const securityFiles = [
        'package.json', 'requirements.txt', 'Gemfile', 'pom.xml',
        '.env.example', 'docker-compose.yml', 'Dockerfile',
        'serverless.yml', 'terraform.tf', 'cloudformation.yaml',
      ];

      // Find file content tools
      const getFileTool = availableTools.find((t: any) =>
        typeof t === 'string' 
          ? (t.includes('file') || t.includes('contents') || t.includes('get_file'))
          : ((t?.name || String(t))?.includes('file') || (t?.name || String(t))?.includes('contents') || (t?.name || String(t))?.includes('get_file'))
      );

      // Also look for repository listing tools to get actual code files
      const listReposTool = availableTools.find((t: any) =>
        typeof t === 'string'
          ? (t.includes('list_repos') || t.includes('list_repositories'))
          : ((t?.name || String(t))?.includes('list_repos') || (t?.name || String(t))?.includes('list_repositories'))
      );

      if (listReposTool) {
        tasks.push({
          tool: typeof listReposTool === 'string' ? listReposTool : (listReposTool as any)?.name || String(listReposTool),
          purpose: 'List repositories to identify codebase structure',
          parameters: {},
        });
      }

      if (getFileTool) {
        for (const file of securityFiles.slice(0, 5)) {
          tasks.push({
            tool: typeof getFileTool === 'string' ? getFileTool : (getFileTool as any)?.name || String(getFileTool),
            purpose: `Scan ${file} for security misconfigurations`,
            parameters: { path: file },
          });
        }
      }

      // Add task to fetch actual code files for analysis
      // Look for tools that can get file contents from repositories
      const getFileContentsTool = availableTools.find((t: any) =>
        typeof t === 'string'
          ? (t.includes('get_file') || t.includes('get_contents') || t.includes('read_file'))
          : ((t?.name || String(t))?.includes('get_file') || (t?.name || String(t))?.includes('get_contents') || (t?.name || String(t))?.includes('read_file'))
      );

      if (getFileContentsTool) {
        // Add tasks to fetch code files for deep analysis
        const codeFilePatterns = [
          { pattern: '*.js', purpose: 'Analyze JavaScript files for security vulnerabilities' },
          { pattern: '*.ts', purpose: 'Analyze TypeScript files for security vulnerabilities' },
          { pattern: '*.py', purpose: 'Analyze Python files for security vulnerabilities' },
          { pattern: '*.java', purpose: 'Analyze Java files for security vulnerabilities' },
        ];

        for (const pattern of codeFilePatterns.slice(0, 2)) {
          tasks.push({
            tool: typeof getFileContentsTool === 'string' ? getFileContentsTool : (getFileContentsTool as any)?.name || String(getFileContentsTool),
            purpose: pattern.purpose,
            parameters: { pattern: pattern.pattern },
          });
        }
      }
    } else if (serverName === 'aws-core') {
      // AWS-specific compliance scans
      // Get valid region from environment or use default
      const validRegion = process.env.AWS_REGION || 'us-east-1';
      
      const awsSecurityTools = [
        { tool: 'iam_list_users', purpose: 'Check IAM users for MFA and excessive permissions', needsRegion: false },
        { tool: 'iam_list_roles', purpose: 'Check IAM roles for least privilege violations', needsRegion: false },
        { tool: 'iam_list_policies', purpose: 'Review IAM policies for security gaps', needsRegion: false },
        { tool: 's3_list_buckets', purpose: 'Check S3 buckets for public access and encryption', needsRegion: false },
        { tool: 'cloudwatch_describe_log_groups', purpose: 'Verify logging and monitoring coverage', needsRegion: true },
        { tool: 'cloudwatch_logs', purpose: 'Check CloudWatch logs for security events', needsRegion: true },
        { tool: 'ec2_describe_instances', purpose: 'Check EC2 security groups and encryption', needsRegion: true },
      ];

      for (const toolConfig of awsSecurityTools) {
        const tool = availableTools.find((t: any) =>
          typeof t === 'string' ? t === toolConfig.tool : (t?.name || String(t)) === toolConfig.tool
        );
        if (tool) {
          // Set region parameter if tool needs it
          const parameters: any = {};
          if (toolConfig.needsRegion) {
            parameters.region_name = validRegion;
          }
          
          tasks.push({
            tool: toolConfig.tool,
            purpose: `${toolConfig.purpose} - ${this.framework} compliance`,
            parameters,
          });
        }
      }
    } else if (serverName === 'datadog' || serverName === 'dash0' || serverName === 'grafana') {
      // Monitoring and observability servers - check for logs, metrics, and compliance monitoring
      const monitoringTools = [
        { tool: 'get_logs', purpose: 'Check logs for security events and compliance violations' },
        { tool: 'list_metrics', purpose: 'Review metrics for security monitoring coverage' },
        { tool: 'get_metrics', purpose: 'Check security-related metrics (error rates, access patterns)' },
        { tool: 'get_monitors', purpose: 'Verify monitoring and alerting configuration' },
        { tool: 'list_incidents', purpose: 'Review security incidents and response' },
      ];

      for (const toolConfig of monitoringTools) {
        const tool = availableTools.find((t: any) =>
          typeof t === 'string' ? t === toolConfig.tool : (t?.name || String(t)) === toolConfig.tool
        );
        if (tool) {
          tasks.push({
            tool: toolConfig.tool,
            purpose: `${toolConfig.purpose} - ${this.framework} compliance`,
            parameters: {},
          });
        }
      }
    } else if (serverName === 'gcloud') {
      // Google Cloud Platform compliance scans
      const gcpSecurityTools = [
        { tool: 'list_projects', purpose: 'List GCP projects for security review' },
        { tool: 'list_instances', purpose: 'Check compute instances for security configuration' },
        { tool: 'list_buckets', purpose: 'Check Cloud Storage buckets for public access' },
        { tool: 'list_service_accounts', purpose: 'Review service accounts for excessive permissions' },
        { tool: 'get_iam_policy', purpose: 'Check IAM policies for least privilege violations' },
      ];

      for (const toolConfig of gcpSecurityTools) {
        const tool = availableTools.find((t: any) =>
          typeof t === 'string' ? t === toolConfig.tool : (t?.name || String(t)) === toolConfig.tool
        );
        if (tool) {
          tasks.push({
            tool: toolConfig.tool,
            purpose: `${toolConfig.purpose} - ${this.framework} compliance`,
            parameters: {},
          });
        }
      }
    } else if (serverName === 'jenkins') {
      // Jenkins CI/CD compliance scans
      const jenkinsSecurityTools = [
        { tool: 'list_jobs', purpose: 'Review CI/CD jobs for security misconfigurations' },
        { tool: 'get_job_config', purpose: 'Check job configurations for exposed credentials' },
        { tool: 'list_builds', purpose: 'Review build history for security issues' },
      ];

      for (const toolConfig of jenkinsSecurityTools) {
        const tool = availableTools.find((t: any) =>
          typeof t === 'string' ? t === toolConfig.tool : (t?.name || String(t)) === toolConfig.tool
        );
        if (tool) {
          tasks.push({
            tool: toolConfig.tool,
            purpose: `${toolConfig.purpose} - ${this.framework} compliance`,
            parameters: {},
          });
        }
      }
    }

    return { tasks };
  }

  /**
   * Execute an intelligent scan using LLM reasoning
   * Handles tool calls with proper error handling and retries
   * Returns single result or array of results
   */
  private async executeIntelligentScan(
    serverName: string,
    scanTask: { tool: string; purpose: string; parameters: any },
    requirements: string[]
  ): Promise<ComplianceScanResult | ComplianceScanResult[] | null> {
    try {
      // Get tool name (handle both string and object formats)
      let toolName: string;
      if (typeof scanTask.tool === 'string' && scanTask.tool.trim().length > 0) {
        toolName = scanTask.tool.trim();
      } else if (typeof scanTask.tool === 'object' && scanTask.tool !== null && 'name' in scanTask.tool) {
        toolName = String((scanTask.tool as any).name).trim();
      } else {
        toolName = String(scanTask.tool || '').trim();
      }
      
      // Validate tool name before proceeding
      if (!toolName || toolName === 'undefined' || toolName === 'null' || toolName.length === 0) {
        console.error(`[${serverName}] Invalid tool name in scan task:`, scanTask);
        throw new Error(`Invalid tool name: ${toolName}. Scan task must have a valid 'tool' field.`);
      }
      
      // Call the MCP tool with retry logic and rate limit handling
      let toolResult: any = null;
      let retries = 3;
      
      while (retries > 0) {
        try {
          toolResult = await mcpClientManager.callTool(serverName, toolName, scanTask.parameters || {}, this.userId);
          break; // Success
        } catch (error: any) {
          // Handle AWS CloudWatch specific errors gracefully
          if (error.message?.includes('log_group_names') || error.message?.includes('log_group_identifiers') || 
              error.message?.includes('Exactly one of')) {
            console.warn(`[${serverName}] AWS CloudWatch tool parameter error (non-critical): ${error.message}`);
            // This is a tool parameter issue, not a connection issue - skip this tool call
            return null;
          }
          
          // Check if it's a rate limit error
          if (error.message?.includes('rate limit') || error.message?.includes('Rate limit')) {
            console.warn(`[${serverName}] Rate limit hit for tool ${toolName}, waiting before retry...`);
            // Wait longer for rate limits (60 seconds)
            await new Promise(resolve => setTimeout(resolve, 60000));
            retries--;
            if (retries === 0) {
              console.error(`[${serverName}] Rate limit exceeded after retries. Ensure authenticated requests are being used.`);
              throw new Error(`Rate limit exceeded for ${toolName}. Please ensure ${serverName} is using authenticated requests.`);
            }
            continue;
          }
          
          // Check if connection was closed - this will be handled by scanMCPServer
          if (error.message?.includes('closed') || error.message?.includes('not connected') || error.message?.includes('session was closed')) {
            console.warn(`[${serverName}] Connection closed for tool ${toolName}`);
            throw error; // Let scanMCPServer handle reconnection
          }
          
          retries--;
          if (retries === 0) {
            throw error;
          }
          // Wait a bit before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Parse tool result
      if (!toolResult) {
        console.warn(`[${serverName}] Tool ${toolName} returned null/undefined result`);
        return null;
      }
      
      const resultData = this.parseToolResult(toolResult);
      
      if (!resultData || (typeof resultData === 'object' && Object.keys(resultData).length === 0)) {
        console.warn(`[${serverName}] Tool ${toolName} returned empty result`);
        return null;
      }
      
      // Check if this is code content that needs deep analysis
      const purpose = scanTask.purpose || 'Analyze for compliance issues';
      const needsDeepAnalysis = this.shouldUseCloudflareContainer(purpose, resultData);
      
      if (needsDeepAnalysis && process.env.CLOUDFLARE_API_TOKEN) {
        // Use Cloudflare container for deep code analysis
        const deepAnalysis = await this.analyzeWithCloudflareContainer(
          purpose,
          resultData,
          requirements
        );
        
        if (deepAnalysis) {
          return deepAnalysis;
        }
      }
      
      // Use LLM to analyze the result for compliance issues
      const analysis = await this.analyzeForCompliance(
        purpose,
        resultData,
        requirements
      );

      return analysis;
    } catch (error: any) {
      // Don't fail entire scan if one tool fails - log and continue
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.warn(`[${serverName}] Scan task ${scanTask.tool || 'unknown'} failed:`, errorMessage);
      return null;
    }
  }

  /**
   * Analyze tool result for compliance violations using LLM
   * Acts as cybersecurity specialist examining every detail
   * Returns single result or array of results
   */
  private async analyzeForCompliance(
    purpose: string,
    data: any,
    requirements: string[]
  ): Promise<ComplianceScanResult | ComplianceScanResult[] | null> {
    const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
    
    const dataStr = typeof data === 'string' 
      ? (data.length > 8000 ? data.substring(0, 8000) : data)
      : JSON.stringify(data || {}, null, 2).substring(0, 8000);

    // Framework-specific analysis focus
    const analysisFocus: Record<string, string> = {
      SOC2: 'Focus on: access control gaps (CC6.1-6.6), encryption violations (CC8.1-8.2), missing monitoring (CC7.2-7.4)',
      GDPR: 'Focus on: data protection failures (Art. 32), privacy violations (Art. 5-6), missing data subject rights (Art. 15-22)',
      HIPAA: 'Focus on: administrative safeguard gaps (§164.308), technical safeguard failures (§164.312), missing encryption',
      ISO: 'Focus on: ISMS gaps (A.5-A.18), access control failures (A.9), cryptography issues (A.10), operations security (A.12)',
      PCI: 'Focus on: firewall misconfigurations (Req 1), default credentials (Req 2), cardholder data protection (Req 3-4), access restrictions (Req 7-8), monitoring gaps (Req 10)',
    };

    const prompt = `Analyze ${this.framework} compliance scan result.

Purpose: ${purpose}
${analysisFocus[this.framework] || ''}
Requirements: ${requirements.slice(0, 8).join(', ')}

Data: ${dataStr.substring(0, 6000)}

Identify violations:
1. Critical: Hardcoded secrets, weak/missing encryption, missing auth, SQL injection, insecure APIs, exposed data
2. Access Control: Missing controls, excessive permissions, no audit logging, missing MFA
3. Configuration: Public resources, insecure defaults, missing security headers, weak TLS
4. Code Quality: Insecure practices, missing validation, error exposure, insecure dependencies

For each violation: requirement code, status (non-compliant/partial/compliant), evidence (location, code snippet), severity (critical/high/medium/low), finding description, remediation.

Return JSON: {"results": [{"requirement": "CC6.1", "status": "non-compliant", "evidence": [{"source": "github", "type": "code", "location": "src/config.js:42", "content": "...", "lineNumber": 42, "severity": "critical", "finding": "..."}], "recommendation": "..."}]}`;

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `Cybersecurity auditor conducting ${this.framework} compliance assessment. Identify security vulnerabilities and compliance violations with specific evidence, locations, and severity ratings.`,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.warn('[Compliance Analysis] Empty response from LLM');
        return null;
      }
      
      const parsed = JSON.parse(content);
      
      // Handle both single result and array of results
      if (parsed.results && Array.isArray(parsed.results) && parsed.results.length > 0) {
        // Return all results as an array - the calling code will handle it
        return parsed.results as ComplianceScanResult[];
      } else if (parsed.requirement && parsed.evidence && Array.isArray(parsed.evidence) && parsed.evidence.length > 0) {
        return parsed as ComplianceScanResult;
      }
      
      console.warn('[Compliance Analysis] No valid results found in LLM response');
    } catch (error: any) {
      console.error('[Compliance Analysis] Error:', error?.message || error?.toString() || 'Unknown error');
      if (error instanceof SyntaxError) {
        console.error('[Compliance Analysis] JSON parse error - invalid response format');
      }
    }

    return null;
  }

  /**
   * Parse MCP tool result
   */
  private parseToolResult(result: any): any {
    if (!result) return null;

    try {
      if (typeof result === 'object' && !Array.isArray(result)) {
        if (result.content && Array.isArray(result.content)) {
          const textItems = result.content.filter((item: any) => item && item.type === 'text' && item.text);
          if (textItems.length > 0) {
            try {
              const parsed = JSON.parse(textItems[0].text);
              return parsed;
            } catch {
              // If not JSON, return as string
              return textItems[0].text || null;
            }
          }
        }
        return result.data || result;
      }

      // If it's a string, try to parse as JSON
      if (typeof result === 'string') {
        try {
          return JSON.parse(result);
        } catch {
          return result;
        }
      }

      return result;
    } catch (error: any) {
      console.warn('[Parse Tool Result] Error parsing result:', error?.message || error?.toString() || 'Unknown error');
      return result;
    }
  }

  /**
   * Get official documentation URLs for framework
   */
  private getOfficialDocumentationUrls(): string[] {
    const urls: Record<string, string[]> = {
      SOC2: [
        'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html',
        'https://www.vanta.com/resources/soc-2-compliance-guide',
        'https://soc2.com/soc-2-requirements/',
      ],
      GDPR: [
        'https://gdpr.eu/what-is-gdpr/',
        'https://www.gdpr.eu/checklist/',
        'https://gdpr-info.eu/',
      ],
      HIPAA: [
        'https://www.hhs.gov/hipaa/index.html',
        'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
        'https://www.hhs.gov/hipaa/for-professionals/compliance-training/index.html',
      ],
      ISO: [
        'https://www.iso.org/isoiec-27001-information-security.html',
        'https://www.iso.org/standard/54534.html',
        'https://www.iso.org/obp/ui/#iso:std:iso-iec:27001:ed-2:v1:en',
      ],
      PCI: [
        'https://www.pcisecuritystandards.org/document_library/',
        'https://www.pcisecuritystandards.org/pci_security/',
        'https://www.pcisecuritystandards.org/document_library/?category=pcidss&document=pci_dss',
      ],
    };

    return urls[this.framework.toUpperCase()] || [];
  }

  /**
   * Get default regulations if fetch fails
   */
  private getDefaultRegulations(): string[] {
    const defaults: Record<string, string[]> = {
      SOC2: [
        'SOC2 requires logical and physical access controls (CC6.1)',
        'SOC2 requires system operations controls (CC7.2)',
        'SOC2 requires change management controls (CC8.1)',
      ],
      GDPR: [
        'GDPR Article 5 requires lawful basis for processing personal data',
        'GDPR Article 32 requires appropriate security measures',
        'GDPR Article 15-22 grants data subject rights',
      ],
      HIPAA: [
        'HIPAA §164.308 requires administrative safeguards',
        'HIPAA §164.312 requires technical safeguards including access controls',
        'HIPAA requires audit logs and monitoring',
      ],
      ISO: [
        'ISO 27001 requires information security management system (ISMS)',
        'ISO 27001 Annex A.9 requires access control',
        'ISO 27001 Annex A.10 requires cryptography',
        'ISO 27001 Annex A.12 requires operations security',
      ],
      PCI: [
        'PCI DSS Requirement 1: Install and maintain firewall configuration',
        'PCI DSS Requirement 2: Do not use vendor-supplied defaults',
        'PCI DSS Requirement 3: Protect stored cardholder data',
        'PCI DSS Requirement 4: Encrypt transmission of cardholder data',
        'PCI DSS Requirement 7: Restrict access to cardholder data',
        'PCI DSS Requirement 8: Identify and authenticate access',
        'PCI DSS Requirement 10: Track and monitor network access',
      ],
    };

    return defaults[this.framework.toUpperCase()] || [];
  }

  /**
   * Get default requirements if extraction fails
   */
  /**
   * Fetch requirements from web using Perplexity, Firecrawl, and Browserbase
   */
  private async fetchRequirementsFromWeb(): Promise<string[]> {
    const requirements: string[] = [];
    
    try {
      // Use Perplexity for web research
      const perplexityKey = process.env.PERPLEXITY_API_KEY;
      if (perplexityKey) {
        try {
          const { PerplexityClient } = await import('@/lib/api-clients/perplexity');
          const perplexityClient = new PerplexityClient(perplexityKey);
          
          const query = `${this.framework} compliance requirements controls criteria official documentation 2024`;
          const researchResult = await perplexityClient.search(query);
          
          if (researchResult && researchResult.trim().length > 100) {
            // Extract requirements from research result using LLM
            const extracted = await this.extractRequirementsFromText(researchResult);
            requirements.push(...extracted);
            
            // Store in vector store for future use
            const perplexityChunks = ChunkingStrategy.createChunks(
              researchResult.length > 10000 ? researchResult.substring(0, 10000) : researchResult,
              {
                source: 'perplexity',
                type: 'requirement',
                framework: this.framework,
              },
              'semantic'
            );
            await this.vectorStore.storeChunks(perplexityChunks);
          }
        } catch (error: any) {
          console.warn('[Requirements] Perplexity search failed:', error?.message || error?.toString() || 'Unknown error');
        }
      }
      
      // Use Firecrawl to scrape official documentation
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (firecrawlKey) {
        try {
          const { FirecrawlClient } = await import('@/lib/api-clients/firecrawl');
          const firecrawlClient = new FirecrawlClient(firecrawlKey);
          
          const docUrls = this.getOfficialDocumentationUrls();
          for (const url of docUrls.slice(0, 3)) {
            try {
              const scraped = await firecrawlClient.scrape(url);
              if (scraped && scraped.trim().length > 100) {
                const extracted = await this.extractRequirementsFromText(scraped);
                requirements.push(...extracted);
                
                // Store in vector store
                const firecrawlChunks = ChunkingStrategy.createChunks(
                  scraped.length > 5000 ? scraped.substring(0, 5000) : scraped,
                  {
                    source: 'firecrawl',
                    type: 'requirement',
                    framework: this.framework,
                  },
                  'semantic'
                );
                await this.vectorStore.storeChunks(firecrawlChunks);
              }
            } catch (err: any) {
              console.warn(`[Requirements] Firecrawl failed for ${url}:`, err?.message || err?.toString() || 'Unknown error');
            }
          }
        } catch (error: any) {
          console.warn('[Requirements] Firecrawl failed:', error?.message || error?.toString() || 'Unknown error');
        }
      }
      
      // Deduplicate requirements
      const uniqueRequirements = Array.from(new Set(requirements));
      return uniqueRequirements;
    } catch (error: any) {
      console.error('[Requirements] Error fetching from web:', error);
      return [];
    }
  }

  /**
   * Extract requirements from text using LLM
   */
  private async extractRequirementsFromText(text: string): Promise<string[]> {
    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a compliance expert. Extract all ${this.framework} compliance requirements, controls, and criteria from the provided text. Return a JSON object with a "requirements" array of requirement codes/identifiers (e.g., "CC6.1", "Article 32", "§164.308").`,
          },
          {
            role: 'user',
            content: `Extract all ${this.framework} compliance requirements from this text:\n\n${text && typeof text === 'string' ? (text.length > 8000 ? text.substring(0, 8000) : text) : ''}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      return parsed.requirements || parsed.items || [];
    } catch (error: any) {
      console.warn('[Requirements] Error extracting from text:', error?.message || error?.toString() || 'Unknown error');
      return [];
    }
  }

  /**
   * Save important findings to memory (Redis + Mem0) as they're discovered
   * Prioritizes critical/high severity findings and non-compliant items
   */
  private async saveImportantFindingsToMemory(scanResults: ComplianceScanResult[]): Promise<void> {
    try {
      // Filter for important findings:
      // 1. Critical or high severity
      // 2. Non-compliant or partial compliance status
      // 3. Has evidence
      const importantFindings = scanResults.filter(scan => {
        const isImportantSeverity = scan.evidence.some(ev => 
          ev.severity === 'critical' || ev.severity === 'high'
        );
        const isNonCompliant = scan.status === 'non-compliant' || scan.status === 'partial';
        const hasEvidence = scan.evidence && scan.evidence.length > 0;
        
        return (isImportantSeverity || isNonCompliant) && hasEvidence;
      });

      // Sort by severity (critical first, then high, then others)
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      importantFindings.sort((a, b) => {
        const aSeverities = a.evidence.map(e => severityOrder[e.severity] || 3);
        const bSeverities = b.evidence.map(e => severityOrder[e.severity] || 3);
        const aMaxSeverity = aSeverities.length > 0 ? Math.min(...aSeverities) : 3;
        const bMaxSeverity = bSeverities.length > 0 ? Math.min(...bSeverities) : 3;
        return aMaxSeverity - bMaxSeverity;
      });

      // Save top 10 most important findings to memory (reduced from 20 to prevent Redis OOM)
      const findingsToSave = importantFindings.slice(0, 10);

      for (const scan of findingsToSave) {
        // Get the most critical evidence
        const criticalEvidence = scan.evidence
          .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
          .slice(0, 3); // Top 3 most critical evidence items

        // Build comprehensive finding description
        const evidenceSummary = criticalEvidence.map((ev, idx) => {
          const content = typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content || '');
          const truncatedContent = content.length > 500 ? content.substring(0, 500) + '...' : content;
          return `Evidence ${idx + 1}:\n- Type: ${ev.type}\n- Source: ${ev.source}\n- Location: ${ev.location}\n- Severity: ${ev.severity}\n- Finding: ${ev.finding}\n- Content: ${truncatedContent}`;
        }).join('\n\n');

        const findingDescription = `Compliance Finding: ${scan.requirement}\n\nStatus: ${scan.status}\n\n${evidenceSummary}${scan.recommendation ? `\n\nRecommendation: ${scan.recommendation}` : ''}`;

        // Save to memory using the existing rememberFinding method (with error handling for Redis OOM)
        if (criticalEvidence.length > 0) {
          try {
            await this.memory.rememberFinding({
              title: `${scan.requirement}: ${criticalEvidence[0].finding || 'Compliance issue detected'}`,
              description: findingDescription.substring(0, 2000), // Limit description length
              severity: criticalEvidence[0].severity || 'medium',
              requirementCode: scan.requirement,
            });
          } catch (memoryError: any) {
            // Memory is optional - don't break workflow if Redis fails
            if (memoryError?.message?.includes('OOM') || memoryError?.message?.includes('maxmemory')) {
              console.warn(`[Memory] Redis OOM - skipping finding save for ${scan.requirement}`);
            } else {
              console.warn(`[Memory] Failed to save finding:`, memoryError?.message || memoryError);
            }
          }
        }

        // Also save detailed evidence to memory for recall (limit to 1 evidence per finding to reduce memory)
        for (const ev of criticalEvidence.slice(0, 1)) {
          try {
            const content = typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content || '');
            // Limit content to 1000 chars to prevent Redis OOM
            const truncatedContent = content.length > 1000 ? content.substring(0, 1000) + '...' : content;
            const evidenceContent = `Evidence for ${scan.requirement}:\n\nType: ${ev.type}\nSource: ${ev.source}\nLocation: ${ev.location}\nLine: ${ev.lineNumber || 'N/A'}\n\nFinding: ${ev.finding}\n\nCode/Content:\n${truncatedContent}`;

            await this.memory.remember(
              evidenceContent.substring(0, 2000), // Limit total length to prevent OOM
              'evidence',
              {
                requirement: scan.requirement,
                severity: ev.severity,
                type: ev.type,
                source: ev.source,
                location: ev.location,
                lineNumber: ev.lineNumber,
                framework: this.framework,
              }
            );
          } catch (evidenceError: any) {
            // Memory is optional - don't break workflow if Redis fails
            if (evidenceError?.message?.includes('OOM') || evidenceError?.message?.includes('maxmemory')) {
              console.warn(`[Memory] Redis OOM - skipping evidence save for ${scan.requirement}`);
            } else {
              console.warn(`[Memory] Failed to save evidence:`, evidenceError?.message || evidenceError);
            }
          }
        }
      }

      console.log(`[Memory] Saved ${findingsToSave.length} important findings to memory (Redis + Mem0)`);
    } catch (error: any) {
      // Memory is optional - don't break the scan process
      console.warn(`[Memory] Failed to save findings to memory:`, error.message);
    }
  }

  private getDefaultRequirements(): string[] {
    const defaults: Record<string, string[]> = {
      SOC2: ['CC6.1', 'CC6.2', 'CC6.6', 'CC7.2', 'CC7.3', 'CC8.1', 'CC1.1', 'CC1.2', 'CC2.1', 'CC3.1', 'CC4.1', 'CC5.1'],
      GDPR: ['Article 5', 'Article 6', 'Article 32', 'Article 15', 'Article 17', 'Article 25', 'Article 33', 'Article 35'],
      HIPAA: ['§164.308', '§164.310', '§164.312', '§164.314', '§164.316'],
      ISO: ['A.9.1.1', 'A.9.2.1', 'A.10.1.1', 'A.12.1.1', 'A.12.2.1', 'A.14.1.1', 'A.5.1.1', 'A.6.1.1', 'A.7.1.1'],
      PCI: ['Req 1', 'Req 2', 'Req 3', 'Req 4', 'Req 7', 'Req 8', 'Req 10', 'Req 11', 'Req 12'],
    };

    return defaults[this.framework.toUpperCase()] || [];
  }

  /**
   * Determine if Cloudflare container should be used for deep analysis
   */
  private shouldUseCloudflareContainer(purpose: string, data: any): boolean {
    // Use container for code analysis tasks
    if (!purpose || typeof purpose !== 'string') {
      return false;
    }
    
    const codeAnalysisKeywords = ['code', 'file', 'source', 'repository', 'programming', 'script'];
    const purposeLower = purpose.toLowerCase();
    
    if (codeAnalysisKeywords.some(keyword => purposeLower.includes(keyword))) {
      // Check if data contains code-like content
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      const codeIndicators = ['function', 'class', 'import', 'export', 'const ', 'let ', 'var ', 'def ', 'public ', 'private '];
      
      return codeIndicators.some(indicator => dataStr.includes(indicator));
    }
    
    return false;
  }

  /**
   * Analyze code using Cloudflare Sandbox Container for deep analysis
   * Only used when code content is detected and Cloudflare API token is available
   */
  private async analyzeWithCloudflareContainer(
    purpose: string,
    codeData: any,
    requirements: string[]
  ): Promise<ComplianceScanResult | ComplianceScanResult[] | null> {
    try {
      const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!cloudflareToken) {
        console.warn('[Cloudflare Container] API token not available, skipping deep analysis');
        return null;
      }

      console.log('[Cloudflare Container] Starting deep code analysis...');
      
      // Connect to Cloudflare container MCP server
      const containerCredentials = {
        apiToken: cloudflareToken,
      };

      try {
        await mcpClientManager.connect('cloudflare-container', { ...containerCredentials, userId: this.userId });
        const tools = await mcpClientManager.listTools('cloudflare-container', this.userId);
        
        if (!tools || tools.length === 0) {
          console.warn('[Cloudflare Container] No tools available');
          return null;
        }

        // Prepare code content for analysis
        const codeContent = typeof codeData === 'string' 
          ? codeData.substring(0, 50000) // Limit size
          : JSON.stringify(codeData, null, 2).substring(0, 50000);

        // Look for container execution tools
        const executeTool = tools.find((t: any) => {
          const toolName = typeof t === 'string' ? t : (t?.name || String(t));
          return toolName.includes('execute') || toolName.includes('run') || toolName.includes('analyze');
        });

        if (executeTool) {
          const toolName = typeof executeTool === 'string' ? executeTool : (executeTool as any)?.name || String(executeTool);
          
          // Create analysis script
          const analysisScript = `
# Deep Security Analysis Script
# Framework: ${this.framework}
# Requirements: ${requirements.slice(0, 10).join(', ')}

import ast
import re
import json

code_content = """${codeContent.replace(/"""|''/g, '')}"""

findings = []

# Check for hardcoded secrets
secret_patterns = [
    r'api[_-]?key["\']?\s*[:=]\s*["\']([^"\']+)["\']',
    r'password["\']?\s*[:=]\s*["\']([^"\']+)["\']',
    r'secret["\']?\s*[:=]\s*["\']([^"\']+)["\']',
    r'token["\']?\s*[:=]\s*["\']([^"\']+)["\']',
]

for pattern in secret_patterns:
    matches = re.finditer(pattern, code_content, re.IGNORECASE)
    for match in matches:
        findings.append({
            "type": "hardcoded_secret",
            "severity": "critical",
            "location": f"Line {code_content[:match.start()].count(chr(10)) + 1}",
            "content": match.group(0)[:100],
        })

# Check for SQL injection vulnerabilities
sql_patterns = [
    r'SELECT.*%s|SELECT.*\\+.*FROM',
    r'query.*\\+.*SELECT',
    r'execute.*\\+.*SELECT',
]

for pattern in sql_patterns:
    if re.search(pattern, code_content, re.IGNORECASE):
        findings.append({
            "type": "sql_injection_risk",
            "severity": "high",
            "location": "Multiple locations",
            "content": "Potential SQL injection vulnerability detected",
        })

print(json.dumps({"findings": findings, "framework": "${this.framework}"}))
`;

          // Execute analysis in container
          const result = await mcpClientManager.callTool('cloudflare-container', toolName, {
            script: analysisScript,
            language: 'python',
          }, this.userId);

          const containerResult = this.parseToolResult(result);
          
          if (containerResult && containerResult.findings && Array.isArray(containerResult.findings) && containerResult.findings.length > 0) {
            // Convert container findings to compliance scan results
            const scanResults: ComplianceScanResult[] = containerResult.findings
              .filter((finding: any) => finding && typeof finding === 'object')
              .map((finding: any) => ({
                requirement: (requirements && requirements.length > 0) ? requirements[0] : 'Unknown',
                status: 'non-compliant' as const,
                evidence: [{
                  source: 'cloudflare-container',
                  type: 'code' as const,
                  location: finding.location || 'Unknown',
                  content: finding.content || '',
                  severity: (finding.severity && ['critical', 'high', 'medium', 'low'].includes(finding.severity)) 
                    ? finding.severity as 'critical' | 'high' | 'medium' | 'low'
                    : 'medium' as const,
                  finding: finding.type || 'Security issue detected',
                }],
                recommendation: `Address ${finding.type || 'security issue'} in code review`,
              }));

            console.log(`[Cloudflare Container] Found ${scanResults.length} issues via deep analysis`);
            return scanResults.length > 0 ? scanResults : null;
          }
        }
      } catch (containerError: any) {
        console.warn('[Cloudflare Container] Analysis failed:', containerError?.message || containerError?.toString() || 'Unknown error');
        // Fall back to regular LLM analysis
        return null;
      }
    } catch (error: any) {
      console.warn('[Cloudflare Container] Error:', error?.message || error?.toString() || 'Unknown error');
      // Fall back to regular LLM analysis
      return null;
    }

    return null;
  }
}

