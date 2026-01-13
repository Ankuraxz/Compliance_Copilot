# Compliance Copilot

Automated regulatory readiness (SOC2, GDPR, HIPAA) for startups by analyzing codebases, cloud infrastructure, and documentation using specialized AI agents.

## Features

- 🤖 **Multi-Agent System**: 5 specialized agents (Intake, Regulation RAG, Gap Analysis, Action Planner, Reporting)
- 🐝 **Agent Swarm**: Parallel extraction agents working with multiple MCP tools simultaneously
- 🧠 **Agent Memory (MEM0)**: Persistent memory layer using Redis for agent context and learning
- 🔍 **RAG-Powered Analysis**: Corrective RAG with vector search for compliance requirements
- 🔌 **Comprehensive MCP Integration**: 14+ MCP servers including AWS, Azure, GitHub, Supabase, SonarQube, Sentry, Atlassian, Firecrawl, Perplexity, and more
- 🔑 **OAuth & BYOK Support**: Connect MCP servers via OAuth or Bring Your Own Key (API keys/tokens)
- 📊 **Real-Time Dashboard**: Compliance scores, gap feed, evidence inspector, and MCP console
- 📝 **Detailed Reports**: AI-generated reports with proper evidence citations from all data sources
- 🎫 **Remediation Tracking**: Sync findings to Linear/Jira for task management
- 🔐 **Authentication**: Supabase Auth with email/password

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Shadcn UI, Recharts
- **Backend**: LangGraph for multi-agent orchestration
- **AI/RAG**: OpenAI GPT models (configurable, default: gpt-4o), Supabase pgvector
- **Database**: PostgreSQL with Prisma ORM
- **MCP**: Model Context Protocol for external integrations

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis (for agent memory - MEM0)
- Supabase account (for vector storage)
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd compliance-copilot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.template .env
```

Edit `.env` with your credentials:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/compliance_copilot"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="your_supabase_url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_anon_key"
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# OpenAI
OPENAI_API_KEY="your_openai_key"
OPENAI_CHAT_MODEL="gpt-4o"  # Use "gpt-5.2" or any available model when ready
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_EMBEDDING_DIMS="1536"

# Redis (for MEM0 agent memory)
# Supports local Redis, self-hosted public Redis, or Redis cloud services
# Examples:
#   Local: redis://localhost:6379
#   Public with auth: redis://username:password@your-redis-host.com:6379
#   SSL/TLS: rediss://username:password@your-redis-host.com:6380
REDIS_URL="redis://localhost:6379"

# MCP OAuth (configure per server as needed)
# GitHub MCP Server
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"

# Supabase MCP Server (OAuth or use API keys above)
SUPABASE_CLIENT_ID="your_supabase_client_id"
SUPABASE_CLIENT_SECRET="your_supabase_client_secret"

# Cloudflare MCP Server (OAuth or API Token)
CLOUDFLARE_CLIENT_ID="your_cloudflare_client_id"
CLOUDFLARE_CLIENT_SECRET="your_cloudflare_client_secret"
# OR use API Token instead:
CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"

# File System MCP Server
FILESYSTEM_ROOT="/path/to/allowed/directory"

# Tailvy MCP Server (if OAuth required)
TAILVY_CLIENT_ID="your_tailvy_client_id"
TAILVY_CLIENT_SECRET="your_tailvy_client_secret"
```

4. Set up Redis for agent memory:

**Option 1: Local Redis (Docker - recommended for development)**
```bash
docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
```

**Option 2: Self-hosted Public Redis**
If you have a self-hosted Redis with a public URL, simply set `REDIS_URL` in your `.env`:
```env
# With authentication
REDIS_URL="redis://username:password@your-redis-host.com:6379"

# With SSL/TLS
REDIS_URL="rediss://username:password@your-redis-host.com:6380"

# Without authentication (not recommended for public Redis)
REDIS_URL="redis://your-redis-host.com:6379"
```

**Option 3: Redis Cloud Services**
You can also use Redis cloud services like Upstash, Redis Cloud, or AWS ElastiCache:
```env
# Example: Upstash Redis
REDIS_URL="redis://default:your-password@your-endpoint.upstash.io:6379"
```

**Note**: The application automatically connects to Redis using the `REDIS_URL` environment variable. Ensure your Redis instance is accessible and has proper authentication configured for security.

5. Configure OpenAI model (optional):

The application uses a configurable OpenAI model. By default, it uses `gpt-4o`, but you can change it to any available model:

```env
# In your .env file
OPENAI_CHAT_MODEL="gpt-4o"  # or "gpt-5.2", "gpt-4-turbo", etc.
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_EMBEDDING_DIMS="1536"
```

**Note**: When GPT-5.2 or newer models become available, simply update `OPENAI_CHAT_MODEL` in your `.env` file. All agents will automatically use the new model.

6. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (use db:push instead of migrate for Supabase with pgvector)
npm run db:push
```

**⚠️ Important**: We use `prisma db push` instead of `prisma migrate dev` because:
- Supabase uses the `pgvector` extension which is not available in Prisma's shadow database
- `db:push` directly applies schema changes without requiring a shadow database
- **Never run `prisma migrate dev`** - it will fail with "extension pgvector is not available" error
- See [PRISMA_SETUP.md](./PRISMA_SETUP.md) for detailed migration instructions

7. Set up Supabase Auth:

In your Supabase dashboard:
- Go to Authentication → Providers
- Enable Email provider (enabled by default)
- Configure email templates if needed

8. Set up Supabase vector store:

Run this SQL in your Supabase SQL editor:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE IF NOT EXISTS compliance_embeddings (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector search
CREATE INDEX IF NOT EXISTS compliance_embeddings_embedding_idx 
ON compliance_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_compliance_embeddings(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  framework_filter text DEFAULT NULL,
  type_filter text DEFAULT NULL,
  source_filter text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    compliance_embeddings.id,
    compliance_embeddings.content,
    compliance_embeddings.metadata,
    1 - (compliance_embeddings.embedding <=> query_embedding) as similarity
  FROM compliance_embeddings
  WHERE
    1 - (compliance_embeddings.embedding <=> query_embedding) > match_threshold
    AND (framework_filter IS NULL OR compliance_embeddings.metadata->>'framework' = framework_filter)
    AND (type_filter IS NULL OR compliance_embeddings.metadata->>'type' = type_filter)
    AND (source_filter IS NULL OR compliance_embeddings.metadata->>'source' = source_filter)
  ORDER BY compliance_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

9. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
compliance-copilot/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard pages
│   └── page.tsx          # Home page
├── agents/                # Multi-agent system
│   ├── intake-agent.ts
│   ├── regulation-rag-agent.ts
│   ├── gap-analysis-agent.ts
│   ├── action-planner-agent.ts
│   ├── reporting-agent.ts
│   └── orchestrator.ts
├── components/            # React components
│   ├── dashboard/        # Dashboard components
│   └── ui/               # Shadcn UI components
├── lib/                  # Utilities
│   ├── rag/              # RAG infrastructure
│   ├── memory/           # MEM0-Redis agent memory
│   ├── db.ts             # Prisma client
│   └── utils.ts          # Helper functions
├── mcp/                  # MCP integration
│   ├── client.ts         # MCP client manager
│   └── servers/          # MCP server configs
└── prisma/               # Database schema
    └── schema.prisma
```

## Authentication

The application uses Supabase Auth for user authentication:

- **Email/Password**: Users can sign up and sign in with email and password
- **Protected Routes**: Dashboard and API routes require authentication
- **User Management**: User profiles are stored in the database

## Usage

### Running an Assessment

#### Standard Assessment (Original Agents):
1. Navigate to the Dashboard
2. Select a compliance framework (SOC2, GDPR, HIPAA)
3. Click "Run Assessment"
4. The system will:
   - Crawl your codebase via GitHub MCP
   - Retrieve relevant compliance requirements using RAG
   - Analyze gaps between requirements and reality
   - Generate remediation tasks
   - Create a compliance report

#### Swarm Analysis (Advanced):
1. Connect to MCP servers in Dashboard → MCP Connections
   - Use OAuth for supported servers (GitHub, Supabase, etc.)
   - Use BYOK for API key/token based servers (AWS, Sentry, etc.)
2. Select framework and click "Run Swarm Analysis"
3. The swarm will:
   - **Extract in parallel** from all connected MCP servers:
     - AWS infrastructure and deployments
     - GitHub codebase structure
     - SonarQube quality metrics
     - Sentry error data
     - Atlassian (JIRA/Confluence) documentation
     - Firecrawl web content
     - Perplexity research results
   - **Manager agent** aggregates all extraction results
   - **Report agent** generates comprehensive report with:
     - Executive summary
     - Detailed sections with evidence citations
     - Findings with proper source attribution
     - Compliance scores by category

### Connecting MCP Servers

**📖 For detailed step-by-step instructions, see: [MCP Connection Guide](docs/MCP_CONNECTION_GUIDE.md)**

**Note**: This application acts as an **MCP Client** that connects to MCP servers programmatically (not via settings.json).

#### Quick Start:
1. **Navigate to Dashboard** → **MCP Connections** tab
2. **Select a service** (AWS, Azure, GitHub, Atlassian, etc.)
3. **Choose connection method**:
   - **OAuth** (recommended): Click "OAuth" button → Authorize
   - **BYOK**: Click "BYOK" button → Enter credentials

#### OAuth Connection:
1. Go to Dashboard → MCP Connections
2. Select server category (Cloud, Code, Monitoring, etc.)
3. Click "OAuth" button for the server
4. Complete OAuth flow in browser
5. Connection is stored securely

#### BYOK (Bring Your Own Key) Connection:
1. Go to Dashboard → MCP Connections
2. Click "BYOK" button for the server
3. Enter:
   - **API Key**: For servers using API keys (Firecrawl, Perplexity, etc.)
   - **API Token**: For servers using tokens (Sentry, SonarQube, etc.)
   - **Environment Variables**: JSON format for custom configs (AWS, Azure, etc.)
4. Click "Connect" - connection is tested and stored
5. Credentials are encrypted and stored per user

#### Connection Management:
- View all connections in Dashboard → MCP Connections
- See connection status (connected/disconnected)
- Disconnect servers when no longer needed
- Connections are project-scoped (optional)

#### Service-Specific Setup:
- **AWS**: Connect via BYOK with AWS credentials (Access Key ID, Secret Key, Region)
- **Azure**: Connect via BYOK with Azure app credentials (Client ID, Secret, Tenant ID)
- **Atlassian**: Connect via OAuth or BYOK with API token + domain
- **GitHub**: Connect via OAuth or BYOK with Personal Access Token
- **And more**: See [MCP Connection Guide](docs/MCP_CONNECTION_GUIDE.md) for all services

### Viewing Findings

- **Gap Feed**: See all compliance findings with severity badges
- **Evidence Inspector**: View code snippets and documentation that caused gaps
- **Compliance Scores**: Radial charts showing scores by category

### Syncing to Linear/Jira

1. Select findings in the Gap Feed
2. Click "Sync to Linear/Jira"
3. Remediation tasks are created as tickets
4. Track progress in your project management tool

## MCP Integration & Agent Swarm

**This application acts as an MCP Client** that connects to 14+ MCP servers from [mcpservers.org](http://mcpservers.org/). The system uses an **Agent Swarm** architecture where multiple extraction agents work in parallel to gather data from different MCP tools, coordinated by a manager agent, and synthesized into detailed reports by a report generation agent.

### Available MCP Servers:

#### Cloud & Infrastructure:
- **AWS Core**: Backend deployment, cloud infrastructure, databases (with admin roles)
- **Azure**: Microsoft Azure cloud services (alternative to AWS)
- **Cloudflare**: CDN and edge computing
- **Supabase**: Database, auth, and edge functions (HTTP transport)

#### Code & CI/CD:
- **GitHub**: Code repository analysis and management
- **ArgoCD**: CI/CD and GitOps for frontend deployment
- **SonarQube**: Code quality and security analysis

#### Monitoring & Quality:
- **Sentry**: Error monitoring and performance tracking

#### Communication & Documentation:
- **Notion**: Documentation and knowledge management
- **Atlassian**: JIRA tickets and Confluence documentation

#### Analysis & Research:
- **Firecrawl**: Web scraping and content extraction
- **Perplexity AI**: Research and analysis
- **Browserbase**: Browser automation
- **Playwright**: Browser automation (alternative)

### Authentication Methods:

Each MCP server supports either:
- **OAuth**: Secure OAuth 2.0/2.1 flow (GitHub, Supabase, Cloudflare, Atlassian)
- **BYOK (Bring Your Own Key)**: API keys, tokens, or environment variables (AWS, Azure, Sentry, SonarQube, etc.)

### Agent Swarm Architecture:

1. **Extraction Agents**: Specialized agents for each MCP tool (AWS, GitHub, SonarQube, Sentry, Atlassian, Firecrawl, Perplexity)
2. **Manager Agent**: Coordinates parallel extraction, aggregates results
3. **Report Agent**: Generates detailed analysis reports with proper evidence citations

## Development

### Adding a New Agent

1. Create agent file in `agents/`
2. Implement agent logic with LangGraph
3. Add to orchestrator in `agents/orchestrator.ts`

### Adding a New MCP Server

1. Add configuration in `mcp/servers/config.ts`
2. Register in `registerMCPServers()`
3. Update OAuth settings if needed

### Database Migrations

```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

