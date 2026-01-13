# MCP Server Configurations

This directory contains configurations for MCP servers from [mcpservers.org](http://mcpservers.org/).

## Setup Instructions

### 1. Install MCP Server Packages

Most MCP servers can be run via `npx` without installation, but for production you may want to install them:

```bash
# GitHub MCP Server (if available as npm package)
npm install -g @modelcontextprotocol/server-github

# Or use npx (recommended for development)
npx -y @modelcontextprotocol/server-github
```

### 2. Configure OAuth

For servers requiring OAuth (GitHub, Supabase, Cloudflare):

1. Create OAuth app in the provider's developer console
2. Set redirect URI to: `https://your-domain.com/api/auth/oauth/{provider}/callback`
3. Add credentials to `.env`:
   ```
   {PROVIDER}_CLIENT_ID=your_client_id
   {PROVIDER}_CLIENT_SECRET=your_client_secret
   ```

### 3. Available Servers

- **GitHub**: Code repository analysis
- **Supabase**: Database and infrastructure
- **Cloudflare**: Cloud configuration checking
- **Filesystem**: Local file access (no OAuth)
- **Playwright**: Browser automation

## Adding New MCP Servers

To add a new MCP server:

1. Add configuration to `config.ts`:
```typescript
export const newServerConfig: MCPServerConfig = {
  name: 'new-server',
  type: 'stdio', // or 'sse'
  command: 'npx',
  args: ['-y', '@package/name'],
  oauth: { /* if required */ }
};
```

2. Register in `registerMCPServers()` function
3. Update environment variables if needed

