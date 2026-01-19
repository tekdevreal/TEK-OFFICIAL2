# Docker Deployment for TEK Backend

This guide covers deploying the backend using Docker on Railway.

## Dockerfile Overview

The `backend/Dockerfile` provides:
- ✅ Node.js 20.6.0 (matches package.json engines)
- ✅ Production-ready build process
- ✅ Optimized layer caching
- ✅ Explicit build steps

## Dockerfile Structure

```dockerfile
FROM node:20.6.0-alpine        # Base image with Node.js
WORKDIR /app                   # Set working directory
COPY package*.json ./          # Copy package files first (for caching)
RUN npm ci                     # Install dependencies
COPY . .                       # Copy source code
RUN npm run build             # Build TypeScript
EXPOSE 10000                   # Expose port
CMD ["npm", "start"]          # Start command
```

## Railway Configuration

### Step 1: Set Root Directory

1. Go to Railway Dashboard
2. Select your backend service
3. Go to **Settings** → **Source**
4. Set **Root Directory** to: `backend`
5. Save

### Step 2: Railway Auto-Detection

Railway will automatically:
- ✅ Detect `backend/Dockerfile`
- ✅ Use Docker builder
- ✅ Build the Docker image
- ✅ Deploy the container

### Step 3: Verify Build

After deployment, check logs:
```
Step 1/7 : FROM node:20.6.0-alpine
Step 2/7 : WORKDIR /app
Step 3/7 : COPY package*.json ./
Step 4/7 : RUN npm ci
Step 5/7 : COPY . .
Step 6/7 : RUN npm run build
Step 7/7 : CMD ["npm", "start"]
```

## Benefits of Dockerfile

### 1. Explicit Build Process
- Clear build steps
- Easy to debug
- Reproducible builds

### 2. Layer Caching
- Package files copied first
- Dependencies cached separately
- Faster rebuilds when only code changes

### 3. Consistent Environment
- Same Node.js version everywhere
- No platform differences
- Works locally and in production

### 4. Easy Local Testing
```bash
# Build locally
cd backend
docker build -t tek-backend .

# Run locally
docker run -p 10000:10000 --env-file .env tek-backend
```

## Local Docker Testing

### Build Image
```bash
cd backend
docker build -t tek-backend .
```

### Run Container
```bash
# With environment variables
docker run -p 10000:10000 \
  -e NODE_ENV=production \
  -e PORT=10000 \
  -e TOKEN_MINT=DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K \
  -e SOLANA_RPC_URL=your_rpc_url \
  tek-backend
```

### Run with .env file
```bash
docker run -p 10000:10000 --env-file .env tek-backend
```

## Troubleshooting

### Build Fails: "Cannot find module"

**Issue**: Dependencies not installed
**Solution**: Check Dockerfile has `RUN npm ci` before build

### Build Fails: "TypeScript errors"

**Issue**: TypeScript compilation errors
**Solution**: Fix TypeScript errors locally first, then rebuild

### Container Exits Immediately

**Issue**: Application crashes on startup
**Solution**: 
1. Check Railway logs
2. Verify all environment variables are set
3. Check `npm start` works locally

### Port Issues

**Issue**: Port not accessible
**Solution**: 
- Railway auto-assigns PORT
- Dockerfile exposes 10000
- Application should use `process.env.PORT || 10000`

## Dockerfile Optimization

### Multi-stage Build (Optional)

For smaller images, you can use multi-stage builds:

```dockerfile
# Build stage
FROM node:20.6.0-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20.6.0-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 10000
CMD ["npm", "start"]
```

This reduces final image size by excluding dev dependencies.

## Railway Environment Variables

All environment variables from `backend/env.md` need to be set in Railway:

1. Go to **Variables** tab
2. Add all required variables
3. Mark secrets appropriately
4. Redeploy after adding variables

## Next Steps

After Docker deployment:
1. ✅ Backend running on Railway
2. ⏳ Test API endpoints
3. ⏳ Deploy frontend
4. ⏳ Deploy telegram bot

## Related Files

- `backend/Dockerfile` - Docker configuration
- `backend/.dockerignore` - Files excluded from Docker build
- `backend/env.md` - Environment variables reference
- `backend/RAILWAY_DEPLOY.md` - Complete Railway deployment guide
