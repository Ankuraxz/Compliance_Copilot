# MCP Integration

This project uses the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) to integrate with external services and tools.

**Note**: This application acts as an **MCP Client** that connects to various MCP servers. The configuration is managed programmatically in code, not through a settings.json file.

## Available MCP Servers

We use official MCP servers from [mcpservers.org](http://mcpservers.org/):

### 1. **GitHub MCP Server**
- **Purpose**: Code analysis and repository scanning
- **OAuth**: Required (GitHub OAuth App)
- **Setup**: 
  1. Go to https://github.com/settings/developers
  2. Click "New OAuth App"
  3. Fill in:
     - Application name: "Compliance Copilot"
     - Homepage URL: `https://your-domain.com`
     - Authorization callback URL: `https://your-domain.com/api/auth/oauth/github/callback`
  4. Click "Register application"
  5. Copy Client ID and generate Client Secret
  6. Add to `.env`:
     ```
     GITHUB_CLIENT_ID=your_github_client_id
     GITHUB_CLIENT_SECRET=your_github_client_secret
     ```
  7. Required scopes: `repo`, `read:org`

### 2. **Supabase MCP Server**
- **Purpose**: Database and infrastructure analysis
- **OAuth**: Required (Supabase OAuth App)
- **Setup**:
  1. Go to your Supabase Dashboard → Settings → API
  2. Note your Project URL and anon/public key
  3. For OAuth (if Supabase MCP server requires it):
     - Go to Authentication → Providers
     - Configure OAuth provider settings
  4. Some Supabase MCP servers may use API keys instead:
     - Use `SUPABASE_SERVICE_ROLE_KEY` for admin operations
     - Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client operations
  5. Add to `.env`:
     ```
     SUPABASE_CLIENT_ID=your_supabase_client_id (if OAuth)
     SUPABASE_CLIENT_SECRET=your_supabase_client_secret (if OAuth)
     # OR use API keys:
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

### 3. **Cloudflare MCP Server**
- **Purpose**: Cloud infrastructure configuration checking
- **OAuth**: Required (Cloudflare OAuth App)
- **Setup**:
  1. Go to https://dash.cloudflare.com/profile/api-tokens
  2. Create an API Token:
     - Click "Create Token"
     - Use "Edit" template or create custom permissions
     - Required permissions: Read/Write for resources you need
  3. **OR** use OAuth 2.0:
     - Go to https://dash.cloudflare.com/profile/api-tokens
     - Click "OAuth" tab
     - Create OAuth application
     - Set redirect URI: `https://your-domain.com/api/auth/oauth/cloudflare/callback`
  4. Add to `.env`:
     ```
     # For API Token (simpler):
     CLOUDFLARE_API_TOKEN=your_api_token
     
     # OR for OAuth:
     CLOUDFLARE_CLIENT_ID=your_cloudflare_client_id
     CLOUDFLARE_CLIENT_SECRET=your_cloudflare_client_secret
     ```

### 4. **File System MCP Server**
- **Purpose**: Local file system access for documentation
- **OAuth**: Not required
- **Setup**: Set `FILESYSTEM_ROOT` environment variable

### 5. **Playwright MCP Server**
- **Purpose**: Browser automation for testing
- **OAuth**: Not required

### 6. **Tailvy MCP Server**
- **Purpose**: [Add Tailvy's purpose/functionality]
- **OAuth**: May be required (check Tailvy documentation)
- **Setup**: 
  - If OAuth is required, follow Tailvy's OAuth setup documentation
  - Add to `.env`:
    ```
    TAILVY_CLIENT_ID=your_tailvy_client_id
    TAILVY_CLIENT_SECRET=your_tailvy_client_secret
    ```
  - Set redirect URI: `https://your-domain.com/api/auth/oauth/tailvy/callback`

## OAuth Flow

**Note**: Each MCP server may use different OAuth providers and flows. The application handles OAuth per server:

1. User clicks "Connect" for an MCP server in Dashboard → MCP Console
2. Frontend calls `/api/mcp/connect` with server name
3. Backend checks server configuration in `mcp/servers/config.ts`
4. Backend generates OAuth URL using server-specific OAuth settings:
   - GitHub: Uses GitHub OAuth endpoints
   - Supabase: Uses Supabase OAuth endpoints (if configured)
   - Cloudflare: Uses Cloudflare OAuth endpoints
   - Each server has its own `authorizationUrl` and `tokenUrl`
5. User is redirected to the provider's OAuth page
6. After authorization, callback at `/api/auth/oauth/[provider]/callback` receives code
7. Backend exchanges code for access token using server-specific `tokenUrl`
8. Token is stored in secure HTTP-only cookie: `mcp_{serverName}_token`
9. MCP client uses token for authenticated requests to that specific server

**Important**: Each MCP server maintains its own OAuth connection. You must connect to each server separately if you want to use multiple servers.

## Architecture

**Compliance Copilot is an MCP Client** that connects to external MCP servers. The client implementation is in:
- `mcp/client.ts` - MCP client manager with OAuth support
- `mcp/servers/config.ts` - Server configurations
- `app/api/mcp/*` - API routes for MCP operations

The application programmatically connects to MCP servers (not via settings.json), allowing agents to use tools from various services.

## Usage in Application

```typescript
import { mcpClientManager } from '@/mcp/client';
import { registerMCPServers } from '@/mcp/servers/config';

// Register servers (done automatically in API routes)
registerMCPServers(mcpClientManager);

// Connect with OAuth token (from user session)
const client = await mcpClientManager.connect('github', accessToken);

// List available tools
const tools = await mcpClientManager.listTools('github');

// Call a tool (used by agents)
const result = await mcpClientManager.callTool('github', 'list_repos', {});
```

## How Agents Use MCP

The multi-agent system uses MCP servers through the client:

1. **Intake Agent** uses GitHub MCP to crawl repositories
2. **Gap Analysis Agent** uses filesystem MCP to read documentation
3. **Action Planner** can use Linear/Jira MCP to create tickets
4. All agents can access MCP tools via the client manager

## Environment Variables

Each MCP server requires different environment variables based on its authentication method:

```env
# GitHub MCP Server (OAuth required)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Supabase MCP Server (OAuth or API keys)
# Option 1: OAuth
SUPABASE_CLIENT_ID=your_supabase_client_id
SUPABASE_CLIENT_SECRET=your_supabase_client_secret
# Option 2: API Keys (may be used instead)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Cloudflare MCP Server (OAuth or API Token)
# Option 1: OAuth
CLOUDFLARE_CLIENT_ID=your_cloudflare_client_id
CLOUDFLARE_CLIENT_SECRET=your_cloudflare_client_secret
# Option 2: API Token (simpler, may be used instead)
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

# File System MCP Server (No OAuth needed)
FILESYSTEM_ROOT=/path/to/allowed/directory

# Playwright MCP Server (No OAuth needed)
# No environment variables required

# Tailvy MCP Server (OAuth if required)
TAILVY_CLIENT_ID=your_tailvy_client_id
TAILVY_CLIENT_SECRET=your_tailvy_client_secret
```

**Note**: Not all MCP servers use OAuth. Some use API keys, API tokens, or require no authentication. Check each server's documentation for specific requirements.

## References

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP Servers Directory](http://mcpservers.org/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

