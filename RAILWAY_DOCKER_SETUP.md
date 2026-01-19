# Railway Docker Setup Guide

## Quick Setup

### Step 1: Set Root Directory in Railway

1. Go to Railway Dashboard → Your Project → Backend Service
2. Click **Settings** tab
3. Scroll to **Source** section
4. Set **Root Directory** to: `backend`
5. Click **Save**

### Step 2: Railway Auto-Detection

Railway will automatically:
- ✅ Detect `Dockerfile` in the backend directory
- ✅ Use Docker builder
- ✅ Build and deploy the container

## Dockerfile Location

The Dockerfile is located at:
- **Repository**: `backend/Dockerfile`
- **When Root Directory = `backend`**: Railway sees it as `Dockerfile` (relative to backend/)

## Build Process

The Dockerfile will:
1. Use Node.js 20.6.0
2. Install dependencies: `npm ci`
3. Build TypeScript: `npm run build`
4. Start server: `npm start`

## Troubleshooting

### Error: "Dockerfile does not exist"

**Cause**: Root Directory not set correctly

**Solution**:
1. Go to Railway Settings → Source
2. Verify **Root Directory** is set to: `backend`
3. Save and redeploy

### Error: "Cannot find module"

**Cause**: Dependencies not installed

**Solution**: Check Dockerfile has `RUN npm ci` before build step

### Error: "npm start missing script"

**Cause**: Building from wrong directory

**Solution**: Ensure Root Directory is `backend` so Dockerfile runs in correct context

## Verification

After deployment, check Railway logs:
```
Step 1/7 : FROM node:20.6.0-alpine
Step 2/7 : WORKDIR /app
Step 3/7 : COPY package*.json ./
Step 4/7 : RUN npm ci
Step 5/7 : COPY . .
Step 6/7 : RUN npm run build
Step 7/7 : CMD ["npm", "start"]
```

## Files

- `backend/Dockerfile` - Docker configuration
- `backend/.dockerignore` - Files excluded from build
- `railway.json` - Railway configuration (uses Dockerfile)
