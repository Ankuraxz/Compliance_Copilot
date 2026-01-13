/**
 * MCP Client for connecting to existing MCP servers
 * Uses official @modelcontextprotocol/sdk with OAuth support
 * 
 * Reference: https://modelcontextprotocol.io
 * MCP Servers: http://mcpservers.org/
 */

// MCP SDK imports
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// Note: SSEServerTransport is imported dynamically to avoid SSR issues

export interface MCPServerConfig {
  name: string;
  type: 'sse' | 'stdio' | 'http';
  url?: string; // For SSE/HTTP transport
  command?: string; // For stdio transport
  args?: string[]; // For stdio transport
  oauth?: {
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
  // BYOK (Bring Your Own Key) support
  apiKey?: string; // For API key authentication
  apiToken?: string; // For API token authentication
  env?: Record<string, string>; // Additional environment variables
  description?: string;
  category?: 'cloud' | 'database' | 'cicd' | 'monitoring' | 'analysis' | 'communication' | 'code';
  comingSoon?: boolean; // Mark servers that are coming soon (frontend will show badge)
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private configs: Map<string, MCPServerConfig> = new Map();
  private connectionCredentials: Map<string, any> = new Map(); // Store credentials for reconnection
  private connectionPromises: Map<string, Promise<Client>> = new Map(); // Prevent duplicate connections

  /**
   * Register an MCP server configuration
   */
  registerServer(config: MCPServerConfig): void {
    this.configs.set(config.name, config);
  }

  /**
   * Connect to an MCP server with OAuth or BYOK
   * Improved connection management for agentic mode:
   * - Prevents duplicate connections
   * - Stores credentials for reconnection
   * - Handles connection failures gracefully
   */
  async connect(
    serverName: string,
    credentials?: {
      accessToken?: string; // OAuth token
      apiKey?: string; // API key
      apiToken?: string; // API token
      customEnv?: Record<string, string>; // Custom environment variables
    }
  ): Promise<Client> {
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`MCP server ${serverName} not registered`);
    }

    // Check if already connected and verify connection is still alive
    if (this.clients.has(serverName)) {
      const existingClient = this.clients.get(serverName)!;
      try {
        // Quick health check - try to list tools with short timeout
        await Promise.race([
          existingClient.listTools(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 2000))
        ]);
        // Connection is alive, return it
        return existingClient;
      } catch (error) {
        // Connection is dead, remove it and reconnect
        console.warn(`[${serverName}] Existing connection is dead, reconnecting...`);
        this.clients.delete(serverName);
        this.connectionPromises.delete(serverName);
      }
    }

    // Check if there's already a connection attempt in progress
    if (this.connectionPromises.has(serverName)) {
      return this.connectionPromises.get(serverName)!;
    }

    // Store credentials for potential reconnection
    if (credentials) {
      this.connectionCredentials.set(serverName, credentials);
    }

    // Create connection promise
    const connectionPromise = this._doConnect(serverName, config, credentials);
    this.connectionPromises.set(serverName, connectionPromise);

    try {
      const client = await connectionPromise;
      this.connectionPromises.delete(serverName);
      return client;
    } catch (error) {
      this.connectionPromises.delete(serverName);
      throw error;
    }
  }

  /**
   * Internal method to perform the actual connection
   */
  private async _doConnect(
    serverName: string,
    config: MCPServerConfig,
    credentials?: {
      accessToken?: string;
      apiKey?: string;
      apiToken?: string;
      customEnv?: Record<string, string>;
    }
  ): Promise<Client> {
    // CRITICAL: Initialize client variable to ensure it's always defined
    let client: Client | undefined;
    
    // For stdio transport (most common for MCP servers):
    if (config.type === 'stdio') {
      if (!config.command) {
        throw new Error(`Stdio transport requires command for server ${serverName}`);
      }
      
      try {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        
        // Build environment variables
        const env: Record<string, string> = {
          ...process.env,
          ...(config.env || {}),
        };
        
        // Add credentials to environment
        // Credentials can be passed as:
        // - { accessToken: '...' } for OAuth
        // - { apiKey: '...' } for API keys
        // - { apiToken: '...' } for API tokens
        // - { token: '...' } as a generic token
        // - Or a string directly (for backward compatibility)
        
        let token: string | undefined;
        if (typeof credentials === 'string') {
          token = credentials;
        } else if (credentials) {
          token = credentials.accessToken || credentials.apiToken || credentials.token || credentials.apiKey;
        }
        
        if (token) {
          // GitHub MCP server expects GITHUB_PERSONAL_ACCESS_TOKEN (required)
          if (serverName === 'github') {
            // GitHub MCP server requires GITHUB_PERSONAL_ACCESS_TOKEN
            // Set both for maximum compatibility
            env.GITHUB_PERSONAL_ACCESS_TOKEN = token;
            env.GITHUB_TOKEN = token;
            console.log(`[${serverName}] GitHub token configured (length: ${token.length})`);
          } else if (serverName === 'aws-core' || serverName === 'aws') {
            // AWS MCP server uses AWS credentials
            // If credentials object has AWS-specific fields, use them
            if (credentials && typeof credentials === 'object') {
              if (credentials.customEnv?.AWS_ACCESS_KEY_ID) {
                env.AWS_ACCESS_KEY_ID = credentials.customEnv.AWS_ACCESS_KEY_ID;
              } else {
                env.AWS_ACCESS_KEY_ID = token;
              }
              if (credentials.customEnv?.AWS_SECRET_ACCESS_KEY) {
                env.AWS_SECRET_ACCESS_KEY = credentials.customEnv.AWS_SECRET_ACCESS_KEY;
              }
              
              // Validate and set AWS_REGION - ensure it's a valid region, not a template variable
              let awsRegion = credentials.customEnv?.AWS_REGION;
              
              // Check if it's a template variable (contains ${} or similar)
              if (awsRegion && (awsRegion.includes('${') || awsRegion.includes('{{') || awsRegion.includes('each_region'))) {
                console.warn(`[${serverName}] Invalid AWS_REGION detected (template variable): ${awsRegion}, using default`);
                awsRegion = undefined;
              }
              
              // Validate region format (should be like us-east-1, eu-west-1, etc.)
              if (awsRegion && !/^[a-z]{2}-[a-z]+-\d+$/.test(awsRegion)) {
                console.warn(`[${serverName}] Invalid AWS_REGION format: ${awsRegion}, using default`);
                awsRegion = undefined;
              }
              
              // Set region with fallback - ALWAYS use us-east-1 as default
              env.AWS_REGION = awsRegion || process.env.AWS_REGION || 'us-east-1';
              
              // Also set AWS_DEFAULT_REGION for compatibility
              env.AWS_DEFAULT_REGION = env.AWS_REGION;
              
              // Ensure region is always valid (double-check)
              if (!/^[a-z]{2}-[a-z]+-\d+$/.test(env.AWS_REGION)) {
                console.warn(`[${serverName}] Invalid AWS_REGION in env: "${env.AWS_REGION}", forcing to us-east-1`);
                env.AWS_REGION = 'us-east-1';
                env.AWS_DEFAULT_REGION = 'us-east-1';
              }
              
              // Ensure AWS credentials are set even if not in customEnv
              if (!env.AWS_ACCESS_KEY_ID) {
                if (token) {
                  env.AWS_ACCESS_KEY_ID = token;
                } else if (credentials?.apiKey) {
                  env.AWS_ACCESS_KEY_ID = credentials.apiKey;
                } else if (credentials?.customEnv?.AWS_ACCESS_KEY_ID) {
                  env.AWS_ACCESS_KEY_ID = credentials.customEnv.AWS_ACCESS_KEY_ID;
                } else {
                  console.warn(`[${serverName}] AWS_ACCESS_KEY_ID not provided. AWS operations will fail.`);
                }
              }
              
              // If no secret key is provided, try to get it from credentials
              if (!env.AWS_SECRET_ACCESS_KEY) {
                if (credentials?.apiToken) {
                  env.AWS_SECRET_ACCESS_KEY = credentials.apiToken;
                } else if (credentials?.customEnv?.AWS_SECRET_ACCESS_KEY) {
                  env.AWS_SECRET_ACCESS_KEY = credentials.customEnv.AWS_SECRET_ACCESS_KEY;
                } else {
                  console.warn(`[${serverName}] AWS_SECRET_ACCESS_KEY not provided. AWS operations may fail.`);
                }
              }
              
              // CRITICAL: Create AWS credentials file structure to avoid "config profile (default) could not be found" error
              // The AWS SDK (boto3 in Python) looks for ~/.aws/credentials, but we can't write there from Node.js easily
              // Instead, ensure environment variables are set so AWS SDK uses them instead of profile
              
              // MULTI-LAYER PROTECTION: Validate credentials exist before proceeding
              const hasAccessKey = !!(env.AWS_ACCESS_KEY_ID || credentials?.customEnv?.AWS_ACCESS_KEY_ID || credentials?.apiKey || token);
              const hasSecretKey = !!(env.AWS_SECRET_ACCESS_KEY || credentials?.customEnv?.AWS_SECRET_ACCESS_KEY || credentials?.apiToken);
              
              if (hasAccessKey && hasSecretKey) {
                // LAYER 1: Ensure credentials are actually in env (not just in credentials object)
                if (!env.AWS_ACCESS_KEY_ID) {
                  env.AWS_ACCESS_KEY_ID = credentials?.customEnv?.AWS_ACCESS_KEY_ID || credentials?.apiKey || token || '';
                }
                if (!env.AWS_SECRET_ACCESS_KEY) {
                  env.AWS_SECRET_ACCESS_KEY = credentials?.customEnv?.AWS_SECRET_ACCESS_KEY || credentials?.apiToken || '';
                }
                
                // LAYER 2: Final validation - credentials must be non-empty strings
                if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || 
                    env.AWS_ACCESS_KEY_ID.trim() === '' || env.AWS_SECRET_ACCESS_KEY.trim() === '') {
                  throw new Error(`[${serverName}] AWS credentials are empty or invalid. Access Key: ${!!env.AWS_ACCESS_KEY_ID}, Secret Key: ${!!env.AWS_SECRET_ACCESS_KEY}`);
                }
                
                // LAYER 3: CRITICAL - For Python boto3, we need to ensure environment variables take precedence
                // Python's boto3 checks environment variables FIRST, then config files
                // So we need to ensure env vars are set and prevent config file reading
                
                // Do NOT set AWS_PROFILE at all - let AWS SDK use environment variables
                // Setting AWS_PROFILE='' might cause issues, so we unset it if it exists
                delete env.AWS_PROFILE;
                
                // LAYER 4: Create temporary AWS credentials file with user's credentials
                // CRITICAL: boto3 requires a [default] profile in credentials file
                // We create this file BEFORE starting the MCP server process
                const fs = await import('fs');
                const path = await import('path');
                const os = await import('os');
                
                const tempDir = os.tmpdir();
                // Use absolute path to ensure it's accessible
                const credentialsFile = path.resolve(tempDir, `aws-credentials-${Date.now()}-${Math.random().toString(36).substring(7)}.ini`);
                const configFile = path.resolve(tempDir, `aws-config-${Date.now()}-${Math.random().toString(36).substring(7)}.ini`);
                
                // CRITICAL: Escape credentials to prevent INI injection
                const escapeIniValue = (value: string): string => {
                  return value.replace(/[;\n\r]/g, '');
                };
                
                // Write credentials file in INI format (boto3 standard) with [default] profile
                // CRITICAL: Ensure region is valid before writing
                const validRegion = env.AWS_REGION && /^[a-z]{2}-[a-z]+-\d+$/.test(env.AWS_REGION) 
                  ? env.AWS_REGION 
                  : 'us-east-1';
                
                const credentialsContent = `[default]
aws_access_key_id = ${escapeIniValue(env.AWS_ACCESS_KEY_ID)}
aws_secret_access_key = ${escapeIniValue(env.AWS_SECRET_ACCESS_KEY)}
`;
                
                // Write config file with region - ensure it's valid
                const configContent = `[default]
region = ${validRegion}
output = json
`;
                
                // Update env.AWS_REGION to ensure it's valid
                env.AWS_REGION = validRegion;
                env.AWS_DEFAULT_REGION = validRegion;
                
                try {
                  // Ensure directory exists
                  if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                  }
                  
                  // Write files synchronously BEFORE starting process
                  fs.writeFileSync(credentialsFile, credentialsContent, { mode: 0o600 }); // Read/write for owner only
                  fs.writeFileSync(configFile, configContent, { mode: 0o600 });
                  
                  // CRITICAL: Verify file contents are correct before proceeding
                  const credentialsContentCheck = fs.readFileSync(credentialsFile, 'utf-8');
                  const configContentCheck = fs.readFileSync(configFile, 'utf-8');
                  
                  if (!credentialsContentCheck.includes('[default]') || 
                      !credentialsContentCheck.includes('aws_access_key_id') ||
                      !credentialsContentCheck.includes('aws_secret_access_key')) {
                    throw new Error('Credentials file content is invalid - missing [default] profile or keys');
                  }
                  
                  if (!configContentCheck.includes('[default]') || 
                      !configContentCheck.includes('region')) {
                    throw new Error('Config file content is invalid - missing [default] profile or region');
                  }
                  
                  // CRITICAL: Set AWS_PROFILE to 'default' explicitly
                  // This tells boto3 to use the [default] section in our credentials file
                  env.AWS_PROFILE = 'default';
                  
                  // Point AWS SDK to our temporary credentials file (absolute paths)
                  env.AWS_SHARED_CREDENTIALS_FILE = credentialsFile;
                  env.AWS_CONFIG_FILE = configFile;
                  
                  // Disable loading from default locations
                  env.AWS_SDK_LOAD_CONFIG = 'false';
                  
                  // Verify files exist and are readable
                  if (!fs.existsSync(credentialsFile) || !fs.existsSync(configFile)) {
                    throw new Error('Credentials files were not created successfully');
                  }
                  
                  // Clean up files after 1 hour (or on process exit)
                  setTimeout(() => {
                    try {
                      if (fs.existsSync(credentialsFile)) fs.unlinkSync(credentialsFile);
                      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
                    } catch (e) {
                      // Ignore cleanup errors
                    }
                  }, 3600000); // 1 hour
                  
                  console.log(`[${serverName}] Created AWS credentials file with [default] profile: ${credentialsFile}`);
                  console.log(`[${serverName}] AWS_PROFILE='default', AWS_SHARED_CREDENTIALS_FILE=${credentialsFile}, AWS_REGION=${validRegion}`);
                  console.log(`[${serverName}] Verified credentials file contains [default] profile with valid keys and region`);
                } catch (fileError: any) {
                  console.error(`[${serverName}] CRITICAL: Failed to create credentials file: ${fileError.message}`);
                  // If file creation fails, we MUST use environment variables
                  // But boto3 will still look for default profile, so we need to ensure env vars are set
                  delete env.AWS_PROFILE; // Don't set profile if we can't create file
                  env.AWS_SHARED_CREDENTIALS_FILE = '/dev/null';
                  env.AWS_CONFIG_FILE = '/dev/null';
                  env.AWS_SDK_LOAD_CONFIG = 'false';
                  console.warn(`[${serverName}] Falling back to environment variables only (boto3 may still look for default profile)`);
                }
                
                // LAYER 5: CRITICAL - Ensure all AWS environment variables are explicitly set
                // Python boto3 will use these in priority order
                // Also set AWS_DEFAULT_REGION explicitly
                if (!env.AWS_DEFAULT_REGION) {
                  env.AWS_DEFAULT_REGION = env.AWS_REGION || 'us-east-1';
                }
                
                // LAYER 6: Final verification - log all env vars to ensure they're set
                const envVarsSet = {
                  AWS_ACCESS_KEY_ID: !!env.AWS_ACCESS_KEY_ID && env.AWS_ACCESS_KEY_ID.length > 0,
                  AWS_SECRET_ACCESS_KEY: !!env.AWS_SECRET_ACCESS_KEY && env.AWS_SECRET_ACCESS_KEY.length > 0,
                  AWS_REGION: !!env.AWS_REGION && /^[a-z]{2}-[a-z]+-\d+$/.test(env.AWS_REGION),
                  AWS_DEFAULT_REGION: !!env.AWS_DEFAULT_REGION && /^[a-z]{2}-[a-z]+-\d+$/.test(env.AWS_DEFAULT_REGION),
                  AWS_SHARED_CREDENTIALS_FILE: env.AWS_SHARED_CREDENTIALS_FILE && env.AWS_SHARED_CREDENTIALS_FILE !== '/dev/null',
                  AWS_CONFIG_FILE: env.AWS_CONFIG_FILE && env.AWS_CONFIG_FILE !== '/dev/null',
                  AWS_PROFILE: env.AWS_PROFILE || 'not set',
                };
                
                // Log credential status (without exposing secrets)
                if (env.AWS_SHARED_CREDENTIALS_FILE && env.AWS_SHARED_CREDENTIALS_FILE !== '/dev/null') {
                  console.log(`[${serverName}] AWS credentials configured via credentials file with [default] profile`);
                  console.log(`[${serverName}] AWS_PROFILE='default', AWS_SHARED_CREDENTIALS_FILE=${env.AWS_SHARED_CREDENTIALS_FILE}`);
                } else {
                  console.log(`[${serverName}] AWS credentials configured via environment variables (Access Key ID: ${env.AWS_ACCESS_KEY_ID.substring(0, 4)}..., Region: ${env.AWS_REGION})`);
                  console.warn(`[${serverName}] WARNING: Using env vars only - boto3 may still look for default profile`);
                }
                console.log(`[${serverName}] Environment variables verification:`, JSON.stringify(envVarsSet, null, 2));
                
                // LAYER 7: Final check - if any critical env var is missing, throw error
                if (!envVarsSet.AWS_ACCESS_KEY_ID || !envVarsSet.AWS_SECRET_ACCESS_KEY || !envVarsSet.AWS_REGION) {
                  throw new Error(`[${serverName}] AWS environment variables incomplete after setup. Check: ${JSON.stringify(envVarsSet)}`);
                }
              } else {
                const errorMsg = `[${serverName}] AWS credentials incomplete. Access Key: ${hasAccessKey}, Secret Key: ${hasSecretKey}. Cannot proceed without valid credentials.`;
                console.error(errorMsg);
                throw new Error(errorMsg);
              }
            } else {
              env.AWS_ACCESS_KEY_ID = token;
              env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
              env.AWS_DEFAULT_REGION = env.AWS_REGION;
              
              // Ensure region is always valid (double-check)
              if (!/^[a-z]{2}-[a-z]+-\d+$/.test(env.AWS_REGION)) {
                console.warn(`[${serverName}] Invalid AWS_REGION in env: "${env.AWS_REGION}", forcing to us-east-1`);
                env.AWS_REGION = 'us-east-1';
                env.AWS_DEFAULT_REGION = 'us-east-1';
              }
            }
          } else {
            // Generic token env var pattern
            env[`${serverName.toUpperCase()}_TOKEN`] = token;
          }
        }
        
        // Also handle custom environment variables
        // But filter out invalid template variables for AWS
        if (credentials && typeof credentials === 'object' && credentials.customEnv) {
          for (const [key, value] of Object.entries(credentials.customEnv)) {
            // Skip template variables (contain ${} or similar patterns)
            if (typeof value === 'string' && (value.includes('${') || value.includes('{{') || value.includes('each_region'))) {
              console.warn(`[${serverName}] Skipping invalid environment variable ${key} (template variable): ${value}`);
              continue;
            }
            // For AWS_REGION, ensure it's already set correctly (we handled it above)
            if (key === 'AWS_REGION' && (serverName === 'aws-core' || serverName === 'aws')) {
              continue; // Already set above with validation
            }
            env[key] = value;
          }
        }
        
        // For GitHub MCP server, validate token is present before starting
        if (serverName === 'github' && !env.GITHUB_PERSONAL_ACCESS_TOKEN && !env.GITHUB_TOKEN) {
          throw new Error('GitHub MCP server requires GITHUB_PERSONAL_ACCESS_TOKEN or GITHUB_TOKEN. Please provide a GitHub personal access token.');
        }
        
        // For Cloudflare Container MCP (using mcp-remote), ensure token is in env
        if (serverName === 'cloudflare-container') {
          const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
          if (!cloudflareToken) {
            throw new Error('CLOUDFLARE_API_TOKEN not found in environment. Cloudflare Container MCP requires this token.');
          }
          env.CLOUDFLARE_API_TOKEN = cloudflareToken;
          console.log(`[${serverName}] Using CLOUDFLARE_API_TOKEN from environment for mcp-remote (internal use only)`);
        }
        
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env,
        });
        
        client = new Client(
          {
            name: 'compliance-copilot',
            version: '0.1.0',
          },
          {
            capabilities: {},
          }
        );
        
        // Add error handler for process exit - this helps debug why the process closes
        if (transport && typeof transport.on === 'function') {
          transport.on('close', () => {
            console.warn(`[${serverName}] Transport closed - process may have exited unexpectedly`);
            if (serverName === 'github') {
              const tokenStatus = env.GITHUB_PERSONAL_ACCESS_TOKEN || env.GITHUB_TOKEN ? 'present' : 'missing';
              console.warn(`[${serverName}] GitHub MCP server process exited. Token status: ${tokenStatus}`);
              console.warn(`[${serverName}] Check:\n1. GITHUB_PERSONAL_ACCESS_TOKEN is valid\n2. Token has required scopes (repo, read:org)\n3. Package @modelcontextprotocol/server-github is installed\n4. If package is deprecated, install Go binary from GitHub releases`);
            }
          });
        }
        
        try {
          await client.connect(transport);
        } catch (connectError: any) {
          // If connection fails immediately, provide helpful error message
          if (serverName === 'github') {
            if (connectError.message?.includes('closed') || connectError.code === -1) {
              const tokenStatus = env.GITHUB_PERSONAL_ACCESS_TOKEN || env.GITHUB_TOKEN ? 'present' : 'missing';
              const packageInfo = '@modelcontextprotocol/server-github (deprecated)';
              throw new Error(`GitHub MCP server connection failed (process exited immediately).\n\nDiagnosis:\n- Token status: ${tokenStatus}\n- Package: ${packageInfo}\n\nPossible causes:\n1. Missing or invalid GITHUB_PERSONAL_ACCESS_TOKEN\n2. Token missing required scopes (repo, read:org)\n3. Package ${packageInfo} may not work - consider installing Go binary\n4. Server process crashed on startup\n\nSolutions:\n- Ensure GITHUB_PERSONAL_ACCESS_TOKEN is set with valid token\n- Token must have 'repo' and 'read:org' scopes\n- Test manually: npx -y @modelcontextprotocol/server-github\n- Or install Go binary from: https://github.com/github/github-mcp-server/releases\n- Or use Docker: ghcr.io/github/github-mcp-server\n\nOriginal error: ${connectError.message}`);
            }
          }
          throw connectError;
        }
        
        // CRITICAL: Store client IMMEDIATELY after connection, before verification
        // This prevents race conditions where listTools is called before storage
        this.clients.set(serverName, client);
        console.log(`[${serverName}] Client stored immediately after stdio connection`);
        
        // Small delay to ensure connection is established
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify connection by listing tools (with timeout)
        try {
          const tools = await Promise.race([
            client.listTools(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Connection timeout')), 15000)
            )
          ]) as any;
          
          if (!tools || tools.length === 0) {
            console.warn(`[${serverName}] Connected but no tools available`);
          } else {
            console.log(`[${serverName}] Connected successfully with ${tools.tools?.length || tools.length || 0} tools available`);
          }
        } catch (verifyError: any) {
          console.warn(`[${serverName}] Connection verification failed:`, verifyError.message);
          // Don't throw - connection might still work, but log the issue
          // Client is already stored, so we can continue
        }
        
        // Final verification that client is stored
        if (!this.clients.has(serverName)) {
          console.error(`[${serverName}] CRITICAL: Client lost from map after verification! Re-storing...`);
          this.clients.set(serverName, client);
        }
        
        // Verify client is valid before returning
        if (!client) {
          throw new Error(`Client is undefined for ${serverName} after connection`);
        }
        
        return client;
      } catch (error: any) {
        console.error(`Failed to connect to MCP server ${serverName}:`, error);
        // If connection exists but failed, try to close it
        if (client) {
          try {
            await client.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }
        throw new Error(`Failed to connect to ${serverName}: ${error.message}`);
      }
    } else if (config.type === 'sse' || config.type === 'http') {
      if (!config.url) {
        throw new Error(`${config.type} transport requires URL for server ${serverName}`);
      }
      
      try {
        // Polyfill EventSource for Node.js (SSEClientTransport requires it)
        // EventSource is a browser API, so we need a Node.js-compatible implementation
        // Load polyfill BEFORE importing MCP SDK modules that use EventSource
        if (typeof globalThis.EventSource === 'undefined' || typeof globalThis.EventSource !== 'function') {
          try {
            // Use require for CommonJS module (eventsource is CommonJS)
            // The eventsource package exports EventSource as the default export
            const eventsourceModule = require('eventsource');
            
            // Handle different export patterns
            // eventsource can export as: default, EventSource, or direct class
            const EventSourcePolyfill = eventsourceModule.default || 
                                       eventsourceModule.EventSource || 
                                       eventsourceModule;
            
            // Verify it's a constructor function
            if (typeof EventSourcePolyfill !== 'function') {
              throw new Error(`EventSource polyfill is not a constructor function. Type: ${typeof EventSourcePolyfill}, Keys: ${Object.keys(eventsourceModule).join(', ')}`);
            }
            
            // @ts-ignore - Polyfill EventSource globally
            globalThis.EventSource = EventSourcePolyfill;
            
            // Verify it's set correctly
            if (typeof globalThis.EventSource !== 'function') {
              throw new Error('Failed to set EventSource polyfill - not a function after assignment');
            }
            
            console.log(`[${serverName}] EventSource polyfill loaded and verified for Node.js`);
          } catch (polyfillError: any) {
            console.error(`[${serverName}] Failed to load EventSource polyfill:`, polyfillError.message);
            throw new Error(`EventSource polyfill required for SSE transport in Node.js. Install eventsource package: npm install eventsource. Error: ${polyfillError.message}`);
          }
        } else {
          // Verify existing EventSource is a constructor
          if (typeof globalThis.EventSource !== 'function') {
            console.warn(`[${serverName}] EventSource exists but is not a function, reloading polyfill...`);
            const eventsourceModule = require('eventsource');
            const EventSourcePolyfill = eventsourceModule.default || eventsourceModule.EventSource || eventsourceModule;
            // @ts-ignore
            globalThis.EventSource = EventSourcePolyfill;
          }
        }
        
        // Import transport dynamically
        // The MCP SDK exports SSEClientTransport for connecting to remote SSE servers
        // For Cloudflare Container MCP, use SSEClientTransport to connect to the remote server
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const sseModule = await import('@modelcontextprotocol/sdk/client/sse.js');
        
        // The SDK exports SSEClientTransport (not SSEServerTransport)
        // SSEClientTransport is used to connect TO a remote SSE server (client-side)
        const SSEClientTransport = sseModule.SSEClientTransport || sseModule.default;
        
        if (!SSEClientTransport || typeof SSEClientTransport !== 'function') {
          throw new Error(`SSEClientTransport not found. Available exports: ${Object.keys(sseModule).join(', ')}`);
        }
        
        // Build URL with authentication
        let transportUrl = new URL(config.url);
        
        // Get token for authentication
        // For Cloudflare Container MCP, always use CLOUDFLARE_API_TOKEN from env (internal use only)
        let token: string | undefined;
        if (serverName === 'cloudflare-container') {
          // Cloudflare Container MCP is for internal use only - use env token
          token = process.env.CLOUDFLARE_API_TOKEN;
          if (!token) {
            throw new Error('CLOUDFLARE_API_TOKEN not found in environment. Cloudflare Container MCP requires this token.');
          }
          console.log(`[${serverName}] Using CLOUDFLARE_API_TOKEN from environment (internal use only)`);
        } else {
          // For other servers, use provided credentials or config
          if (typeof credentials === 'string') {
            token = credentials;
          } else if (credentials) {
            token = credentials.accessToken || credentials.apiToken || credentials.token || credentials.apiKey;
          }
          if (!token) {
            token = config.apiToken || config.apiKey;
          }
        }
        
        // For Cloudflare Container MCP, add token as query parameter for SSE transport
        if (token && serverName === 'cloudflare-container') {
          transportUrl.searchParams.set('token', token);
          console.log(`[${serverName}] Added authentication token to URL`);
        }
        
        // Create transport instance
        const transport = new SSEClientTransport(transportUrl);
        console.log(`[${serverName}] Using SSEClientTransport to connect to remote server at ${config.url}`);
        
        // Add error handlers for SSE transport to handle disconnections gracefully
        // The transport may have an EventSource that can disconnect
        if (transport && typeof transport.on === 'function') {
          transport.on('error', (error: any) => {
            console.warn(`[${serverName}] SSE transport error:`, error?.message || error?.toString() || 'Unknown error');
            // Don't throw - let the connection attempt continue
          });
          
          transport.on('close', () => {
            console.warn(`[${serverName}] SSE transport closed - connection may have been terminated`);
            // Remove client from map if connection is closed
            if (this.clients.has(serverName)) {
              this.clients.delete(serverName);
            }
          });
        }
        
        // Enable keep-alive for SSE connections to prevent timeout disconnections
        // EventSource automatically handles HTTP keep-alive, but we monitor connection health
        try {
          // Access the underlying EventSource if available (after connection is established)
          // We'll set this up after the connection is made
          (transport as any)._serverName = serverName;
          
          // Note: EventSource (via eventsource polyfill) automatically handles HTTP keep-alive
          // The connection will stay alive as long as the server sends periodic data or comments
          // We just need to ensure we handle disconnections gracefully (already done above)
        } catch (keepAliveError) {
          // Keep-alive setup is optional - don't fail connection if it doesn't work
          console.warn(`[${serverName}] Could not set up keep-alive monitor:`, keepAliveError);
        }
        
        client = new Client(
          {
            name: 'compliance-copilot',
            version: '0.1.0',
          },
          {
            capabilities: {},
          }
        );
        
        try {
          await client.connect(transport);
        } catch (connectError: any) {
          // Handle SSE connection errors more gracefully
          if (connectError.message?.includes('terminated') || connectError.message?.includes('disconnected')) {
            throw new Error(`SSE connection to ${serverName} was terminated. This may be due to:\n1. Server timeout (idle connections close after ~5 minutes)\n2. Network/proxy timeout\n3. Server process restart\n\nTry reconnecting or check server status. Original error: ${connectError.message}`);
          }
          throw connectError;
        }
        
        // Small delay to ensure connection is established
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify connection by listing tools (with timeout and retry logic)
        let verificationAttempts = 2;
        let verificationSuccess = false;
        
        while (verificationAttempts > 0 && !verificationSuccess) {
          try {
            const tools = await Promise.race([
              client.listTools(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), 20000)
              )
            ]) as any;
            
            if (!tools || (tools.tools && tools.tools.length === 0) || (Array.isArray(tools) && tools.length === 0)) {
              console.warn(`[${serverName}] Connected but no tools available`);
            } else {
              console.log(`[${serverName}] Connected successfully with ${tools.tools?.length || tools.length || 0} tools available`);
            }
            verificationSuccess = true;
          } catch (verifyError: any) {
            verificationAttempts--;
            
            // Check if it's an SSE disconnection error
            if (verifyError.message?.includes('terminated') || verifyError.message?.includes('disconnected') || verifyError.message?.includes('SSE stream')) {
              console.warn(`[${serverName}] SSE stream disconnected during verification (attempt ${2 - verificationAttempts}/2):`, verifyError.message);
              
              if (verificationAttempts === 0) {
                // Last attempt failed - try to reconnect
                console.log(`[${serverName}] All verification attempts failed, connection may be unstable`);
                // Don't throw - store client anyway and let it be retried on first tool call
              } else {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
              }
            } else {
              console.warn(`[${serverName}] Connection verification failed:`, verifyError.message);
              // For non-SSE errors, don't retry
              break;
            }
          }
        }
        
        // Store the client IMMEDIATELY after connection (even if verification had issues)
        // This ensures it's available for subsequent tool calls
        this.clients.set(serverName, client);
        
        // Double-check the client is stored
        if (!this.clients.has(serverName)) {
          console.error(`[${serverName}] CRITICAL: Client was not stored in map after connection!`);
          this.clients.set(serverName, client);
        }
        
        console.log(`[${serverName}] Client stored in map. Total connections: ${this.clients.size}`);
        return client;
      } catch (error: any) {
        console.error(`Failed to connect to MCP server ${serverName}:`, error);
        // If connection exists but failed, try to close it
        if (client) {
          try {
            await client.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }
        throw new Error(`Failed to connect to ${serverName}: ${error.message}`);
      }
    } else {
      throw new Error(`Unsupported transport type: ${config.type}`);
    }
  }

  /**
   * Reconnect to an MCP server using stored credentials
   * Useful for agentic workflows where connections might drop
   */
  async reconnect(serverName: string): Promise<Client> {
    const credentials = this.connectionCredentials.get(serverName);
    if (!credentials) {
      throw new Error(`No stored credentials for ${serverName}. Please connect first.`);
    }
    
    // Remove existing connection if any
    if (this.clients.has(serverName)) {
      try {
        const oldClient = this.clients.get(serverName);
        if (oldClient) {
          await oldClient.close();
        }
      } catch (error) {
        // Ignore close errors
      }
      this.clients.delete(serverName);
    }
    
    // Also clear any pending connection promises
    this.connectionPromises.delete(serverName);
    
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`MCP server ${serverName} not registered`);
    }
    
    const client = await this._doConnect(serverName, config, credentials);
    
    // CRITICAL: Ensure client is stored before returning
    // _doConnect should store it, but verify and store if needed
    if (!client) {
      throw new Error(`Failed to create client for ${serverName}`);
    }
    
    if (!this.clients.has(serverName)) {
      console.warn(`[${serverName}] Client not in map after reconnect, storing now...`);
      this.clients.set(serverName, client);
    }
    
    // Final verification
    const storedClient = this.clients.get(serverName);
    if (!storedClient || storedClient !== client) {
      console.error(`[${serverName}] CRITICAL: Client storage verification failed!`);
      this.clients.set(serverName, client);
    }
    
    return client;
  }

  /**
   * Get OAuth authorization URL for a server
   */
  getOAuthUrl(serverName: string, redirectUri: string, state?: string): string {
    const config = this.configs.get(serverName);
    if (!config || !config.oauth) {
      throw new Error(`Server ${serverName} does not support OAuth`);
    }

    const params = new URLSearchParams({
      client_id: config.oauth.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.oauth.scopes.join(' '),
      ...(state && { state }),
    });

    // Atlassian requires audience parameter
    if (serverName === 'atlassian') {
      params.append('audience', 'api.atlassian.com');
      params.append('prompt', 'consent');
    }

    return `${config.oauth.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange OAuth code for access token
   */
  async exchangeOAuthCode(
    serverName: string,
    code: string,
    redirectUri: string
  ): Promise<string> {
    const config = this.configs.get(serverName);
    if (!config || !config.oauth) {
      throw new Error(`Server ${serverName} does not support OAuth`);
    }

    // Build request body
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.oauth.clientId,
      client_secret: config.oauth.clientSecret,
    });

    // Atlassian requires audience in token exchange
    if (serverName === 'atlassian') {
      bodyParams.append('audience', 'api.atlassian.com');
    }

    const response = await fetch(config.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: bodyParams,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.statusText} - ${errorText}`);
    }

    // GitHub returns form-encoded, others return JSON
    const contentType = response.headers.get('content-type');
    let data: any;
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      // Handle form-encoded response (GitHub)
      const text = await response.text();
      const params = new URLSearchParams(text);
      data = {
        access_token: params.get('access_token'),
        token_type: params.get('token_type'),
        scope: params.get('scope'),
      };
    }

    if (!data.access_token) {
      throw new Error('No access token in OAuth response');
    }

    return data.access_token;
  }

  /**
   * Call an MCP tool
   */
  /**
   * Sanitize GitHub search query to ensure valid GitHub Search API syntax
   * GitHub Search API doesn't support AND/OR with parentheses like the web UI
   * Must include at least one qualifier: repo:, user:, org:, etc.
   * 
   * Key restrictions:
   * - No `+`, `AND`, `OR`, `NOT` operators
   * - No `/**` patterns (confuses parser)
   * - Multi-word phrases must be in quotes
   * - Special characters need proper escaping or quotes
   */
  private sanitizeGitHubSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return 'user:@me';
    }

    let sanitized = query.trim();

    // Remove invalid operators (AND, OR, NOT)
    sanitized = sanitized
      .replace(/\s+OR\s+/gi, ' ')
      .replace(/\s+AND\s+/gi, ' ')
      .replace(/\s+NOT\s+/gi, ' ')
      .trim();

    // Remove parentheses (not supported in API)
    sanitized = sanitized
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .trim();

    // Remove problematic patterns like `/**` (confuses parser)
    sanitized = sanitized.replace(/\s*\/\*\*\s*/g, ' ');

    // Handle `+` operator - it's treated as logical operator, not literal
    // Replace standalone `+` with space, or remove it if it's part of expressions like "SELECT + FROM"
    sanitized = sanitized
      .replace(/\s+\+\s+/g, ' ') // Replace "term + term" with "term term"
      .replace(/\s+\+$/g, '') // Remove trailing +
      .replace(/^\+\s+/g, '') // Remove leading +
      .trim();

    // Extract qualifiers (repo:, user:, org:, filename:, path:, language:, etc.)
    const qualifierPattern = /(repo:|user:|org:|filename:|path:|language:|extension:)[^\s]+/gi;
    const qualifiers: string[] = [];
    let match;
    while ((match = qualifierPattern.exec(sanitized)) !== null) {
      qualifiers.push(match[0]);
    }

    // Remove qualifiers from the query string to process the rest
    let queryText = sanitized;
    qualifiers.forEach(q => {
      queryText = queryText.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    });
    queryText = queryText.trim();

    // Process query text - wrap multi-word phrases and special patterns in quotes
    // Split by spaces and identify phrases that need quoting
    const words = queryText.split(/\s+/).filter(w => w.length > 0);
    const processedWords: string[] = [];
    
    for (const word of words) {
      // If already quoted, keep as is
      if ((word.startsWith('"') && word.endsWith('"')) || (word.startsWith("'") && word.endsWith("'"))) {
        processedWords.push(word);
        continue;
      }

      // Check if it's a multi-word phrase or contains special characters that need quoting
      const needsQuoting = 
        word.includes('.') || // e.g., "hashlib.md5", "Cipher.getInstance"
        word.includes('(') || // e.g., "cursor.execute("
        word.includes(')') ||
        word.includes('/') || // e.g., "DES/ECB"
        word.length > 1 && word.includes('_') || // e.g., "AWS_ACCESS_KEY_ID"
        /^[A-Z][A-Z_]+$/.test(word); // All caps words like "SELECT", "FROM", "BEGIN", "RSA", "PRIVATE", "KEY"

      if (needsQuoting && !word.startsWith('"')) {
        processedWords.push(`"${word}"`);
      } else {
        processedWords.push(word);
      }
    }

    // Reconstruct query with qualifiers first, then processed words
    let result = '';
    
    // Ensure at least one qualifier (user:, repo:, or org:)
    const hasUserRepoOrg = qualifiers.some(q => /^(repo:|user:|org:)/i.test(q));
    if (!hasUserRepoOrg) {
      result = 'user:@me';
    } else {
      // Add all qualifiers
      result = qualifiers.join(' ');
    }

    // Add processed query text
    if (processedWords.length > 0) {
      result = result ? `${result} ${processedWords.join(' ')}` : processedWords.join(' ');
    }

    // Final cleanup - remove extra whitespace
    result = result.replace(/\s+/g, ' ').trim();

    // If result is empty or just qualifiers, add a simple search term
    if (!result || result === 'user:@me' || /^(repo:|user:|org:)/i.test(result) && processedWords.length === 0) {
      result = result ? result : 'user:@me';
    }

    return result;
  }

  /**
   * Sanitize tool parameters to remove template variables and ensure valid values
   */
  private sanitizeToolParameters(serverName: string, toolName: string, args: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = { ...args };
    
    // For AWS tools, ensure region is valid
    if (serverName === 'aws-core' || serverName === 'aws') {
      // Get the region from environment or use default
      const validRegion = process.env.AWS_REGION || 'us-east-1';
      
      // Check all parameters for template variables or invalid regions
      // Do this FIRST before any other processing
      for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string') {
          // Check if it's a template variable (more aggressive detection)
          const isTemplateVar = value.includes('${') || value.includes('{{') || 
                               value.includes('each_region') || value.includes('task_') ||
                               value.includes('_from_task') || value.includes('_from_') ||
                               value.startsWith('${') || value.includes('${each');
          
          if (isTemplateVar) {
            console.warn(`[${serverName}] Sanitizing parameter ${key}: template variable detected "${value}"`);
            
            // If it's a region-related parameter, ALWAYS replace with valid region
            if (key.toLowerCase().includes('region') || key.toLowerCase().includes('region_name') || 
                key.toLowerCase() === 'region' || key.toLowerCase() === 'region_name') {
              sanitized[key] = validRegion;
              console.log(`[${serverName}] FORCE replaced ${key}="${value}" with valid region: ${validRegion}`);
            } else {
              // For other template variables, remove the parameter
              delete sanitized[key];
              console.warn(`[${serverName}] Removed parameter ${key} due to template variable`);
            }
          }
          // Validate region format if it's a region parameter (even if not a template variable)
          else if ((key.toLowerCase().includes('region') || key.toLowerCase().includes('region_name') || 
                   key.toLowerCase() === 'region' || key.toLowerCase() === 'region_name') && 
                   !/^[a-z]{2}-[a-z]+-\d+$/.test(value)) {
            console.warn(`[${serverName}] Invalid region format in ${key}: "${value}", using default: ${validRegion}`);
            sanitized[key] = validRegion;
          }
        }
      }
      
      // Ensure region is always set for AWS tools that might need it
      // CloudWatch, CloudTrail, GuardDuty, Inspector, Macie, Trusted Advisor, IAM Access Analyzer all need region
      const toolNameLower = toolName.toLowerCase();
      const needsRegion = toolNameLower.includes('cloudwatch') || toolNameLower.includes('cloudtrail') || 
                          toolNameLower.includes('guardduty') || toolNameLower.includes('inspector') || 
                          toolNameLower.includes('macie') || toolNameLower.includes('trusted') || 
                          toolNameLower.includes('analyzer') || toolNameLower.includes('logs') ||
                          toolNameLower.includes('describe_log') || toolNameLower.includes('get_log') ||
                          toolNameLower.includes('log_group') || toolNameLower.includes('log_stream') ||
                          toolNameLower.includes('cloudwatch_logs') || toolNameLower.includes('cw_logs');
      
      // FORCE set region for tools that need it, overriding ANY existing value (including template variables)
      if (needsRegion) {
        sanitized.region_name = validRegion;
        sanitized.region = validRegion; // Some tools might use 'region' instead of 'region_name'
        // Also remove any other region-related keys that might have template variables
        Object.keys(sanitized).forEach(key => {
          if ((key.toLowerCase().includes('region') || key.toLowerCase() === 'region') && 
              key !== 'region_name' && key !== 'region') {
            delete sanitized[key];
          }
        });
        console.log(`[${serverName}] FORCE-SET region=${validRegion} for ${toolName} (CloudWatch/Logs tool requires region)`);
      } else if (!sanitized.region && !sanitized.region_name && !sanitized.regionName) {
        // For other AWS tools, only add if explicitly needed
        sanitized.region_name = validRegion;
        console.log(`[${serverName}] Added region_name=${validRegion} to ${toolName} parameters`);
      }
    }
    
    return sanitized;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    let client = this.clients.get(serverName);
    if (!client) {
      // Try to reconnect if credentials are stored
      const credentials = this.connectionCredentials.get(serverName);
      if (credentials) {
        console.warn(`[${serverName}] Client not in map but credentials exist, attempting to reconnect...`);
        try {
          client = await this.reconnect(serverName);
          console.log(`[${serverName}] Successfully reconnected for tool call`);
        } catch (reconnectError: any) {
          throw new Error(`Server ${serverName} not connected and reconnection failed: ${reconnectError.message}. Please connect this MCP server first.`);
        }
      } else {
        throw new Error(`Server ${serverName} not connected. Please connect this MCP server first.`);
      }
    }

    try {
      // Check if client is still connected (with timeout)
      try {
        await Promise.race([
          client.listTools(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection check timeout')), 5000))
        ]);
      } catch (checkError: any) {
        // Connection might be closed, try to reconnect automatically
        if (checkError.message?.includes('closed') || checkError.message?.includes('ClosedResourceError') || checkError.message?.includes('session was closed')) {
          console.warn(`[${serverName}] Connection appears closed, attempting to reconnect...`);
          this.clients.delete(serverName);
          
          // Try to reconnect automatically
          try {
            client = await this.reconnect(serverName);
            console.log(`[${serverName}] Successfully reconnected`);
          } catch (reconnectError: any) {
            throw new Error(`Connection to ${serverName} was closed and reconnection failed: ${reconnectError.message}`);
          }
        } else {
          // If it's just a timeout, continue - connection might still work
          console.warn(`[${serverName}] Connection health check timeout, but continuing with tool call`);
        }
      }

      // Sanitize parameters before calling tool
      const sanitizedArgs = this.sanitizeToolParameters(serverName, toolName, args || {});
      
      // GitHub-specific parameter validation and query sanitization
      if (serverName === 'github') {
        // search_repositories requires 'query' parameter
        if (toolName === 'search_repositories') {
          if (!sanitizedArgs.query || typeof sanitizedArgs.query !== 'string' || sanitizedArgs.query.trim() === '') {
            // Provide a default query if missing or invalid
            sanitizedArgs.query = 'user:@me';
            console.warn(`[${serverName}] search_repositories called without valid query parameter, using default: ${sanitizedArgs.query}`);
          }
          // Debug logging: log the exact query being sent
          console.log(`[${serverName}] search_repositories query:`, sanitizedArgs.query);
        }
        // search_code requires 'q' parameter and valid GitHub Search API syntax
        if (toolName === 'search_code') {
          if (!sanitizedArgs.q && !sanitizedArgs.query) {
            // Provide a default query if missing - must include repo/user/org qualifier
            sanitizedArgs.q = 'user:@me filename:.env';
            console.warn(`[${serverName}] search_code called without q/query parameter, using default: ${sanitizedArgs.q}`);
          } else {
            // Sanitize the query to ensure it's valid GitHub Search API syntax
            const query = sanitizedArgs.q || sanitizedArgs.query;
            if (!query || typeof query !== 'string' || query.trim() === '') {
              sanitizedArgs.q = 'user:@me filename:.env';
              console.warn(`[${serverName}] search_code query was empty or invalid, using default: ${sanitizedArgs.q}`);
            } else {
              sanitizedArgs.q = this.sanitizeGitHubSearchQuery(query);
            }
            // Remove query if it was set (we use 'q' for search_code)
            delete sanitizedArgs.query;
          }
          // Debug logging: log the exact query being sent
          console.log(`[${serverName}] search_code q:`, sanitizedArgs.q);
        }
      }

      // Debug logging: log all parameters before tool call
      if (serverName === 'github' && (toolName === 'search_code' || toolName === 'search_repositories')) {
        console.log(`[${serverName}] Calling ${toolName} with parameters:`, JSON.stringify(sanitizedArgs, null, 2));
      }

      const result = await Promise.race([
        client.callTool({
          name: toolName,
          arguments: sanitizedArgs,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool call timeout')), 30000)
        )
      ]) as any;

      // Extract content from MCP response
      // MCP SDK returns { content: [{ type: 'text', text: '...' }] }
      if (result && result.content && Array.isArray(result.content)) {
        // If there's text content, return it
        const textContent = result.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
          .join('\n');
        
        if (textContent) {
          // Try to parse as JSON if it looks like JSON
          try {
            return JSON.parse(textContent);
          } catch {
            return textContent;
          }
        }
        
        // If there's image or other content, return the full content array
        if (result.content.length > 0) {
          return result.content;
        }
      }

      return result;
    } catch (error: any) {
      console.error(`Error calling tool ${toolName} on ${serverName}:`, error);
      throw new Error(`Failed to call tool ${toolName} on ${serverName}: ${error.message}`);
    }
  }

  /**
   * List available tools from a server
   */
  async listTools(serverName: string): Promise<any[]> {
    let client = this.clients.get(serverName);
    if (!client) {
      // Try to reconnect if credentials are stored
      const credentials = this.connectionCredentials.get(serverName);
      if (credentials) {
        console.warn(`[${serverName}] Client not in map for listTools but credentials exist, attempting to reconnect...`);
        try {
          client = await this.reconnect(serverName);
          // Verify client was stored and is valid
          if (!client) {
            throw new Error('Reconnect returned undefined client');
          }
          // Double-check client is in map
          if (!this.clients.has(serverName)) {
            console.warn(`[${serverName}] Client still not in map after reconnect, storing now...`);
            this.clients.set(serverName, client);
          }
          console.log(`[${serverName}] Successfully reconnected for listTools`);
        } catch (reconnectError: any) {
          throw new Error(`Server ${serverName} not connected and reconnection failed: ${reconnectError.message}`);
        }
      } else {
        throw new Error(`Server ${serverName} not connected`);
      }
    }

    // Final safety check - ensure client is valid
    if (!client) {
      throw new Error(`Client for ${serverName} is undefined after reconnection`);
    }

    try {
      // Add timeout to prevent hanging
      const response = await Promise.race([
        client.listTools(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool listing timeout')), 20000)
        )
      ]) as any;
      
      // MCP SDK returns { tools: [...] }
      const tools = response.tools || [];
      
      if (tools.length === 0) {
        console.warn(`[${serverName}] No tools returned from listTools() - response:`, JSON.stringify(response).substring(0, 200));
      }
      
      return tools;
    } catch (error: any) {
      console.error(`Error listing tools from ${serverName}:`, error);
      
      // Check if it's a connection closed error
      if (error.message?.includes('closed') || error.message?.includes('ClosedResourceError') || error.message?.includes('session was closed')) {
        // Try to reconnect automatically
        console.log(`[${serverName}] Connection closed, attempting to reconnect...`);
        this.clients.delete(serverName);
        
        try {
          const reconnectedClient = await this.reconnect(serverName);
          if (!reconnectedClient) {
            throw new Error('Reconnect returned undefined client');
          }
          // Ensure client is stored
          if (!this.clients.has(serverName)) {
            this.clients.set(serverName, reconnectedClient);
          }
          console.log(`[${serverName}] Successfully reconnected, retrying listTools...`);
          
          // Retry listing tools after reconnection
          const response = await Promise.race([
            reconnectedClient.listTools(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Tool listing timeout')), 20000)
            )
          ]) as any;
          
          const tools = response.tools || [];
          if (tools.length === 0) {
            console.warn(`[${serverName}] No tools returned from listTools() after reconnection`);
          }
          
          return tools;
        } catch (reconnectError: any) {
          throw new Error(`Connection to ${serverName} was closed and reconnection failed: ${reconnectError.message}`);
        }
      }
      
      throw new Error(`Failed to list tools from ${serverName}: ${error.message}`);
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      try {
        await client.close();
      } catch (error: any) {
        console.warn(`[${serverName}] Error closing connection:`, error.message);
      } finally {
        this.clients.delete(serverName);
        this.connectionCredentials.delete(serverName);
        this.connectionPromises.delete(serverName);
      }
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.clients.keys());
    const promises = serverNames.map(name => 
      this.disconnect(name).catch(error => {
        console.warn(`[${name}] Error during disconnect:`, error.message);
      })
    );
    await Promise.allSettled(promises);
  }
}

// Singleton instance
export const mcpClientManager = new MCPClientManager();

