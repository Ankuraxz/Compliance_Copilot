/**
 * Extended MCP Server Configurations
 * All MCP servers with OAuth and BYOK support
 * 
 * Reference: http://mcpservers.org/
 */

import { MCPServerConfig } from '../client';

/**
 * AWS Core MCP Server Configuration
 * Backend deployment, cloud, database management
 * Reference: https://mcpservers.org/servers/awslabs/core-mcp-server
 */
export const awsCoreMCPConfig: MCPServerConfig = {
  name: 'aws-core',
  type: 'stdio',
  command: 'uvx',
  args: ['awslabs.core-mcp-server@latest'],
  env: {
    FASTMCP_LOG_LEVEL: 'ERROR',
    'aws-foundation': 'true', // Admin role for AWS knowledge and API
    'solutions-architect': 'true', // Solution architecture capabilities
    'dev-tools': 'true', // Development tools
    'ci-cd-devops': 'true', // CI/CD and DevOps
    'monitoring-observability': 'true', // Monitoring
    'security-identity': 'true', // Security and identity
  },
  description: 'AWS Core MCP server for backend deployment, cloud infrastructure, and database management',
  category: 'cloud',
  // BYOK: AWS credentials via environment variables
  // Set AWS_PROFILE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
};

/**
 * Supabase MCP Server Configuration (HTTP/SSE)
 * Database and backend services
 * Reference: https://mcpservers.org/servers/supabase-community/supabase-mcp
 */
export const supabaseMCPConfigHTTP: MCPServerConfig = {
  name: 'supabase',
  type: 'http',
  url: 'https://mcp.supabase.com/mcp',
  description: 'Supabase MCP server for database, auth, and edge functions',
  category: 'database',
  // OAuth 2.1 via Dynamic Client Registration
  // User connects via Supabase dashboard
};

/**
 * Azure MCP Server Configuration
 * Alternative to AWS for cloud services
 * Reference: https://mcpservers.org/servers/github-com-microsoft-mcp
 */
export const azureMCPConfig: MCPServerConfig = {
  name: 'azure',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@azure/mcp-server'],
  description: 'Azure MCP server for Microsoft Azure cloud services',
  category: 'cloud',
  // BYOK: Azure credentials via environment variables
  // Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
};

/**
 * GitHub MCP Server Configuration
 * Codebase analysis and repository management
 * Reference: https://github.com/github/github-mcp-server
 * Official GitHub MCP Server - Go-based binary
 * 
 * Installation options:
 * 1. Via npm: npx -y @modelcontextprotocol/server-github
 * 2. Via binary: Download from GitHub releases
 * 3. Via Docker: ghcr.io/github/github-mcp-server
 * 
 * Required: GITHUB_PERSONAL_ACCESS_TOKEN environment variable
 */
export const githubMCPConfig: MCPServerConfig = {
  name: 'github',
  type: 'stdio',
  // Try official package first, fallback to alternative if needed
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  description: 'GitHub MCP server for codebase analysis and repository management',
  category: 'code',
  oauth: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:org'],
  },
  // BYOK: GITHUB_PERSONAL_ACCESS_TOKEN (required) or GITHUB_TOKEN for personal access token
  // The official server requires GITHUB_PERSONAL_ACCESS_TOKEN
  apiToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || '',
  env: {
    // GitHub MCP server requires GITHUB_PERSONAL_ACCESS_TOKEN
    // This will be set from credentials in mcp/client.ts
  },
};

/**
 * ArgoCD MCP Server Configuration
 * CI/CD for frontend deployment
 * Reference: https://mcpservers.org/servers/akuity/argocd-mcp
 */
export const argocdMCPConfig: MCPServerConfig = {
  name: 'argocd',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@akuity/argocd-mcp-server'],
  description: 'ArgoCD MCP server for CI/CD and GitOps',
  category: 'cicd',
  // BYOK: ArgoCD API token
  apiToken: process.env.ARGOCD_API_TOKEN || '',
  env: {
    ARGOCD_SERVER: process.env.ARGOCD_SERVER || '',
    ARGOCD_USERNAME: process.env.ARGOCD_USERNAME || '',
  },
};

/**
 * Cloudflare MCP Server Configuration
 * CDN and edge computing
 * Reference: https://mcpservers.org/servers/cloudflare/mcp-server-cloudflare
 */
export const cloudflareMCPConfig: MCPServerConfig = {
  name: 'cloudflare',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@cloudflare/mcp-server-cloudflare'],
  description: 'Cloudflare MCP server for CDN and edge services',
  category: 'cloud',
  oauth: {
    clientId: process.env.CLOUDFLARE_CLIENT_ID || '',
    clientSecret: process.env.CLOUDFLARE_CLIENT_SECRET || '',
    authorizationUrl: 'https://dash.cloudflare.com/oauth2/authorize',
    tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
    scopes: ['read', 'write'],
  },
  // BYOK: Cloudflare API token
  apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
};

/**
 * Cloudflare Sandbox Container MCP Server Configuration
 * Remote SSE server for spinning up sandbox development environments
 * Reference: https://github.com/cloudflare/mcp-server-cloudflare/tree/main/apps/sandbox-container
 * Reference: https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/
 * Server URL: https://containers.mcp.cloudflare.com/mcp
 * 
 * Uses mcp-remote CLI as stdio transport to avoid EventSource issues in Node.js
 * This delegates SSE handling to the mcp-remote process which properly implements EventSource
 * 
 * Internal use only - automatically uses CLOUDFLARE_API_TOKEN from environment
 */
export const cloudflareContainerMCPConfig: MCPServerConfig = {
  name: 'cloudflare-container',
  type: 'stdio',
  command: 'npx',
  args: [
    '-y',
    'mcp-remote',
    'https://containers.mcp.cloudflare.com/mcp'
  ],
  description: 'Cloudflare Sandbox Container MCP server for deep code analysis in isolated environments (internal use only)',
  category: 'code',
  // Internal use only - uses CLOUDFLARE_API_TOKEN from environment automatically
  env: {
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
  },
};

/**
 * Notion MCP Server Configuration
 * Documentation and knowledge base
 * Reference: https://mcpservers.org/servers/makenotion/notion-mcp-server
 */
export const notionMCPConfig: MCPServerConfig = {
  name: 'notion',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@makenotion/notion-mcp-server'],
  description: 'Notion MCP server for documentation and knowledge management',
  category: 'communication',
  // BYOK: Notion API key
  apiKey: process.env.NOTION_API_KEY || '',
  env: {
    NOTION_WORKSPACE_ID: process.env.NOTION_WORKSPACE_ID || '',
  },
};

/**
 * Sentry MCP Server Configuration
 * Error monitoring and performance tracking
 * Reference: https://mcpservers.org/servers/getsentry/sentry-mcp
 */
export const sentryMCPConfig: MCPServerConfig = {
  name: 'sentry',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@getsentry/sentry-mcp'],
  description: 'Sentry MCP server for error monitoring and performance',
  category: 'monitoring',
  // BYOK: Sentry API token
  apiToken: process.env.SENTRY_API_TOKEN || '',
  env: {
    SENTRY_ORG: process.env.SENTRY_ORG || '',
    SENTRY_PROJECT: process.env.SENTRY_PROJECT || '',
  },
};

/**
 * SonarQube MCP Server Configuration
 * Code quality and security analysis
 * Reference: https://mcpservers.org/servers/SonarSource/sonarqube-mcp-server
 */
export const sonarqubeMCPConfig: MCPServerConfig = {
  name: 'sonarqube',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@sonarsource/sonarqube-mcp-server'],
  description: 'SonarQube MCP server for code quality analysis',
  category: 'code',
  // BYOK: SonarQube token
  apiToken: process.env.SONARQUBE_TOKEN || '',
  env: {
    SONARQUBE_URL: process.env.SONARQUBE_URL || '',
  },
};

/**
 * Atlassian MCP Server Configuration
 * JIRA and Confluence integration
 * Reference: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/
 */
export const atlassianMCPConfig: MCPServerConfig = {
  name: 'atlassian',
  type: 'http',
  url: 'https://mcp.atlassian.com/mcp',
  description: 'Atlassian MCP server for JIRA and Confluence',
  category: 'communication',
  // OAuth 2.1 via Atlassian
  oauth: {
    clientId: process.env.ATLASSIAN_CLIENT_ID || '',
    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET || '',
    authorizationUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: ['read:jira-work', 'write:jira-work', 'read:confluence-content.all'],
  },
  // BYOK: Atlassian API token
  apiToken: process.env.ATLASSIAN_API_TOKEN || '',
  env: {
    ATLASSIAN_DOMAIN: process.env.ATLASSIAN_DOMAIN || '',
  },
};

/**
 * Firecrawl MCP Server Configuration
 * Web scraping and content extraction for LLM inspection and research
 * Reference: https://mcpservers.org/servers/mendableai/firecrawl-mcp-server
 */
export const firecrawlMCPConfig: MCPServerConfig = {
  name: 'firecrawl',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@mendableai/firecrawl-mcp-server'],
  description: 'Firecrawl MCP server for web scraping and content extraction (facilitates LLM inspection and research)',
  category: 'analysis',
  // BYOK: Firecrawl API key (provided by user to facilitate LLM research)
  apiKey: process.env.FIRECRAWL_API_KEY || '',
};

/**
 * Perplexity AI MCP Server Configuration
 * Research and analysis for LLM inspection and research
 * Reference: https://mcpservers.org/servers/ppl-ai/modelcontextprotocol
 */
export const perplexityMCPConfig: MCPServerConfig = {
  name: 'perplexity',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@ppl-ai/perplexity-mcp-server'],
  description: 'Perplexity AI MCP server for research and analysis (facilitates LLM inspection and research)',
  category: 'analysis',
  // BYOK: Perplexity API key (provided by user to facilitate LLM research)
  apiKey: process.env.PERPLEXITY_API_KEY || '',
};

/**
 * Browserbase MCP Server Configuration
 * Browser automation for LLM inspection and research
 * Reference: https://mcpservers.org/servers/browserbase/mcp-server-browserbase
 */
export const browserbaseMCPConfig: MCPServerConfig = {
  name: 'browserbase',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@browserbase/mcp-server-browserbase'],
  description: 'Browserbase MCP server for browser automation (facilitates LLM inspection and research)',
  category: 'analysis',
  // BYOK: Browserbase API key (provided by user to facilitate LLM research)
  apiKey: process.env.BROWSERBASE_API_KEY || '',
  env: {
    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID || '',
  },
};

/**
 * Playwright MCP Server Configuration
 * Browser automation alternative
 * Reference: https://mcpservers.org/servers/microsoft/playwright-mcp
 */
export const playwrightMCPConfig: MCPServerConfig = {
  name: 'playwright',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@playwright/mcp-server'],
  description: 'Playwright MCP server for browser automation',
  category: 'analysis',
  // No authentication required
};

/**
 * DataDog MCP Server Configuration
 * Observability, logs, metrics, and monitoring
 * Reference: https://mcpservers.org/servers/GeLi2001/datadog-mcp-server
 * Reference: https://www.datadoghq.com/blog/datadog-remote-mcp-server/
 * 
 * Note: Coming soon - no real server available yet
 * Users can add their keys, but backend integration is pending
 */
export const datadogMCPConfig: MCPServerConfig = {
  name: 'datadog',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@datadog/mcp-server'],
  description: 'DataDog MCP server for observability, logs, metrics, and monitoring (Coming Soon)',
  category: 'monitoring',
  // BYOK: DataDog API key and application key
  apiKey: process.env.DATADOG_API_KEY || '',
  env: {
    DATADOG_API_KEY: process.env.DATADOG_API_KEY || '',
    DATADOG_APP_KEY: process.env.DATADOG_APP_KEY || '',
    DATADOG_SITE: process.env.DATADOG_SITE || 'datadoghq.com',
  },
  // Mark as coming soon
  comingSoon: true,
};

/**
 * Jenkins MCP Server Configuration
 * CI/CD pipeline management
 * Reference: https://mcpservers.org/servers/gcorroto/mcp-jenkins
 * 
 * Note: Coming soon - no real server available yet
 * Users can add their keys, but backend integration is pending
 */
export const jenkinsMCPConfig: MCPServerConfig = {
  name: 'jenkins',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@jenkins/mcp-server'],
  description: 'Jenkins MCP server for CI/CD pipeline management (Coming Soon)',
  category: 'cicd',
  // BYOK: Jenkins API token
  apiToken: process.env.JENKINS_API_TOKEN || '',
  env: {
    JENKINS_URL: process.env.JENKINS_URL || '',
    JENKINS_USER: process.env.JENKINS_USER || '',
    JENKINS_API_TOKEN: process.env.JENKINS_API_TOKEN || '',
  },
  // Mark as coming soon
  comingSoon: true,
};

/**
 * MIRO MCP Server Configuration
 * Visual collaboration and whiteboarding
 * Reference: https://mcpservers.org/servers/k-jarzyna/mcp-miro
 * 
 * Note: Coming soon - no real server available yet
 * Users can add their keys, but backend integration is pending
 */
export const miroMCPConfig: MCPServerConfig = {
  name: 'miro',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@miro/mcp-server'],
  description: 'MIRO MCP server for visual collaboration and whiteboarding (Coming Soon)',
  category: 'communication',
  // BYOK: MIRO API token
  apiToken: process.env.MIRO_API_TOKEN || '',
  env: {
    MIRO_API_TOKEN: process.env.MIRO_API_TOKEN || '',
    MIRO_TEAM_ID: process.env.MIRO_TEAM_ID || '',
  },
  // Mark as coming soon
  comingSoon: true,
};

/**
 * DASH0 MCP Server Configuration
 * Analytics and monitoring
 * Reference: https://mcpservers.org/servers/dash0hq/mcp-dash0
 */
export const dash0MCPConfig: MCPServerConfig = {
  name: 'dash0',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@dash0hq/mcp-dash0'],
  description: 'DASH0 MCP server for analytics and monitoring',
  category: 'monitoring',
  // BYOK: DASH0 API key
  apiKey: process.env.DASH0_API_KEY || '',
  env: {
    DASH0_API_KEY: process.env.DASH0_API_KEY || '',
    DASH0_PROJECT_ID: process.env.DASH0_PROJECT_ID || '',
  },
};

/**
 * Google Cloud (GCloud) MCP Server Configuration
 * Google Cloud Platform services
 * Reference: https://mcpservers.org/servers/github-com-googleapis-gcloud-mcp
 */
export const gcloudMCPConfig: MCPServerConfig = {
  name: 'gcloud',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@googleapis/gcloud-mcp'],
  description: 'Google Cloud MCP server for GCP services and infrastructure',
  category: 'cloud',
  // BYOK: Google Cloud credentials via environment variables
  // Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT
  env: {
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || '',
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
  },
};

/**
 * Grafana MCP Server Configuration
 * Observability and monitoring dashboards
 * Reference: https://mcpservers.org/servers/grafana/mcp-grafana
 */
export const grafanaMCPConfig: MCPServerConfig = {
  name: 'grafana',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@grafana/mcp-grafana'],
  description: 'Grafana MCP server for observability and monitoring dashboards',
  category: 'monitoring',
  // BYOK: Grafana API key
  apiKey: process.env.GRAFANA_API_KEY || '',
  env: {
    GRAFANA_API_KEY: process.env.GRAFANA_API_KEY || '',
    GRAFANA_URL: process.env.GRAFANA_URL || '',
    GRAFANA_USER: process.env.GRAFANA_USER || '',
  },
};

/**
 * Register all MCP servers
 */
export function registerAllMCPServers(clientManager: any): void {
  // Cloud & Infrastructure
  clientManager.registerServer(awsCoreMCPConfig);
  clientManager.registerServer(azureMCPConfig);
  clientManager.registerServer(cloudflareMCPConfig);
  clientManager.registerServer(cloudflareContainerMCPConfig);
  clientManager.registerServer(gcloudMCPConfig);
  
  // Database & Backend
  clientManager.registerServer(supabaseMCPConfigHTTP);
  
  // Code & CI/CD
  clientManager.registerServer(githubMCPConfig);
  clientManager.registerServer(argocdMCPConfig);
  clientManager.registerServer(sonarqubeMCPConfig);
  clientManager.registerServer(jenkinsMCPConfig); // Coming soon
  
  // Monitoring & Quality
  clientManager.registerServer(sentryMCPConfig);
  clientManager.registerServer(datadogMCPConfig); // Coming soon
  clientManager.registerServer(dash0MCPConfig);
  clientManager.registerServer(grafanaMCPConfig);
  
  // Communication & Documentation
  clientManager.registerServer(notionMCPConfig);
  clientManager.registerServer(atlassianMCPConfig);
  clientManager.registerServer(miroMCPConfig); // Coming soon
  
  // Analysis & Research
  // Note: Firecrawl, Perplexity, and Browserbase use direct API clients instead of MCP servers
  // because their MCP server packages don't exist in npm registry
  // They are implemented as direct API clients in lib/api-clients/
  clientManager.registerServer(playwrightMCPConfig);
}

/**
 * Get MCP servers by category
 */
export function getMCPServersByCategory(category: string): MCPServerConfig[] {
  const allServers = [
    awsCoreMCPConfig,
    azureMCPConfig,
    cloudflareMCPConfig,
    cloudflareContainerMCPConfig,
    gcloudMCPConfig,
    supabaseMCPConfigHTTP,
    githubMCPConfig,
    argocdMCPConfig,
    sonarqubeMCPConfig,
    jenkinsMCPConfig,
    sentryMCPConfig,
    datadogMCPConfig,
    dash0MCPConfig,
    grafanaMCPConfig,
    notionMCPConfig,
    atlassianMCPConfig,
    miroMCPConfig,
    firecrawlMCPConfig,
    perplexityMCPConfig,
    browserbaseMCPConfig,
    playwrightMCPConfig,
  ];
  
  return allServers.filter(server => server.category === category);
}

