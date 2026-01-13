# Prisma Setup for Supabase with pgvector

## Important: Database Migration Approach

This project uses **Supabase with pgvector extension**, which requires a special migration approach.

### ❌ Don't Use `prisma migrate dev`

The `prisma migrate dev` command requires a shadow database, but Supabase's `pgvector` extension is not available in Prisma's shadow database. This will cause errors like:

```
ERROR: extension "pgvector" is not available
```

### ✅ Use `prisma db push` Instead

For Supabase with pgvector, use `prisma db push` which directly applies schema changes without requiring a shadow database:

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes to database
npm run db:push
```

### When to Use Each Command

- **`npm run db:push`**: Use for development and when working with Supabase + pgvector
  - Directly applies schema changes
  - No shadow database required
  - Faster for development iterations

- **`prisma migrate dev`**: Not recommended for this setup
  - Requires shadow database
  - pgvector extension not available in shadow DB
  - Will fail with the error shown above

### Production Migrations

For production deployments:
1. Use `prisma db push` to apply schema changes
2. Or manually create migrations after ensuring pgvector is installed in all environments
3. The `compliance_embeddings` table is managed separately via SQL (see README)

### Schema Changes Workflow

1. Edit `prisma/schema.prisma`
2. Run `npm run db:push` to apply changes
3. Run `npm run db:generate` to regenerate Prisma client
4. Restart your development server

### Troubleshooting

If you see shadow database errors:
- Make sure you're using `npm run db:push` not `prisma migrate dev`
- The error occurs because Prisma tries to validate migrations against a shadow database
- `db:push` bypasses this validation step

