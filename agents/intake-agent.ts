/**
 * Intake Agent
 * Crawls codebase, infrastructure, and documentation using MCP tools
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { mcpClientManager } from '@/mcp/client';
import { ChunkingStrategy } from '@/lib/rag';
import { AgentState, CodebaseData } from './types';

export class IntakeAgent {
  private projectId: string;
  private repoUrl?: string;

  constructor(projectId: string, repoUrl?: string) {
    this.projectId = projectId;
    this.repoUrl = repoUrl;
  }

  /**
   * Create the intake agent graph
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

    workflow.addNode('crawl_codebase', this.crawlCodebase.bind(this));
    workflow.addNode('crawl_infrastructure', this.crawlInfrastructure.bind(this));
    workflow.addNode('crawl_documentation', this.crawlDocumentation.bind(this));
    workflow.addNode('process_data', this.processData.bind(this));

    workflow.addEdge(START, 'crawl_codebase');
    workflow.addEdge('crawl_codebase', 'crawl_infrastructure');
    workflow.addEdge('crawl_infrastructure', 'crawl_documentation');
    workflow.addEdge('crawl_documentation', 'process_data');
    workflow.addEdge('process_data', END);

    return workflow.compile();
  }

  /**
   * Crawl codebase using GitHub MCP
   */
  private async crawlCodebase(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Crawling codebase...';
      state.status = 'running';

      // Connect to GitHub MCP server
      const githubToken = process.env.GITHUB_TOKEN; // In production, get from session
      if (!githubToken) {
        throw new Error('GitHub token not available');
      }

      await mcpClientManager.connect('github', githubToken);

      // List repositories
      const repos = await mcpClientManager.callTool('github', 'list_repos', {});
      
      // Get repository contents
      const repoUrl = this.repoUrl || repos[0]?.url;
      if (!repoUrl) {
        throw new Error('No repository found');
      }

      const [owner, repo] = this.extractRepoInfo(repoUrl);
      const contents = await mcpClientManager.callTool('github', 'get_contents', {
        owner,
        repo,
        path: '',
      });

      // Get file contents for relevant files
      const codeFiles: CodebaseData['files'] = [];
      const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.yaml', '.yml', '.json', '.tf'];

      for (const item of contents.slice(0, 100)) { // Limit to 100 files
        if (item.type === 'file' && relevantExtensions.some(ext => item.path.endsWith(ext))) {
          try {
            const fileContent = await mcpClientManager.callTool('github', 'get_file', {
              owner,
              repo,
              filePath: item.path,
            });

            codeFiles.push({
              path: item.path,
              content: fileContent.content,
              language: this.detectLanguage(item.path),
              lines: fileContent.lines || 0,
            });
          } catch (error) {
            console.error(`Error reading file ${item.path}:`, error);
          }
        }
      }

      return {
        data: {
          ...state.data,
          codebase: {
            files: codeFiles,
            infrastructure: [],
            documentation: [],
          },
        },
        toolCalls: [
          ...state.toolCalls,
          {
            id: `tool-${Date.now()}`,
            agent: 'intake',
            tool: 'github_get_contents',
            parameters: { owner, repo },
            status: 'success',
            timestamp: new Date(),
          },
        ],
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Codebase crawl error: ${error.message}`],
        toolCalls: [
          ...state.toolCalls,
          {
            id: `tool-${Date.now()}`,
            agent: 'intake',
            tool: 'github_get_contents',
            parameters: {},
            status: 'error',
            timestamp: new Date(),
            error: error.message,
          },
        ],
      };
    }
  }

  /**
   * Crawl infrastructure configs
   */
  private async crawlInfrastructure(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Analyzing infrastructure...';

      const infrastructure: CodebaseData['infrastructure'] = [];
      const codebase = state.data.codebase;

      if (codebase) {
        // Look for infrastructure as code files
        const iacFiles = codebase.files.filter((f) =>
          f.path.match(/\.(tf|yaml|yml|json)$/) &&
          (f.path.includes('terraform') || f.path.includes('cloudformation') || f.path.includes('kubernetes'))
        );

        for (const file of iacFiles) {
          infrastructure.push({
            type: this.detectInfrastructureType(file.path),
            config: file.content,
            source: file.path,
          });
        }

        // Use Cloudflare MCP if available
        try {
          const cloudflareToken = process.env.CLOUDFLARE_TOKEN;
          if (cloudflareToken) {
            await mcpClientManager.connect('cloudflare', cloudflareToken);
            const resources = await mcpClientManager.callTool('cloudflare', 'list_resources', {});
            infrastructure.push(...resources.map((r: any) => ({
              type: 'cloudflare',
              config: r,
              source: 'cloudflare-api',
            })));
          }
        } catch (error) {
          console.error('Cloudflare MCP error:', error);
        }
      }

      return {
        data: {
          ...state.data,
          codebase: {
            ...codebase!,
            infrastructure,
          },
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Infrastructure crawl error: ${error.message}`],
      };
    }
  }

  /**
   * Crawl documentation
   */
  private async crawlDocumentation(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Gathering documentation...';

      const documentation: CodebaseData['documentation'] = [];
      const codebase = state.data.codebase;

      if (codebase) {
        // Look for README, docs, etc.
        const docFiles = codebase.files.filter((f) =>
          f.path.match(/\.(md|txt)$/i) || f.path.toLowerCase().includes('readme')
        );

        for (const file of docFiles) {
          documentation.push({
            title: file.path.split('/').pop() || 'Documentation',
            content: file.content,
            source: file.path,
          });
        }
      }

      return {
        data: {
          ...state.data,
          codebase: {
            ...codebase!,
            documentation,
          },
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Documentation crawl error: ${error.message}`],
      };
    }
  }

  /**
   * Process and chunk the collected data
   */
  private async processData(state: AgentState): Promise<Partial<AgentState>> {
    state.currentStep = 'Processing collected data...';
    state.status = 'completed';
    return {};
  }

  private extractRepoInfo(repoUrl: string): [string, string] {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return [match[1], match[2].replace('.git', '')];
    }
    throw new Error('Invalid repository URL');
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      java: 'java',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
    };
    return langMap[ext || ''] || 'unknown';
  }

  private detectInfrastructureType(filePath: string): string {
    if (filePath.includes('terraform')) return 'terraform';
    if (filePath.includes('cloudformation')) return 'cloudformation';
    if (filePath.includes('kubernetes') || filePath.includes('k8s')) return 'kubernetes';
    return 'unknown';
  }
}

