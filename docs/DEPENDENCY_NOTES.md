# Dependency Compatibility Notes

## HeroUI v3 and Tailwind CSS v3

**Issue**: `@heroui/theme@2.4.25` requires `tailwindcss@>=4.0.0`, but the project uses `tailwindcss@^3.4.0`.

**Why**: HeroUI v3 is designed for Tailwind CSS v4, which is still in development. However, other dependencies like `@tailwindcss/typography@^0.5.19` require Tailwind v3.

**Solution**: We use `--legacy-peer-deps` (configured in `.npmrc`) to allow the installation despite the peer dependency conflict. This works because:
- HeroUI components are compatible with Tailwind v3 in most cases
- The peer dependency requirement is a version check, not a hard runtime requirement
- We're using HeroUI components that don't rely on Tailwind v4-specific features

**Future**: When Tailwind CSS v4 is stable and all dependencies support it, we can upgrade:
1. Upgrade `tailwindcss` to v4
2. Update `tailwind.config.ts` for v4 syntax
3. Remove `legacy-peer-deps` from `.npmrc`
4. Test all components for compatibility

## Installation

The `.npmrc` file automatically applies `--legacy-peer-deps` to all npm commands, so you can install normally:

```bash
npm install
```

If you need to install without legacy peer deps (not recommended):

```bash
npm install --no-legacy-peer-deps
```

