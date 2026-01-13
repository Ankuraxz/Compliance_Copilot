# MCP Connection Guide

This guide explains how to connect your external accounts (AWS, Azure, Atlassian, etc.) to Compliance Copilot using either OAuth or BYOK (Bring Your Own Key).

## OAuth Callback URL Configuration

**Important**: Before setting up OAuth connections, configure your application URL:

1. **Set Environment Variable**:
   - Add to your `.env` file:
     ```env
     # Local development
     NEXT_PUBLIC_APP_URL="http://localhost:3000"
     
     # Production
     NEXT_PUBLIC_APP_URL="https://your-domain.com"
     ```

2. **Callback URL Format**:
   - The callback URL is automatically generated as: `${NEXT_PUBLIC_APP_URL}/api/auth/oauth/{serverName}/callback`
   - Examples:
     - GitHub (local): `http://localhost:3000/api/auth/oauth/github/callback`
     - GitHub (production): `https://your-domain.com/api/auth/oauth/github/callback`
     - Atlassian (local): `http://localhost:3000/api/auth/oauth/atlassian/callback`
     - Cloudflare (production): `https://your-domain.com/api/auth/oauth/cloudflare/callback`

3. **When Creating OAuth Apps**:
   - Use the callback URL format above for each service
   - Make sure the URL matches exactly (including `/api/auth/oauth/` path)

## Connection Methods

### 1. OAuth (Recommended)
- **Best for**: Services that support OAuth 2.0/2.1
- **Security**: Tokens are managed automatically, can be revoked
- **Setup**: One-click connection through the UI

### 2. BYOK (Bring Your Own Key)
- **Best for**: Services that require API keys/tokens or environment variables
- **Security**: You manage your own credentials
- **Setup**: Enter credentials manually in the UI

## How to Connect Accounts

### Via Dashboard UI

1. **Navigate to Dashboard** → **MCP Connections** tab
2. **Select the service** you want to connect (e.g., AWS, Azure, Atlassian)
3. **Choose connection method**:
   - Click **"OAuth"** button if available (recommended)
   - Click **"BYOK"** button to enter credentials manually
4. **Follow the prompts**:
   - **OAuth**: You'll be redirected to authorize the app
   - **BYOK**: Enter your API key, token, or environment variables
5. **Verify connection**: Green checkmark indicates successful connection

---

## Service-Specific Instructions

### AWS Account Connection

#### Option 1: BYOK (Environment Variables) - Recommended

1. **Get AWS Credentials**:
   - Go to AWS Console → IAM → Users → Your User → Security Credentials
   - Create Access Key (if you don't have one)
   - Download or copy:
     - Access Key ID
     - Secret Access Key
   - Note your AWS Region (e.g., `us-east-1`)

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Cloud & Infrastructure
   - Click **"BYOK"** on AWS Core
   - Select **"Environment Variables"**
   - Enter JSON:
     ```json
     {
       "AWS_ACCESS_KEY_ID": "your_access_key_id",
       "AWS_SECRET_ACCESS_KEY": "your_secret_access_key",
       "AWS_REGION": "us-east-1"
     }
     ```
   - Click **"Connect"**

#### Option 2: AWS Profile (Advanced)

If you use AWS CLI profiles:
```json
{
  "AWS_PROFILE": "your-profile-name"
}
```

**Required Permissions**: The AWS credentials need permissions for:
- EC2, S3, RDS, IAM, CloudWatch, Lambda, and other services you want to analyze

---

### Azure Account Connection

#### BYOK (Environment Variables)

1. **Get Azure Credentials**:
   - Go to Azure Portal → Azure Active Directory → App Registrations
   - Create a new app registration (or use existing)
   - Note:
     - Application (client) ID
     - Directory (tenant) ID
   - Go to Certificates & secrets → Create a new client secret
   - Copy the secret value (you won't see it again!)

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Cloud & Infrastructure
   - Click **"BYOK"** on Azure
   - Select **"Environment Variables"**
   - Enter JSON:
     ```json
     {
       "AZURE_CLIENT_ID": "your_client_id",
       "AZURE_CLIENT_SECRET": "your_client_secret",
       "AZURE_TENANT_ID": "your_tenant_id"
     }
     ```
   - Click **"Connect"**

**Required Permissions**: The Azure app needs:
- `Azure Service Management` (for resource management)
- `User.Read` (for authentication)

---

### Atlassian (JIRA/Confluence) Connection

#### Option 1: OAuth (Recommended)

1. **Create OAuth App in Atlassian**:
   - Go to https://developer.atlassian.com/console/myapps/
   - Create a new OAuth 2.0 integration
   - Set Authorization callback URL: `https://your-domain.com/auth/callback`
   - Note Client ID and Client Secret
   - Add scopes: `read:jira-work`, `read:confluence-content.all`

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Communication
   - Click **"OAuth"** on Atlassian
   - Authorize the app when redirected

#### Option 2: BYOK (API Token)

1. **Get API Token**:
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Create API token
   - Copy the token

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Communication
   - Click **"BYOK"** on Atlassian
   - Select **"API Token"**
   - Enter:
     - API Token: `your_api_token`
     - Domain: `your-domain.atlassian.net`
   - Click **"Connect"**

---

### GitHub Connection

#### Option 1: OAuth (Recommended)

1. **Create GitHub OAuth App**:
   - Go to GitHub → Settings → Developer settings → OAuth Apps
   - Create new OAuth App
   - Set Authorization callback URL:
     - **Local development**: `http://localhost:3000/api/auth/oauth/github/callback`
     - **Production**: `https://your-domain.com/api/auth/oauth/github/callback`
     - The callback URL is automatically generated from `NEXT_PUBLIC_APP_URL` environment variable
   - Note Client ID and Client Secret

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Code & CI/CD
   - Click **"OAuth"** on GitHub
   - Authorize the app

#### Option 2: BYOK (Personal Access Token)

1. **Create Personal Access Token**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token (classic)
   - Select scopes: `repo`, `read:org`, `read:user`
   - Copy the token

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Code & CI/CD
   - Click **"BYOK"** on GitHub
   - Select **"API Token"**
   - Enter your token
   - Click **"Connect"**

---

### Cloudflare Connection

#### Option 1: OAuth

1. **Create Cloudflare OAuth App**:
   - Go to Cloudflare Dashboard → My Profile → API Tokens
   - Create OAuth Client (if available)
   - Note Client ID and Secret

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Cloud & Infrastructure
   - Click **"OAuth"** on Cloudflare

#### Option 2: BYOK (API Token)

1. **Get API Token**:
   - Go to Cloudflare Dashboard → My Profile → API Tokens
   - Create Token with permissions: `Zone:Read`, `Account:Read`
   - Copy the token

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Cloud & Infrastructure
   - Click **"BYOK"** on Cloudflare
   - Select **"API Token"**
   - Enter your token
   - Click **"Connect"**

---

### SonarQube Connection

#### BYOK (API Token)

1. **Get SonarQube Token**:
   - Log in to SonarQube
   - Go to My Account → Security → Generate Token
   - Copy the token
   - Note your SonarQube server URL

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Code & CI/CD
   - Click **"BYOK"** on SonarQube
   - Select **"Environment Variables"**
   - Enter JSON:
     ```json
     {
       "SONARQUBE_TOKEN": "your_token",
       "SONARQUBE_URL": "https://your-sonarqube-server.com"
     }
     ```
   - Click **"Connect"**

---

### Sentry Connection

#### BYOK (API Token)

1. **Get Sentry Token**:
   - Go to Sentry → Settings → Auth Tokens
   - Create new token
   - Select scopes: `org:read`, `project:read`, `event:read`
   - Copy the token
   - Note your Organization slug and Project slug

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Monitoring
   - Click **"BYOK"** on Sentry
   - Select **"Environment Variables"**
   - Enter JSON:
     ```json
     {
       "SENTRY_API_TOKEN": "your_token",
       "SENTRY_ORG": "your-org-slug",
       "SENTRY_PROJECT": "your-project-slug"
     }
     ```
   - Click **"Connect"**

---

### ArgoCD Connection

#### BYOK (API Token)

1. **Get ArgoCD Token**:
   - Log in to ArgoCD CLI or UI
   - Generate token: `argocd account generate-token`
   - Or get from ArgoCD UI → User Info → Generate New Token
   - Note your ArgoCD server URL

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Code & CI/CD
   - Click **"BYOK"** on ArgoCD
   - Select **"Environment Variables"**
   - Enter JSON:
     ```json
     {
       "ARGOCD_API_TOKEN": "your_token",
       "ARGOCD_SERVER": "https://your-argocd-server.com",
       "ARGOCD_USERNAME": "your_username"
     }
     ```
   - Click **"Connect"**

---

### Notion Connection

#### BYOK (API Key)

1. **Get Notion API Key**:
   - Go to https://www.notion.so/my-integrations
   - Create new integration
   - Copy the Internal Integration Token
   - Note your Workspace ID

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Communication
   - Click **"BYOK"** on Notion
   - Select **"API Key"**
   - Enter your API key
   - Click **"Connect"**

---

### Firecrawl Connection

**Note**: This tool is provided by you to facilitate LLM inspection and research capabilities.

#### BYOK (API Key)

1. **Get Firecrawl API Key**:
   - Sign up at https://firecrawl.dev
   - Go to Dashboard → API Keys
   - Copy your API key

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Analysis & Research
   - Click **"BYOK"** on Firecrawl
   - Select **"API Key"**
   - Enter your API key
   - Click **"Connect"**

---

### Perplexity AI Connection

**Note**: This tool is provided by you to facilitate LLM inspection and research capabilities.

#### BYOK (API Key)

1. **Get Perplexity API Key**:
   - Sign up at https://www.perplexity.ai
   - Go to Settings → API
   - Generate API key
   - Copy the key

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Analysis & Research
   - Click **"BYOK"** on Perplexity AI
   - Select **"API Key"**
   - Enter your API key
   - Click **"Connect"**

---

### Browserbase Connection

**Note**: This tool is provided by you to facilitate LLM inspection and research capabilities.

#### BYOK (API Key)

1. **Get Browserbase API Key**:
   - Sign up at https://www.browserbase.com
   - Go to Dashboard → API Keys
   - Create API key
   - Copy the key and Project ID

2. **Connect via Dashboard**:
   - Go to Dashboard → MCP Connections → Analysis & Research
   - Click **"BYOK"** on Browserbase
   - Select **"Environment Variables"**
   - Enter JSON:
     ```json
     {
       "BROWSERBASE_API_KEY": "your_api_key",
       "BROWSERBASE_PROJECT_ID": "your_project_id"
     }
     ```
   - Click **"Connect"**

---

## Security Best Practices

1. **Use OAuth when available**: More secure, can be revoked easily
2. **Rotate credentials regularly**: Especially for API keys/tokens
3. **Use least privilege**: Grant only necessary permissions
4. **Never share credentials**: Each user should have their own connections
5. **Monitor connections**: Regularly review connected services in the dashboard

## Troubleshooting

### Connection Fails

1. **Check credentials**: Ensure API keys/tokens are valid and not expired
2. **Verify permissions**: Ensure credentials have required scopes/permissions
3. **Check network**: Ensure your server can reach the service APIs
4. **Review logs**: Check browser console and server logs for errors

### OAuth Redirect Issues

1. **Verify callback URL**: Must match exactly what's configured in OAuth app
   - Check that `NEXT_PUBLIC_APP_URL` is set correctly in your `.env` file
   - Callback URL format: `${NEXT_PUBLIC_APP_URL}/api/auth/oauth/{serverName}/callback`
   - Example: `http://localhost:3000/api/auth/oauth/github/callback` (local) or `https://your-domain.com/api/auth/oauth/github/callback` (production)
2. **Check CORS**: Ensure your domain is allowed
3. **Clear cookies**: Try clearing browser cookies and retry
4. **Environment variable**: Ensure `NEXT_PUBLIC_APP_URL` matches your actual app URL

### BYOK Not Working

1. **Format check**: Ensure JSON is valid for environment variables
2. **Key names**: Use exact environment variable names as documented
3. **Special characters**: Escape special characters in JSON properly

## Need Help?

- Check the [README.md](../README.md) for general setup
- Review [MCP Integration docs](../mcp/README.md) for technical details
- Open an issue on GitHub for bugs or feature requests

