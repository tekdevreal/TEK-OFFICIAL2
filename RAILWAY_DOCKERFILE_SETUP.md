# Railway Dockerfile Configuration

## Railway Settings

Configure these settings in Railway Dashboard → Your Service → Settings:

### Build Settings
- **Build Command**: (Leave empty - Railway auto-detects)
- **Start Command**: (Leave empty - Railway auto-detects from Dockerfile CMD)

### Docker Settings
- **Dockerfile Path**: `backend/Dockerfile` ⚠️ **Set this!**
- **Watch Paths**: (Can be empty, or set to `backend/**`)

**OR**

### Alternative: Use Root Directory
- **Root Directory**: `backend`
- **Dockerfile Path**: `Dockerfile` (relative to backend/)

## Recommended Configuration

**Option 1: Set Dockerfile Path (Recommended)**
```
Dockerfile Path: backend/Dockerfile
Root Directory: (leave empty or set to repository root)
```

**Option 2: Set Root Directory**
```
Root Directory: backend
Dockerfile Path: Dockerfile
```

## Current Setup

The repository has:
- `Dockerfile` in root (works with Option 1)
- `backend/Dockerfile` (works with Option 2)

Both Dockerfiles are configured to build the backend correctly.

## Verification

After setting Dockerfile Path to `backend/Dockerfile`, Railway should:
1. ✅ Find the Dockerfile
2. ✅ Build from backend directory
3. ✅ Run `npm ci` successfully
4. ✅ Run `npm run build` successfully
5. ✅ Start with `npm start`

## Build Logs Should Show

```
Step 1/7 : FROM node:20.6.0-alpine
Step 2/7 : WORKDIR /app
Step 3/7 : COPY package*.json ./
Step 4/7 : RUN npm ci
Step 5/7 : COPY . .
Step 6/7 : RUN npm run build  ← Should work now!
Step 7/7 : CMD ["npm", "start"]
```
