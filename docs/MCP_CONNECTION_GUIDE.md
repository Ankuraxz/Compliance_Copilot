# 🔗 MCP Connection Guide

> **Connect your external services to Compliance Copilot** using OAuth or BYOK (Bring Your Own Key) authentication methods.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Connection Methods](#connection-methods)
- [OAuth Setup](#oauth-setup)
- [Service-Specific Guides](#service-specific-guides)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Step 1: Navigate to Connections

1. Go to **Dashboard** → **MCP Connections** tab
2. Select the service you want to connect
3. Choose your authentication method:
   - **OAuth** (Recommended) - One-click secure connection
   - **BYOK** - Manual credential entry

### Step 2: Configure OAuth Callback URL

**Important**: Before setting up OAuth connections, configure your application URL:

```env
# Local development
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Production
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

**Callback URL Format**: `${NEXT_PUBLIC_APP_URL}/api/auth/oauth/{serverName}/callback`

**Examples**:
- GitHub (local): `http://localhost:3000/api/auth/oauth/github/callback`
- GitHub (production): `https://your-domain.com/api/auth/oauth/github/callback`
- Atlassian: `https://your-domain.com/api/auth/oauth/atlassian/callback`

---

## 🔐 Connection Methods

### OAuth 2.0/2.1 (Recommended) ✅

**Best for**: Services that support OAuth (GitHub, Atlassian, Cloudflare, etc.)

**Advantages**:
- ✅ One-click connection through the UI
- ✅ Tokens managed automatically
- ✅ Can be revoked easily
- ✅ More secure (no credential storage)

**How it works**:
1. Click **"OAuth"** button on the service
2. You'll be redirected to authorize the app
3. Grant necessary permissions
4. You'll be redirected back with a secure token
5. Connection is established automatically

### BYOK (Bring Your Own Key) 🔑

**Best for**: Services requiring API keys/tokens or environment variables

**Advantages**:
- ✅ Full control over credentials
- ✅ Works with any service
- ✅ Can use existing API keys

**How it works**:
1. Click **"BYOK"** button on the service
2. Choose authentication type:
   - **API Key** - Single key authentication
   - **API Token** - Token-based authentication
   - **Environment Variables** - JSON format for multiple variables
3. Enter your credentials
4. For SSE/HTTP servers (like Instana), provide the server URL
5. Click **"Connect"**

---

## 🌐 OAuth Setup

### Prerequisites

1. **Set Environment Variable**:
   ```env
   NEXT_PUBLIC_APP_URL="https://your-domain.com"
   ```

2. **Create OAuth App** in the service's developer portal

3. **Configure Callback URL**:
   - Use the format: `${NEXT_PUBLIC_APP_URL}/api/auth/oauth/{serverName}/callback`
   - Example: `https://your-domain.com/api/auth/oauth/github/callback`

4. **Copy Credentials**:
   - Client ID
   - Client Secret
   - (These are configured server-side)

### OAuth Flow

```
User → Click "OAuth" → Redirect to Service → Authorize → Callback → Token Stored → Connected ✅
```

---

## 📚 Service-Specific Guides

### ☁️ Cloud & Infrastructure

#### AWS Core

**Method**: BYOK (Environment Variables)

**Required Credentials**:
```json
{
  "AWS_ACCESS_KEY_ID": "your_access_key_id",
  "AWS_SECRET_ACCESS_KEY": "your_secret_access_key",
  "AWS_REGION": "us-east-1"
}
```

**How to Get**:
1. AWS Console → IAM → Users → Your User → Security Credentials
2. Create Access Key
3. Download or copy Access Key ID and Secret Access Key
4. Note your AWS Region

**Required Permissions**:
- EC2, S3, RDS, IAM, CloudWatch, Lambda, and other services you want to analyze

---

#### Azure

**Method**: BYOK (Environment Variables)

**Required Credentials**:
```json
{
  "AZURE_CLIENT_ID": "your_client_id",
  "AZURE_CLIENT_SECRET": "your_client_secret",
  "AZURE_TENANT_ID": "your_tenant_id"
}
```

**How to Get**:
1. Azure Portal → Azure Active Directory → App Registrations
2. Create new app registration (or use existing)
3. Note Application (client) ID and Directory (tenant) ID
4. Go to Certificates & secrets → Create new client secret
5. Copy the secret value (you won't see it again!)

**Required Permissions**:
- `Azure Service Management` (for resource management)
- `User.Read` (for authentication)

---

#### Google Cloud (GCloud)

**Method**: BYOK (Environment Variables)

**Required Credentials**:
```json
{
  "GCLOUD_PROJECT": "your-project-id",
  "GOOGLE_APPLICATION_CREDENTIALS": "path/to/service-account-key.json"
}
```

**How to Get**:
1. Google Cloud Console → IAM & Admin → Service Accounts
2. Create service account
3. Download JSON key file
4. Note your Project ID

---

#### Cloudflare

**Method**: OAuth or BYOK (API Token)

**OAuth Setup**:
1. Cloudflare Dashboard → My Profile → API Tokens
2. Create OAuth Client (if available)
3. Note Client ID and Secret

**BYOK Setup**:
1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token with permissions: `Zone:Read`, `Account:Read`
3. Copy the token

---

### 💻 Code & CI/CD

#### GitHub

**Method**: OAuth (Recommended) or BYOK (Personal Access Token)

**OAuth Setup**:
1. GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App
3. Set Authorization callback URL:
   - **Local**: `http://localhost:3000/api/auth/oauth/github/callback`
   - **Production**: `https://your-domain.com/api/auth/oauth/github/callback`
4. Note Client ID and Client Secret

**BYOK Setup**:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Select scopes: `repo`, `read:org`, `read:user`
4. Copy the token

---

#### ArgoCD

**Method**: BYOK (API Token)

**Required Credentials**:
```json
{
  "ARGOCD_API_TOKEN": "your_token",
  "ARGOCD_SERVER": "https://your-argocd-server.com",
  "ARGOCD_USERNAME": "your_username"
}
```

**How to Get**:
1. Log in to ArgoCD CLI or UI
2. Generate token: `argocd account generate-token`
3. Or get from ArgoCD UI → User Info → Generate New Token
4. Note your ArgoCD server URL

---

#### SonarQube

**Method**: BYOK (API Token)

**Required Credentials**:
```json
{
  "SONARQUBE_TOKEN": "your_token",
  "SONARQUBE_URL": "https://your-sonarqube-server.com"
}
```

**How to Get**:
1. Log in to SonarQube
2. Go to My Account → Security → Generate Token
3. Copy the token
4. Note your SonarQube server URL

---

### 📊 Monitoring & Observability

#### Instana

**Method**: BYOK (API Key + Server URL)

**Prerequisites**:
1. Deploy Instana MCP server:
   ```bash
   # Option 1: Docker
   docker run -p 8080:8080 mcp-instana
   
   # Option 2: Direct
   python -m mcp_instana
   ```

2. Get your Instana API key from your Instana instance

**Required Information**:
- **Server URL**: Your Instana MCP server URL (e.g., `http://localhost:8080/mcp` or your deployed server)
- **API Key**: Your Instana API key

**How to Connect**:
1. Go to Dashboard → MCP Connections → Monitoring
2. Click **"BYOK"** on Instana
3. Select **"API Key"**
4. Enter:
   - **Server URL**: Your Instana MCP server URL
   - **API Key**: Your Instana API key
5. Click **"Connect"**

**Reference**: [Instana MCP Server](https://github.com/instana/mcp-instana)

---

#### Grafana

**Method**: BYOK (API Key)

**Required Credentials**:
```json
{
  "GRAFANA_API_KEY": "your_api_key",
  "GRAFANA_URL": "https://your-grafana-instance.com",
  "GRAFANA_USER": "your_username"
}
```

**How to Get**:
1. Log in to Grafana
2. Go to Configuration → API Keys
3. Create new API key
4. Copy the key
5. Note your Grafana instance URL

---

#### Sentry

**Method**: BYOK (API Token)

**Required Credentials**:
```json
{
  "SENTRY_API_TOKEN": "your_token",
  "SENTRY_ORG": "your-org-slug",
  "SENTRY_PROJECT": "your-project-slug"
}
```

**How to Get**:
1. Go to Sentry → Settings → Auth Tokens
2. Create new token
3. Select scopes: `org:read`, `project:read`, `event:read`
4. Copy the token
5. Note your Organization slug and Project slug

---

#### DASH0

**Method**: BYOK (API Key)

**Required Credentials**:
```json
{
  "DASH0_API_KEY": "your_api_key"
}
```

**How to Get**:
1. Sign up at DASH0
2. Go to Dashboard → API Keys
3. Create API key
4. Copy the key

---

### 💬 Communication & Documentation

#### Atlassian (JIRA/Confluence)

**Method**: OAuth (Recommended) or BYOK (API Token)

**OAuth Setup**:
1. Go to https://developer.atlassian.com/console/myapps/
2. Create a new OAuth 2.0 integration
3. Set Authorization callback URL: `https://your-domain.com/api/auth/oauth/atlassian/callback`
4. Note Client ID and Client Secret
5. Add scopes: `read:jira-work`, `read:confluence-content.all`

**BYOK Setup**:
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create API token
3. Copy the token
4. Note your domain (e.g., `your-domain.atlassian.net`)

---

#### Notion

**Method**: BYOK (API Key)

**How to Get**:
1. Go to https://www.notion.so/my-integrations
2. Create new integration
3. Copy the Internal Integration Token
4. Note your Workspace ID

---

### 🔍 Analysis & Research

#### Firecrawl

**Note**: This tool is provided by you to facilitate LLM inspection and research capabilities.

**Method**: BYOK (API Key)

**How to Get**:
1. Sign up at https://firecrawl.dev
2. Go to Dashboard → API Keys
3. Copy your API key

---

#### Perplexity AI

**Note**: This tool is provided by you to facilitate LLM inspection and research capabilities.

**Method**: BYOK (API Key)

**How to Get**:
1. Sign up at https://www.perplexity.ai
2. Go to Settings → API
3. Generate API key
4. Copy the key

---

#### Browserbase

**Note**: This tool is provided by you to facilitate LLM inspection and research capabilities.

**Method**: BYOK (Environment Variables)

**Required Credentials**:
```json
{
  "BROWSERBASE_API_KEY": "your_api_key",
  "BROWSERBASE_PROJECT_ID": "your_project_id"
}
```

**How to Get**:
1. Sign up at https://www.browserbase.com
2. Go to Dashboard → API Keys
3. Create API key
4. Copy the key and Project ID

---

## 🔒 Security Best Practices

### ✅ Do's

- **Use OAuth when available**: More secure, can be revoked easily
- **Rotate credentials regularly**: Especially for API keys/tokens
- **Use least privilege**: Grant only necessary permissions
- **Never share credentials**: Each user should have their own connections
- **Monitor connections**: Regularly review connected services in the dashboard
- **Use environment variables**: For sensitive credentials in production

### ❌ Don'ts

- **Don't commit credentials**: Never commit API keys or tokens to version control
- **Don't share credentials**: Each user should manage their own connections
- **Don't use admin credentials**: Create service accounts with minimal permissions
- **Don't ignore expiration**: Rotate credentials before they expire

---

## 🐛 Troubleshooting

### Connection Fails

**Checklist**:
1. ✅ **Verify credentials**: Ensure API keys/tokens are valid and not expired
2. ✅ **Check permissions**: Ensure credentials have required scopes/permissions
3. ✅ **Network access**: Ensure your server can reach the service APIs
4. ✅ **Review logs**: Check browser console and server logs for errors
5. ✅ **Test manually**: Try accessing the service API directly with your credentials

### OAuth Redirect Issues

**Common Problems**:

1. **Callback URL mismatch**:
   - ✅ Verify `NEXT_PUBLIC_APP_URL` is set correctly in your `.env` file
   - ✅ Callback URL format: `${NEXT_PUBLIC_APP_URL}/api/auth/oauth/{serverName}/callback`
   - ✅ Example: `https://your-domain.com/api/auth/oauth/github/callback`
   - ✅ Must match exactly what's configured in OAuth app

2. **CORS errors**:
   - ✅ Check that your domain is allowed in the OAuth app settings
   - ✅ Verify CORS headers are configured correctly

3. **Token expiration**:
   - ✅ Clear browser cookies and retry
   - ✅ Re-authorize the app

### BYOK Not Working

**Common Issues**:

1. **Invalid JSON format**:
   - ✅ Ensure JSON is valid (use a JSON validator)
   - ✅ Check for trailing commas
   - ✅ Verify all strings are properly quoted

2. **Wrong environment variable names**:
   - ✅ Use exact names as documented (case-sensitive)
   - ✅ Check service-specific documentation

3. **Special characters**:
   - ✅ Escape special characters in JSON properly
   - ✅ Use base64 encoding for complex values if needed

4. **SSE/HTTP server URL**:
   - ✅ For servers like Instana, ensure the MCP server is running
   - ✅ Verify the URL is accessible from your server
   - ✅ Check that the URL includes the `/mcp` endpoint

### Service-Specific Issues

#### AWS
- **"Config profile (default) could not be found"**:
  - ✅ Ensure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` are set
  - ✅ Verify credentials are valid and have proper permissions

#### GitHub
- **"GITHUB_PERSONAL_ACCESS_TOKEN not found"**:
  - ✅ Ensure token is set in environment variables
  - ✅ Verify token has required scopes: `repo`, `read:org`

#### Instana
- **Connection timeout**:
  - ✅ Verify Instana MCP server is running
  - ✅ Check that the server URL is correct and accessible
  - ✅ Ensure API key is valid

---

## 📖 Additional Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [MCP Servers Registry](https://mcpservers.org)
- [Compliance Copilot README](../README.md)
- [MCP Integration Technical Docs](../mcp/README.md)

---

## 💡 Need Help?

- **Documentation**: Check the [README.md](../README.md) for general setup
- **Technical Details**: Review [MCP Integration docs](../mcp/README.md)
- **Issues**: Open an issue on GitHub for bugs or feature requests
- **Support**: Contact support for enterprise assistance

---

**Last Updated**: 2025-01-27