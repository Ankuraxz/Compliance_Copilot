/**
 * Extraction Agents for Agent Swarm
 * Each agent specializes in extracting information from specific MCP tools
 */

import { mcpClientManager } from '@/mcp/client';
import { AgentMemory } from '@/lib/memory';
import { AgentState } from '../types';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

// Ensure MCP servers are registered before use
// This is safe to call multiple times - registerServer is idempotent
if (typeof window === 'undefined') {
  // Only register on server side
  try {
    registerAllMCPServers(mcpClientManager);
  } catch (error) {
    // Ignore if already registered
    console.debug('MCP servers registration:', error);
  }
}

export interface ExtractionResult {
  agent: string;
  source: string;
  data: any;
  evidence: Array<{
    type: string;
    content: string;
    metadata: Record<string, any>;
  }>;
  timestamp: Date;
}

/**
 * AWS Extraction Agent
 * Extracts cloud infrastructure, deployment, and database information
 */
export class AWSExtractionAgent {
  private memory: AgentMemory;
  private framework?: string;

  constructor(projectId: string, sessionId: string, framework?: string) {
    this.memory = new AgentMemory('aws-extraction', projectId, sessionId);
    this.framework = framework;
  }

  async extract(credentials: any): Promise<ExtractionResult> {
    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      infrastructure: [],
      deployments: [],
      databases: [],
      services: [],
    };

    try {
      const client = await mcpClientManager.connect('aws-core', credentials);
      const tools = await mcpClientManager.listTools('aws-core');

      if (!tools || tools.length === 0) {
        console.warn('AWS MCP server returned no tools. MCP integration may not be fully implemented.');
        // Return empty result instead of failing
        return {
          agent: 'aws-extraction',
          source: 'aws-core',
          data,
          evidence,
          timestamp: new Date(),
        };
      }

      // Helper to get tool name
      const getToolName = (t: any): string => typeof t === 'string' ? t : t.name || String(t);
      const toolNames = tools.map((t: any) => getToolName(t));
      
      // Log available tools for debugging
      console.log('Available AWS MCP tools:', toolNames);

      // Use prompt_understanding to analyze AWS infrastructure
      const promptTool = tools.find((t: any) => getToolName(t) === 'prompt_understanding');

      if (promptTool) {
        try {
          // Use cybersecurity-focused prompt
          const { getAWSExtractionPrompt } = await import('@/lib/prompts/cybersecurity-prompts');
          const framework = this.framework || 'SOC2';
          const understanding = await mcpClientManager.callTool('aws-core', 'prompt_understanding', {
            prompt: getAWSExtractionPrompt(framework),
          });

          // Handle MCP response format
          let understandingData: any = understanding;
          if (understanding && typeof understanding === 'object') {
            // MCP SDK returns content array
            if (Array.isArray(understanding)) {
              understandingData = understanding;
            } else if (understanding.content) {
              understandingData = Array.isArray(understanding.content) 
                ? understanding.content.map((item: any) => item.text || item).join('\n')
                : understanding.content;
            } else if (understanding.data) {
              understandingData = understanding.data;
            } else if (understanding.text) {
              understandingData = understanding.text;
            }
          }

          if (understandingData && JSON.stringify(understandingData) !== '{}' && understandingData !== '') {
            const contentStr = typeof understandingData === 'string' 
              ? understandingData 
              : JSON.stringify(understandingData, null, 2);
            
            evidence.push({
              type: 'aws_analysis',
              content: contentStr.substring(0, 10000), // Limit size
              metadata: { tool: 'prompt_understanding' },
            });

            // Try to parse infrastructure items from the response
            // Look for common AWS resource patterns
            const resourcePatterns = [
              /EC2.*?instances?[:\s]+(\d+)/i,
              /S3.*?buckets?[:\s]+(\d+)/i,
              /RDS.*?databases?[:\s]+(\d+)/i,
              /Lambda.*?functions?[:\s]+(\d+)/i,
            ];

            for (const pattern of resourcePatterns) {
              const match = contentStr.match(pattern);
              if (match) {
                data.infrastructure.push({
                  type: pattern.source.split('.*?')[0].toLowerCase(),
                  count: parseInt(match[1]) || 0,
                });
              }
            }
          }
        } catch (toolError: any) {
          console.warn(`AWS prompt_understanding tool failed:`, toolError.message);
        }
      }

      // Extract specific AWS resources for compliance assessment
      // Use direct tool calls for IAM, CloudWatch, EC2, Lambda, S3, RDS
      const complianceRelevantTools: Array<{ toolName: string; service: string; operation: string; description: string }> = [
        // IAM - Critical for access control compliance
        { toolName: 'iam_list_users', service: 'iam', operation: 'ListUsers', description: 'IAM Users' },
        { toolName: 'iam_list_roles', service: 'iam', operation: 'ListRoles', description: 'IAM Roles' },
        { toolName: 'iam_list_policies', service: 'iam', operation: 'ListPolicies', description: 'IAM Policies' },
        // CloudWatch - For monitoring and logging compliance
        { toolName: 'cloudwatch_describe_log_groups', service: 'cloudwatch', operation: 'DescribeLogGroups', description: 'CloudWatch Log Groups' },
        { toolName: 'cloudwatch_get_active_alarms', service: 'cloudwatch', operation: 'DescribeAlarms', description: 'CloudWatch Alarms' },
        // EC2 - Infrastructure compliance
        { toolName: 'ec2_describe_instances', service: 'ec2', operation: 'DescribeInstances', description: 'EC2 Instances' },
        // Lambda - Serverless compliance
        { toolName: 'lambda_list_functions', service: 'lambda', operation: 'ListFunctions', description: 'Lambda Functions' },
        // S3 - Data storage compliance
        { toolName: 's3_list_buckets', service: 's3', operation: 'ListBuckets', description: 'S3 Buckets' },
        // RDS - Database compliance
        { toolName: 'rds_describe_db_instances', service: 'rds', operation: 'DescribeDBInstances', description: 'RDS Instances' },
      ];

      // Try direct tool calls in parallel batches for better performance
      const toolBatches = [];
      for (let i = 0; i < complianceRelevantTools.length; i += 3) {
        toolBatches.push(complianceRelevantTools.slice(i, i + 3));
      }

      // Process batches sequentially to avoid rate limits, but tools within batch in parallel
      for (const batch of toolBatches.slice(0, 3)) { // Limit to 3 batches (9 tools max)
        await Promise.allSettled(
          batch.map(async (toolConfig) => {
            const directTool = tools.find((t: any) => getToolName(t) === toolConfig.toolName);
            if (!directTool) return;

            try {
              const toolName = getToolName(directTool);
              const result = await mcpClientManager.callTool('aws-core', toolName, {});
              
              // Optimized response parsing
              let resultData: any = null;
              if (result) {
                if (typeof result === 'object' && !Array.isArray(result)) {
                  if (result.Users || result.Roles || result.Policies || result.LogGroups || 
                      result.MetricAlarms || result.Reservations || result.Functions || 
                      result.Buckets || result.DBInstances) {
                    resultData = result;
                  } else if (result.content && Array.isArray(result.content)) {
                    const textItems = result.content.filter((item: any) => item.type === 'text');
                    if (textItems.length > 0 && textItems[0].text) {
                      try {
                        resultData = typeof textItems[0].text === 'string' 
                          ? JSON.parse(textItems[0].text) 
                          : textItems[0].text;
                      } catch {
                        resultData = result;
                      }
                    }
                  } else if (result.data) {
                    resultData = result.data;
                  } else {
                    resultData = result;
                  }
                } else if (Array.isArray(result)) {
                  resultData = result;
                } else if (typeof result === 'string') {
                  try {
                    resultData = JSON.parse(result);
                  } catch {
                    resultData = result;
                  }
                }
              }

              if (resultData && (Array.isArray(resultData) || (typeof resultData === 'object' && Object.keys(resultData).length > 0))) {
                data.infrastructure.push({
                  type: toolConfig.service,
                  operation: toolConfig.operation,
                  description: toolConfig.description,
                  data: resultData,
                });
                
                evidence.push({
                  type: 'aws_resource',
                  content: typeof resultData === 'string' ? resultData : JSON.stringify(resultData).substring(0, 5000),
                  metadata: { service: toolConfig.service, operation: toolConfig.operation },
                });
              }
            } catch (toolError: any) {
              console.warn(`AWS ${toolConfig.toolName} failed:`, toolError.message);
            }
          })
        );
      }

      // Fallback: Try using aws_api_call_aws for services not covered by direct tools
      const awsApiTool = tools.find((t: any) => getToolName(t) === 'aws_api_call_aws');
      if (awsApiTool) {
        const missingServices = ['s3', 'rds', 'ec2', 'lambda'].filter(service => 
          !data.infrastructure.some((item: any) => item.type === service)
        );
        
        for (const service of missingServices.slice(0, 2)) { // Limit to 2
          try {
            const resources = await mcpClientManager.callTool('aws-core', 'aws_api_call_aws', {
              service,
              operation: service === 'ec2' ? 'DescribeInstances' 
                      : service === 's3' ? 'ListBuckets'
                      : service === 'rds' ? 'DescribeDBInstances'
                      : 'ListFunctions',
              parameters: {},
            });

            // Handle MCP response format more carefully
            let resourcesData: any = resources;
            if (resources && typeof resources === 'object') {
              if (resources.content) {
                if (Array.isArray(resources.content)) {
                  const textContent = resources.content
                    .filter((item: any) => item.type === 'text')
                    .map((item: any) => item.text)
                    .join('\n');
                  if (textContent) {
                    try {
                      resourcesData = JSON.parse(textContent);
                    } catch {
                      resourcesData = textContent;
                    }
                  }
                } else {
                  resourcesData = resources.content;
                }
              } else if (resources.data) {
                resourcesData = resources.data;
              } else if (resources.text) {
                try {
                  resourcesData = JSON.parse(resources.text);
                } catch {
                  resourcesData = resources.text;
                }
              }
            }

            if (resourcesData && (Array.isArray(resourcesData) || (typeof resourcesData === 'object' && Object.keys(resourcesData).length > 0))) {
              data.infrastructure.push({
                type: service,
                data: resourcesData,
              });
            }
          } catch (resourceError: any) {
            console.warn(`AWS ${service} listing failed:`, resourceError.message);
            // Continue with other services
          }
        }
      }

      await this.memory.remember(
        `AWS extraction completed. Found ${data.infrastructure.length} infrastructure items`,
        'extraction',
        { source: 'aws-core' }
      );

      return {
        agent: 'aws-extraction',
        source: 'aws-core',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error('AWS extraction error:', errorMessage);
      throw new Error(`AWS extraction failed: ${errorMessage}`);
    }
  }
}

/**
 * GitHub Extraction Agent
 * Extracts codebase structure, security issues, and dependencies
 */
export class GitHubExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('github-extraction', projectId, sessionId);
  }

  async extract(credentials: any): Promise<ExtractionResult> {
    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      repositories: [],
      files: [],
      dependencies: [],
      securityIssues: [],
    };

    try {
      const client = await mcpClientManager.connect('github', credentials);
      const tools = await mcpClientManager.listTools('github');

      if (!tools || tools.length === 0) {
        console.warn('GitHub MCP server returned no tools. MCP integration may not be fully implemented.');
        // Return empty result instead of failing
        return {
          agent: 'github-extraction',
          source: 'github',
          data,
          evidence,
          timestamp: new Date(),
        };
      }

      // Log available tools for debugging
      const toolNames = tools.map((t: any) => typeof t === 'string' ? t : t.name || t);
      console.log('Available GitHub MCP tools:', toolNames);

      // Helper to get tool name (handle both string and object formats)
      const getToolName = (t: any): string => typeof t === 'string' ? t : t.name || String(t);
      
      // Find the correct tool name for listing/searching repositories
      // GitHub MCP has 'search_repositories' which requires a query parameter
      const searchReposTool = tools.find((t: any) => getToolName(t) === 'search_repositories');
      const listReposTool = tools.find((t: any) => {
        const name = getToolName(t);
        return name === 'list_repos' || 
               name === 'list_repositories' || 
               name === 'list_repos_in_cache' ||
               name === 'get_repos' ||
               name === 'repos';
      });

      let repos: any[] = [];

      // Try search_repositories first (most common in GitHub MCP)
      if (searchReposTool) {
        try {
          const toolName = getToolName(searchReposTool);
          // Search for repositories - try different query formats
          let reposResult: any;
          try {
            // Try with user query first
            reposResult = await mcpClientManager.callTool('github', toolName, {
              query: 'user:@me',
              sort: 'updated',
              order: 'desc',
              per_page: 10,
            });
          } catch (error: any) {
            // If that fails, try a simpler query
            try {
              reposResult = await mcpClientManager.callTool('github', toolName, {
                query: 'stars:>0', // Get popular repos as fallback
                per_page: 10,
              });
            } catch (fallbackError: any) {
              console.warn('GitHub search_repositories failed with both queries:', fallbackError.message);
              reposResult = null;
            }
          }
          
          // Handle different response formats
          if (reposResult) {
            if (Array.isArray(reposResult)) {
              repos = reposResult;
            } else if (reposResult?.items && Array.isArray(reposResult.items)) {
              repos = reposResult.items;
            } else if (reposResult?.repositories && Array.isArray(reposResult.repositories)) {
              repos = reposResult.repositories;
            } else if (reposResult?.content) {
              // MCP SDK format - content is an array of text/image objects
              if (Array.isArray(reposResult.content)) {
                // Try to parse JSON from text content
                for (const item of reposResult.content) {
                  if (item.type === 'text' && item.text) {
                    try {
                      const parsed = JSON.parse(item.text);
                      if (Array.isArray(parsed)) {
                        repos = parsed;
                        break;
                      } else if (parsed.items && Array.isArray(parsed.items)) {
                        repos = parsed.items;
                        break;
                      } else if (parsed.repositories && Array.isArray(parsed.repositories)) {
                        repos = parsed.repositories;
                        break;
                      }
                    } catch {
                      // Not JSON, continue
                    }
                  }
                }
              }
            } else if (reposResult?.data) {
              repos = Array.isArray(reposResult.data) ? reposResult.data : [];
            } else if (typeof reposResult === 'object' && reposResult !== null) {
              // Try to extract array from any property
              const values = Object.values(reposResult);
              repos = values.find((v: any) => Array.isArray(v)) || [];
            }
          }

          data.repositories = repos;
        } catch (searchError: any) {
          console.warn('GitHub search_repositories failed, trying alternative:', searchError.message);
        }
      }

      // Fallback to list tool if search didn't work
      if (repos.length === 0 && listReposTool) {
        try {
          const toolName = getToolName(listReposTool);
          const reposResult = await mcpClientManager.callTool('github', toolName, {});
          
          // Handle different response formats
          if (Array.isArray(reposResult)) {
            repos = reposResult;
          } else if (reposResult?.repositories) {
            repos = reposResult.repositories;
          } else if (reposResult?.content && Array.isArray(reposResult.content)) {
            repos = reposResult.content;
          } else if (reposResult?.data) {
            repos = Array.isArray(reposResult.data) ? reposResult.data : [];
          } else if (typeof reposResult === 'object' && reposResult !== null) {
            const values = Object.values(reposResult);
            repos = values.find((v: any) => Array.isArray(v)) || [];
          }

          data.repositories = repos;
        } catch (listError: any) {
          console.warn('Failed to list repositories:', listError.message);
        }
      }

      // Find the correct tool name for getting file contents
      // Common variations: get_contents, get_file_contents, read_file, get_repo_contents
      const getContentsTool = tools.find((t: any) => {
        const name = getToolName(t);
        return name === 'get_file_contents' ||
               name === 'get_contents' ||
               name === 'read_file' ||
               name === 'get_repo_contents' ||
               name === 'read_repo_file';
      });

      // Get repository contents (only if we have repos and a tool to get contents)
      if (repos.length > 0 && getContentsTool) {
        for (const repo of repos.slice(0, 3)) { // Limit to 3 repos
          try {
            // Extract owner and repo name from different formats
            let owner = 'unknown';
            let repoName = 'unknown';
            
            if (repo.owner) {
              owner = typeof repo.owner === 'string' ? repo.owner : repo.owner.login || 'unknown';
              repoName = repo.name || 'unknown';
            } else if (repo.full_name) {
              const parts = repo.full_name.split('/');
              owner = parts[0] || 'unknown';
              repoName = parts[1] || repo.name || 'unknown';
            } else if (repo.name) {
              // If repo.name exists but no owner, try to extract from other fields
              repoName = repo.name;
              // Try to get owner from other fields
              if (repo.owner?.login) {
                owner = repo.owner.login;
              } else if (repo.owner) {
                owner = String(repo.owner);
              }
            }

            // Only proceed if we have valid owner and repo name
            if (owner !== 'unknown' && repoName !== 'unknown') {
              const toolName = getToolName(getContentsTool);
              const contents = await mcpClientManager.callTool('github', toolName, {
                owner,
                repo: repoName,
                path: '', // Root directory
              });

              const contentData = contents?.content || contents?.data || contents;
              if (contentData) {
                evidence.push({
                  type: 'codebase_structure',
                  content: typeof contentData === 'string' ? contentData : JSON.stringify(contentData),
                  metadata: { repository: repo.full_name || `${owner}/${repoName}`, owner, repo: repoName },
                });
              }
            }
          } catch (repoError: any) {
            console.warn(`Failed to get contents for repo ${repo.name || repo.full_name}:`, repoError.message);
            // Continue with other repos
          }
        }
      }

      // Also try search_code to find important files
      const searchCodeTool = tools.find((t: any) => getToolName(t) === 'search_code');
      if (searchCodeTool && repos.length > 0) {
        try {
          const toolName = getToolName(searchCodeTool);
          // Search for common compliance-related files
          // GitHub search_code uses 'q' parameter with valid GitHub Search API syntax
          // Must include repo/user/org qualifier and avoid OR/AND operators
          const firstRepo = repos[0];
          if (firstRepo && firstRepo.full_name) {
            // Use repo qualifier for more specific results
            const [owner, repo] = firstRepo.full_name.split('/');
            const codeResults = await mcpClientManager.callTool('github', toolName, {
              q: `repo:${owner}/${repo} filename:.github/workflows filename:package.json filename:Dockerfile filename:.env.example`,
              sort: 'indexed',
              order: 'desc',
            });

            const codeData = codeResults?.items || codeResults?.data || codeResults;
            if (codeData && Array.isArray(codeData) && codeData.length > 0) {
              evidence.push({
                type: 'code_search',
                content: JSON.stringify(codeData.slice(0, 10)), // Limit to 10 results
                metadata: { searchType: 'compliance_files' },
              });
            }
          } else {
            // Fallback to user qualifier if no repo available
            const codeResults = await mcpClientManager.callTool('github', toolName, {
              q: 'user:@me filename:.github/workflows filename:package.json filename:Dockerfile',
              sort: 'indexed',
              order: 'desc',
            });

            const codeData = codeResults?.items || codeResults?.data || codeResults;
            if (codeData && Array.isArray(codeData) && codeData.length > 0) {
              evidence.push({
                type: 'code_search',
                content: JSON.stringify(codeData.slice(0, 10)), // Limit to 10 results
                metadata: { searchType: 'compliance_files' },
              });
            }
          }
        } catch (codeError: any) {
          console.warn('GitHub code search failed:', codeError.message);
        }
      }

      if (!searchReposTool && !listReposTool) {
        console.warn('No repository listing tool found in GitHub MCP server. Available tools:', toolNames);
      }

      await this.memory.remember(
        `GitHub extraction completed. Analyzed ${data.repositories.length} repositories`,
        'extraction',
        { source: 'github' }
      );

      return {
        agent: 'github-extraction',
        source: 'github',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error('GitHub extraction error:', errorMessage);
      throw new Error(`GitHub extraction failed: ${errorMessage}`);
    }
  }
}

/**
 * SonarQube Extraction Agent
 * Extracts code quality metrics and security vulnerabilities
 */
export class SonarQubeExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('sonarqube-extraction', projectId, sessionId);
  }

  async extract(credentials: any): Promise<ExtractionResult> {
    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      qualityMetrics: {},
      vulnerabilities: [],
      codeSmells: [],
      coverage: {},
    };

    try {
      const client = await mcpClientManager.connect('sonarqube', credentials);
      const tools = await mcpClientManager.listTools('sonarqube');

      if (!tools || tools.length === 0) {
        console.warn('SonarQube MCP server returned no tools. MCP integration may not be fully implemented.');
        return {
          agent: 'sonarqube-extraction',
          source: 'sonarqube',
          data,
          evidence,
          timestamp: new Date(),
        };
      }

      // Helper to get tool name
      const getToolName = (t: any): string => typeof t === 'string' ? t : t.name || String(t);
      const toolNames = tools.map((t: any) => getToolName(t));
      
      // Log available tools for debugging
      console.log('Available SonarQube MCP tools:', toolNames);

      // Try to find tools for quality metrics, vulnerabilities, etc.
      // Common variations: get_metrics, get_quality_metrics, get_vulnerabilities
      const metricsTool = tools.find((t: any) => {
        const name = getToolName(t);
        return name === 'get_metrics' ||
               name === 'get_quality_metrics' ||
               name === 'metrics' ||
               name === 'quality_metrics';
      });

      if (metricsTool) {
        try {
          const toolName = getToolName(metricsTool);
          const metrics = await mcpClientManager.callTool('sonarqube', toolName, {});
          const metricsData = metrics?.content || metrics?.data || metrics;
          if (metricsData) {
            data.qualityMetrics = metricsData;
          }
        } catch (metricsError: any) {
          console.warn(`SonarQube ${metricsTool.name} tool failed:`, metricsError.message);
        }
      }

      await this.memory.remember(
        `SonarQube extraction completed. Found ${data.vulnerabilities.length} vulnerabilities`,
        'extraction',
        { source: 'sonarqube' }
      );

      return {
        agent: 'sonarqube-extraction',
        source: 'sonarqube',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`SonarQube extraction failed: ${error.message}`);
    }
  }
}

/**
 * Sentry Extraction Agent
 * Extracts error monitoring and performance data
 */
export class SentryExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('sentry-extraction', projectId, sessionId);
  }

  async extract(credentials: any): Promise<ExtractionResult> {
    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      errors: [],
      performance: [],
      releases: [],
    };

    try {
      const client = await mcpClientManager.connect('sentry', credentials);
      const tools = await mcpClientManager.listTools('sentry');

      if (!tools || tools.length === 0) {
        console.warn('Sentry MCP server returned no tools. MCP integration may not be fully implemented.');
        return {
          agent: 'sentry-extraction',
          source: 'sentry',
          data,
          evidence,
          timestamp: new Date(),
        };
      }

      // Helper to get tool name
      const getToolName = (t: any): string => typeof t === 'string' ? t : t.name || String(t);
      const toolNames = tools.map((t: any) => getToolName(t));
      
      // Log available tools for debugging
      console.log('Available Sentry MCP tools:', toolNames);

      // Try to find tools for errors, performance, etc.
      // Common variations: get_errors, list_errors, get_issues
      const errorsTool = tools.find((t: any) => {
        const name = getToolName(t);
        return name === 'get_errors' ||
               name === 'list_errors' ||
               name === 'get_issues' ||
               name === 'errors' ||
               name === 'issues';
      });

      if (errorsTool) {
        try {
          const toolName = getToolName(errorsTool);
          const errors = await mcpClientManager.callTool('sentry', toolName, {});
          const errorsData = errors?.content || errors?.data || errors;
          if (errorsData) {
            data.errors = Array.isArray(errorsData) ? errorsData : [errorsData];
          }
        } catch (errorsError: any) {
          console.warn(`Sentry ${errorsTool.name} tool failed:`, errorsError.message);
        }
      }

      await this.memory.remember(
        `Sentry extraction completed. Found ${data.errors.length} errors`,
        'extraction',
        { source: 'sentry' }
      );

      return {
        agent: 'sentry-extraction',
        source: 'sentry',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Sentry extraction failed: ${error.message}`);
    }
  }
}

/**
 * Firecrawl Extraction Agent
 * Extracts web content and documentation
 */
export class FirecrawlExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('firecrawl-extraction', projectId, sessionId);
  }

  async extract(urls: string[], credentials: any): Promise<ExtractionResult> {
    const client = await mcpClientManager.connect('firecrawl', credentials);
    const tools = await mcpClientManager.listTools('firecrawl');

    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      scrapedContent: [],
    };

    try {
      for (const url of urls) {
        const content = await mcpClientManager.callTool('firecrawl', 'scrape', {
          url,
        });

        evidence.push({
          type: 'web_content',
          content: JSON.stringify(content),
          metadata: { url },
        });

        data.scrapedContent.push({ url, content });
      }

      await this.memory.remember(
        `Firecrawl extraction completed. Scraped ${urls.length} URLs`,
        'extraction',
        { source: 'firecrawl' }
      );

      return {
        agent: 'firecrawl-extraction',
        source: 'firecrawl',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Firecrawl extraction failed: ${error.message}`);
    }
  }
}

/**
 * Perplexity Extraction Agent
 * Extracts research and analysis data
 */
export class PerplexityExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('perplexity-extraction', projectId, sessionId);
  }

  async extract(queries: string[], credentials: any): Promise<ExtractionResult> {
    const client = await mcpClientManager.connect('perplexity', credentials);
    const tools = await mcpClientManager.listTools('perplexity');

    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      researchResults: [],
    };

    try {
      for (const query of queries) {
        const result = await mcpClientManager.callTool('perplexity', 'search', {
          query,
        });

        evidence.push({
          type: 'research',
          content: JSON.stringify(result),
          metadata: { query },
        });

        data.researchResults.push({ query, result });
      }

      await this.memory.remember(
        `Perplexity extraction completed. Researched ${queries.length} queries`,
        'extraction',
        { source: 'perplexity' }
      );

      return {
        agent: 'perplexity-extraction',
        source: 'perplexity',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Perplexity extraction failed: ${error.message}`);
    }
  }
}

/**
 * Browserbase Extraction Agent
 * Extracts web content using browser automation
 */
export class BrowserbaseExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('browserbase-extraction', projectId, sessionId);
  }

  async extract(urls: string[], credentials: any): Promise<ExtractionResult> {
    const client = await mcpClientManager.connect('browserbase', credentials);
    const tools = await mcpClientManager.listTools('browserbase');

    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      browserContent: [],
    };

    try {
      for (const url of urls) {
        // Use browserbase to navigate and extract content
        const result = await mcpClientManager.callTool('browserbase', 'navigate', {
          url,
          waitForSelector: 'body',
        });

        const content = await mcpClientManager.callTool('browserbase', 'extract_text', {
          selector: 'body',
        });

        evidence.push({
          type: 'browser_content',
          content: JSON.stringify({ url, content }),
          metadata: { url },
        });

        data.browserContent.push({ url, content });
      }

      await this.memory.remember(
        `Browserbase extraction completed. Extracted content from ${urls.length} URLs`,
        'extraction',
        { source: 'browserbase' }
      );

      return {
        agent: 'browserbase-extraction',
        source: 'browserbase',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Browserbase extraction failed: ${error.message}`);
    }
  }
}

/**
 * Atlassian Extraction Agent
 * Extracts JIRA tickets and Confluence documentation
 */
export class AtlassianExtractionAgent {
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.memory = new AgentMemory('atlassian-extraction', projectId, sessionId);
  }

  async extract(credentials: any): Promise<ExtractionResult> {
    const evidence: ExtractionResult['evidence'] = [];
    const data: any = {
      jiraTickets: [],
      confluencePages: [],
    };

    try {
      const client = await mcpClientManager.connect('atlassian', credentials);
      const tools = await mcpClientManager.listTools('atlassian');

      if (!tools || tools.length === 0) {
        console.warn('Atlassian MCP server returned no tools. MCP integration may not be fully implemented.');
        return {
          agent: 'atlassian-extraction',
          source: 'atlassian',
          data,
          evidence,
          timestamp: new Date(),
        };
      }

      // Helper to get tool name
      const getToolName = (t: any): string => typeof t === 'string' ? t : t.name || String(t);
      const toolNames = tools.map((t: any) => getToolName(t));
      
      // Log available tools for debugging
      console.log('Available Atlassian MCP tools:', toolNames);

      // Try to find tools for JIRA tickets
      // Common variations: get_issues, list_issues, search_issues, get_jira_issues
      const jiraTool = tools.find((t: any) => {
        const name = getToolName(t);
        return name === 'get_issues' ||
               name === 'list_issues' ||
               name === 'search_issues' ||
               name === 'get_jira_issues' ||
               name === 'jira_issues';
      });

      if (jiraTool) {
        try {
          const toolName = getToolName(jiraTool);
          const issues = await mcpClientManager.callTool('atlassian', toolName, {});
          const issuesData = issues?.content || issues?.data || issues;
          if (issuesData) {
            data.jiraTickets = Array.isArray(issuesData) ? issuesData : [issuesData];
          }
        } catch (jiraError: any) {
          console.warn(`Atlassian ${jiraTool.name} tool failed:`, jiraError.message);
        }
      }

      // Try to find tools for Confluence pages
      // Common variations: get_pages, list_pages, search_pages, get_confluence_pages
      const confluenceTool = tools.find((t: any) => {
        const name = getToolName(t);
        return name === 'get_pages' ||
               name === 'list_pages' ||
               name === 'search_pages' ||
               name === 'get_confluence_pages' ||
               name === 'confluence_pages';
      });

      if (confluenceTool) {
        try {
          const toolName = getToolName(confluenceTool);
          const pages = await mcpClientManager.callTool('atlassian', toolName, {});
          const pagesData = pages?.content || pages?.data || pages;
          if (pagesData) {
            data.confluencePages = Array.isArray(pagesData) ? pagesData : [pagesData];
          }
        } catch (confluenceError: any) {
          console.warn(`Atlassian ${confluenceTool.name} tool failed:`, confluenceError.message);
        }
      }

      await this.memory.remember(
        `Atlassian extraction completed. Found ${data.jiraTickets.length} tickets`,
        'extraction',
        { source: 'atlassian' }
      );

      return {
        agent: 'atlassian-extraction',
        source: 'atlassian',
        data,
        evidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Atlassian extraction failed: ${error.message}`);
    }
  }
}

