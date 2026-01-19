# Frontend Build Guide

## Installation vs Build

### First Time Setup (or after dependency changes)

If this is the first time building, or if `package.json` or `package-lock.json` changed:

```bash
cd frontend
npm install        # Install all dependencies
npm run build      # Build the project
```

### Subsequent Builds (dependencies unchanged)

If dependencies are already installed and haven't changed:

```bash
cd frontend
npm run build      # Only build (no install needed)
```

## Build Process

The `npm run build` command does:
1. **TypeScript compilation** (`tsc -b`) - Compiles TypeScript to JavaScript
2. **Vite build** (`vite build`) - Bundles and optimizes for production

## When to Install vs Just Build

### ✅ Install Required When:
- First time setting up the project
- `package.json` dependencies changed
- `package-lock.json` was updated
- `node_modules` folder is missing or corrupted
- Switching between different Node.js versions

### ✅ Build Only When:
- Dependencies are already installed
- Only source code changed (no dependency updates)
- Rebuilding after code changes

## Quick Check

To check if dependencies are installed:

```bash
cd frontend
ls node_modules    # If this folder exists and has content, dependencies are installed
```

If `node_modules` exists and is populated → **Just build**
If `node_modules` is missing or empty → **Install first, then build**

## Production Build

For production deployment:

```bash
cd frontend

# Ensure dependencies are installed
npm install

# Set environment variable (if not already set)
export VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app

# Build
npm run build
```

The build output will be in `frontend/dist/` directory.

## Environment Variables

**Important:** `VITE_API_BASE_URL` must be set **before** building, as Vite embeds environment variables at build time.

```bash
# Set before building
export VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app
npm run build
```

Or create `.env.production` file:
```env
VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app
```

## Summary

- **First time or dependencies changed**: `npm install && npm run build`
- **Code changes only**: `npm run build`
- **Always set `VITE_API_BASE_URL` before building** (for production)
