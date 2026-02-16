# Vercel Build Cost Control

This project now uses an `ignoreCommand` to skip unnecessary deployments:

- `vercel.json`  
  `ignoreCommand: "npm run vercel:ignore-build"`
- Script: `scripts/vercel-ignore-build.mjs`

## How It Works

The ignore script checks changed files between the previous and current commit.

- Exit `0`: skip deployment build
- Exit `1`: continue deployment build

Build runs only when runtime-relevant files changed, including:

- `src/**`
- `public/**`
- `supabase/migrations/**`
- `next.config.*`
- `package.json`, lockfiles
- `tsconfig*.json`
- `tailwind.config.*`, `postcss.config.*`
- `vercel.json`

Docs-only or operational note commits are skipped to reduce on-demand concurrent build usage.

## Local Check

```bash
npm run vercel:ignore-build
```

## Operational Recommendations

1. Keep `On-demand Concurrent Builds` at minimum in Vercel project settings.
2. Avoid force-pushing multiple commits in short bursts to active PR branches.
3. Batch small non-runtime changes into fewer commits.
4. Confirm skipped builds in Vercel deployment logs (`[vercel-ignore]` prefix).

## Fallback

If the diff check fails unexpectedly, the script defaults to **build** (safe mode).

