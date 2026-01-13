/**
 * MCP Server Configurations
 * Pre-configured settings for popular MCP servers from mcpservers.org
 * 
 * Reference: http://mcpservers.org/
 */

import { MCPServerConfig } from '../client';

/**
 * GitHub MCP Server Configuration
 * For code analysis and repository scanning
 */
export const githubMCPConfig: MCPServerConfig = {
  name: 'github',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  oauth: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:org'],
  },
};

/**
 * Supabase MCP Server Configuration
 * For database and infrastructure analysis
 */
export const supabaseMCPConfig: MCPServerConfig = {
  name: 'supabase',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@supabase/mcp-server'],
  oauth: {
    clientId: process.env.SUPABASE_CLIENT_ID || '',
    clientSecret: process.env.SUPABASE_CLIENT_SECRET || '',
    authorizationUrl: 'https://supabase.com/oauth/authorize',
    tokenUrl: 'https://supabase.com/oauth/token',
    scopes: ['read', 'write'],
  },
};

/**
 * Cloudflare MCP Server Configuration
 * For cloud infrastructure analysis
 */
export const cloudflareMCPConfig: MCPServerConfig = {
  name: 'cloudflare',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@cloudflare/mcp-server'],
  oauth: {
    clientId: process.env.CLOUDFLARE_CLIENT_ID || '',
    clientSecret: process.env.CLOUDFLARE_CLIENT_SECRET || '',
    authorizationUrl: 'https://dash.cloudflare.com/oauth2/authorize',
    tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
    scopes: ['read', 'write'],
  },
};

/**
 * File System MCP Server Configuration
 * For local file system access (no OAuth needed)
 */
export const filesystemMCPConfig: MCPServerConfig = {
  name: 'filesystem',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', process.env.FILESYSTEM_ROOT || '/'],
};

/**
 * Playwright MCP Server Configuration
 * For browser automation and testing
 */
export const playwrightMCPConfig: MCPServerConfig = {
  name: 'playwright',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@playwright/mcp-server'],
};

/**
 * Tailvy MCP Server Configuration
 * Add description based on Tailvy's functionality
 */
export const tailvyMCPConfig: MCPServerConfig = {
  name: 'tailvy',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@tailvy/mcp-server'], // Update with actual package name if different
  // Add OAuth config if Tailvy requires authentication
  // oauth: {
  //   clientId: process.env.TAILVY_CLIENT_ID || '',
  //   clientSecret: process.env.TAILVY_CLIENT_SECRET || '',
  //   authorizationUrl: 'https://tailvy.com/oauth/authorize',
  //   tokenUrl: 'https://tailvy.com/oauth/token',
  //   scopes: ['read', 'write'],
  // },
};

/**
 * Register all MCP servers with the client manager
 */
export function registerMCPServers(clientManager: any): void {
  clientManager.registerServer(githubMCPConfig);
  clientManager.registerServer(supabaseMCPConfig);
  clientManager.registerServer(cloudflareMCPConfig);
  clientManager.registerServer(filesystemMCPConfig);
  clientManager.registerServer(playwrightMCPConfig);
  clientManager.registerServer(tailvyMCPConfig);
}

