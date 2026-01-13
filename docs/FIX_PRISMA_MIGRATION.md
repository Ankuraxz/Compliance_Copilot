# Fix Prisma Migration Error

## Problem

You're seeing this error:
```
ERROR: extension "pgvector" is not available
Migration `001_init` failed to apply cleanly to the shadow database.
```

This happens because:
- Prisma's `migrate dev` command uses a shadow database to validate migrations
- Supabase uses the `pgvector` extension which isn't available in Prisma's shadow database
- The shadow database is a temporary database Prisma creates for validation

## Solution

**Use `prisma db push` instead of `prisma migrate dev`**

### Step 1: Remove existing migrations (optional)

If you have existing migrations that are causing issues:

```bash
# Remove migrations directory (we'll use db:push instead)
rm -rf prisma/migrations
```

### Step 2: Use db:push for schema changes

```bash
# Generate Prisma client
npm run db:generate

# Push schema directly to database (no shadow database needed)
npm run db:push
```

### Step 3: Verify

After running `db:push`, verify your schema is applied:

```bash
# Open Prisma Studio to see your database
npm run db:studio
```

## Why This Works

- `prisma db push` directly applies schema changes to your database
- It doesn't require a shadow database
- It works perfectly with Supabase and pgvector
- It's faster for development iterations

## For Future Schema Changes

Always use:
```bash
npm run db:push
```

Never use:
```bash
prisma migrate dev  # ❌ Will fail with pgvector error
```

## Production Deployments

For production:
1. Use `prisma db push` to apply schema changes
2. Or manually create SQL migrations if you need version control
3. Ensure pgvector is installed in all environments

