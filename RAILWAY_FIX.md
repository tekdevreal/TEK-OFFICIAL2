# Railway Dockerfile Fix

## Problem

Railway is auto-detecting the root `Dockerfile` instead of using `backend/Dockerfile`, causing build errors because root `package.json` doesn't have a `build` script.

## Solution

### Option 1: Delete Root Dockerfile (Recommended)

The root `Dockerfile` has been deleted. Railway should now use `backend/Dockerfile` when you set:

**Railway Settings:**
- **Dockerfile Path**: `backend/Dockerfile`

### Option 2: Use Root Directory

Alternatively, set:
- **Root Directory**: `backend`
- **Dockerfile Path**: `Dockerfile` (relative to backend/)

## Railway Configuration

1. Go to Railway Dashboard → Your Service → Settings
2. **Docker Settings:**
   - **Dockerfile Path**: `backend/Dockerfile` ⚠️ **Set this!**
   - **Watch Paths**: (empty or `backend/**`)
3. **Build Settings:**
   - **Build Command**: (empty - auto-detected)
   - **Start Command**: (empty - auto-detected)

## After Configuration

Railway will:
1. ✅ Use `backend/Dockerfile`
2. ✅ Build from `backend/` directory
3. ✅ Find `package.json` with `build` script
4. ✅ Build TypeScript successfully
5. ✅ Start the server

## Verification

Build logs should show:
```
Step 1/7 : FROM node:20.6.0-alpine
Step 2/7 : WORKDIR /app
Step 3/7 : COPY package*.json ./
Step 4/7 : RUN npm ci
Step 5/7 : COPY . .
Step 6/7 : RUN npm run build  ← Should work now!
Step 7/7 : CMD ["npm", "start"]
```
