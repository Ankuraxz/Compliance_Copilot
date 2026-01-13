# Deployment Guide - Compliance Copilot

This guide covers deploying Compliance Copilot to Vercel with all required services and configurations.

## Prerequisites

- Vercel account
- Supabase account (for database and storage)
- Redis instance (for Mem0 agent memory)
- OpenAI API key
- GitHub account (for OAuth, if using GitHub MCP)
- AWS/Azure/Cloudflare account (for cloud MCP connections)

## Architecture Overview

```
┌─────────────┐
│   Vercel    │  Next.js App (Frontend + API Routes)
└──────┬──────┘
       │
       ├──> Supabase (PostgreSQL + Storage)
       ├──> Redis (Mem0 for agent memory)
       ├──> OpenAI API
       └──> MCP Servers (GitHub, AWS, Azure, etc.)
```

## Step 1: Set Up Supabase

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Create a new project
   - Note your project URL and anon key

2. **Run Database Schema Push**
   ```bash
   # Set DATABASE_URL in your environment
   export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
   
   # Push schema (Prisma is installed as dependency, no need to install globally)
   npx prisma db push
   ```
   
   **Note**: For Supabase with pgvector, use `db:push` instead of `migrate`. The Prisma CLI is included in dependencies for Vercel builds.

3. **Enable pgvector Extension**
   ```sql
   -- Run in Supabase SQL Editor
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. **Create Storage Bucket**
   - Go to Storage in Supabase dashboard
   - Create bucket: `compliance-reports`
   - Set to public (or configure RLS policies)

## Step 2: Set Up Redis

1. **Choose Redis Provider**
   - **Option A: Upstash** (Recommended for Vercel)
     - Go to https://upstash.com
     - Create Redis database
     - Note connection URL
   
   - **Option B: Redis Cloud**
     - Go to https://redis.com/cloud
     - Create database
     - Note connection URL

2. **Configure Redis**
   - Set `REDIS_URL` environment variable
   - Ensure TTL is configured (12 hours default)

## Step 3: Configure Environment Variables

Add these to Vercel project settings:

### Required Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]

# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# Redis (Mem0)
REDIS_URL=redis://[host]:[port] or rediss://[host]:[port] (for TLS)

# OpenAI
OPENAI_API_KEY=[your-openai-api-key]
OPENAI_CHAT_MODEL=gpt-4o  # or gpt-4-turbo

# OAuth (Optional - for MCP OAuth connections)
GITHUB_CLIENT_ID=[github-oauth-client-id]
GITHUB_CLIENT_SECRET=[github-oauth-client-secret]

# Internal Services (Optional)
PERPLEXITY_API_KEY=[perplexity-api-key]  # For web research
FIRECRAWL_API_KEY=[firecrawl-api-key]    # For web scraping
BROWSERBASE_API_KEY=[browserbase-api-key]  # For browser automation
CLOUDFLARE_API_TOKEN=[cloudflare-api-token]  # For Cloudflare Container MCP
```

### Optional Variables

```env
# Custom domain
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Analytics (optional)
NEXT_PUBLIC_GA_ID=[google-analytics-id]
```

## Step 4: Deploy to Vercel

1. **Connect Repository**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Login
   vercel login
   
   # Link project
   vercel link
   ```

2. **Configure Build Settings**
   - Framework Preset: Next.js
   - Build Command: `npm run build` (or `next build`)
   - Output Directory: `.next`
   - Install Command: `npm install`
   
   **Important**: Prisma CLI is included in `dependencies` (not `devDependencies`) to ensure `prisma generate` runs during the Vercel build process. The `postinstall` script automatically generates the Prisma Client after installation.

3. **Set Environment Variables**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add all variables from Step 3
   - Set for: Production, Preview, Development

4. **Deploy**
   ```bash
   # Deploy to production
   vercel --prod
   
   # Or push to main branch (auto-deploy)
   git push origin main
   ```

## Step 5: Post-Deployment Configuration

1. **Verify Health Check**
   - Visit `/api/health` to verify all services are up
   - Should return 200 with all services showing "up"

2. **Verify Database Connection**
   - Check Vercel logs for database connection errors
   - Verify Prisma migrations ran successfully
   - Run: `npx prisma db push` if needed

3. **Test MCP Connections**
   - Go to `/dashboard` → MCP Connections tab
   - Connect GitHub (required)
   - Connect at least one cloud service (AWS/Azure/Cloudflare/GCloud)

4. **Verify Storage**
   - Run a test compliance analysis
   - Check that reports are saved to Supabase Storage
   - Verify download functionality

5. **Check Redis Connection**
   - Monitor Vercel logs for Redis connection errors
   - Verify agent memory is being stored
   - Check Redis memory usage

6. **Test Authentication**
   - Test login/signup flow
   - Verify session persistence
   - Test protected routes

## Step 6: Production Optimizations

### 1. Enable Edge Functions (Optional)
   - Configure Supabase Edge Functions for faster API responses
   - Update API routes to use Edge Runtime where appropriate

### 2. Configure Caching
   - Add Redis caching for frequently accessed data
   - Configure Next.js ISR for static pages

### 3. Set Up Monitoring
   - Enable Vercel Analytics
   - Set up error tracking (Sentry, LogRocket, etc.)
   - Monitor Redis and database usage

### 4. Configure Rate Limiting
   - Add rate limiting to API routes
   - Use Vercel Edge Config or Upstash Rate Limit

## Troubleshooting

### Issue: MCP Connections Fail
**Solution:**
- Verify environment variables are set correctly
- Check that MCP server packages are installed (they run via `npx` or `uvx`)
- Ensure credentials are valid and not expired
- Check Vercel function logs for connection errors

### Issue: Database Connection Errors
**Solution:**
- Verify `DATABASE_URL` is correct
- Check Supabase connection pooling settings
- Ensure pgvector extension is enabled
- Run migrations: `npx prisma migrate deploy`

### Issue: Redis Connection Errors
**Solution:**
- Verify `REDIS_URL` is correct
- Check Redis instance is accessible from Vercel
- Ensure TLS is enabled if using `rediss://`
- Check Redis memory limits

### Issue: Reports Not Saving to Storage
**Solution:**
- Verify Supabase Storage bucket exists: `compliance-reports`
- Check bucket permissions (public or RLS policies)
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check Vercel logs for storage errors

### Issue: Build Failures
**Solution:**
- Check Node.js version (should be 18+)
- Verify all dependencies are in `package.json`
- **Prisma CLI Error**: Ensure `prisma` is in `dependencies` (not `devDependencies`) for Vercel builds
- The `postinstall` script runs `prisma generate` - Prisma CLI must be available
- Check for TypeScript errors: `npm run type-check`
- Review Vercel build logs

### Issue: Module Not Found Errors (MCP SDK)
**Solution:**
- This is handled in `next.config.js` with externals
- If issues persist, ensure `@modelcontextprotocol/sdk` is in `package.json`
- Check that webpack externals are configured correctly

## Environment-Specific Configurations

### Development
```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Preview (Staging)
```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://[preview-url].vercel.app
```

### Production
```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Security Checklist

- [ ] All API keys are stored in Vercel environment variables (not in code)
- [ ] Supabase RLS policies are configured
- [ ] Storage bucket has appropriate access controls
- [ ] Redis connection uses TLS (`rediss://`)
- [ ] OAuth redirect URLs are whitelisted
- [ ] CORS is configured correctly
- [ ] Rate limiting is enabled on API routes

## Scaling Considerations

1. **Database**: Use Supabase connection pooling for high traffic
2. **Redis**: Monitor memory usage, set appropriate TTL (12 hours default)
3. **MCP Servers**: Each connection spawns a process - monitor Vercel function memory
4. **Storage**: Supabase Storage scales automatically, but monitor usage

## Support

For issues or questions:
- Check Vercel logs: Dashboard → Project → Logs
- Check Supabase logs: Dashboard → Logs
- Review application logs in browser console
- Check Redis connection status

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
