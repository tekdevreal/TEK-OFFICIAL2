# Railway Root Directory Fix

## Problem

Railway is trying to run `npm start` from the root directory, but the `start` script is in `backend/package.json`, causing this error:

```
npm ERR! Missing script: "start"
```

## Solution: Set Root Directory in Railway

### Method 1: Railway Dashboard (Recommended)

1. **Go to Railway Dashboard:**
   - Visit: https://railway.app/dashboard
   - Select your project
   - Click on your backend service

2. **Set Root Directory:**
   - Go to **Settings** tab
   - Scroll to **Source** section
   - Find **Root Directory** field
   - Set it to: `backend`
   - Click **Save**

3. **Redeploy:**
   - Go to **Deployments** tab
   - Click **Redeploy** on the latest deployment
   - Or push a new commit to trigger auto-deploy

### Method 2: Use nixpacks.toml (Alternative)

If you can't set root directory in dashboard, the `nixpacks.toml` file in the repository root will configure Nixpacks to use the backend directory.

The file is already created with:
```toml
[phases.install]
cmds = ["cd backend && npm ci"]

[phases.build]
cmds = ["cd backend && npm run build"]

[start]
cmd = "cd backend && npm start"
```

### Method 3: Create Railway Service with Root Directory

When creating a new service:

1. Click **+ New** → **GitHub Repo**
2. Select your repository
3. **Before deploying**, go to **Settings** → **Source**
4. Set **Root Directory** to: `backend`
5. Then deploy

## Verification

After setting the root directory, Railway should:

1. ✅ Install dependencies from `backend/package.json`
2. ✅ Run build command: `npm run build` (from backend directory)
3. ✅ Run start command: `npm start` (from backend directory)
4. ✅ Start the server successfully

## Expected Build Logs

After fix, you should see:
```
▸ install
$ cd backend && npm ci

▸ build
$ cd backend && npm run build

▸ start
$ cd backend && npm start
```

Instead of:
```
▸ install
$ npm ci  (from root - wrong!)

▸ build
$ npm start  (from root - fails!)
```

## Troubleshooting

### Still Building from Root?

1. **Check Settings:**
   - Go to **Settings** → **Source**
   - Verify **Root Directory** is set to `backend`
   - If it shows `/` or empty, set it to `backend`

2. **Check railway.json:**
   - The file should have `cd backend` in commands
   - But Railway might ignore it if root directory is not set

3. **Force Redeploy:**
   - Delete the service and recreate it
   - Set root directory BEFORE first deploy
   - Or use the `nixpacks.toml` configuration

### Build Still Fails?

1. **Check Node Version:**
   - Ensure `backend/.nvmrc` exists with `20.6.0`
   - Or set in Railway environment variables

2. **Check package.json:**
   - Verify `backend/package.json` has `start` script
   - Verify `engines.node` is set to `20.6.0`

3. **Check Build Logs:**
   - Look for which directory commands are running from
   - Should show `backend/` in paths

## Quick Fix Command

If you have Railway CLI installed:
```bash
railway variables set RAILWAY_ROOT_DIRECTORY=backend
```

But the dashboard method is recommended.
