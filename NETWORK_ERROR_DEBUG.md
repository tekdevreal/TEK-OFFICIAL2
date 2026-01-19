# Network Error Debugging Guide

## Issue: "Network Error" in Browser Console

This error means the frontend cannot reach the backend at all. This is different from CORS errors.

## Quick Checks

### 1. Verify Backend is Accessible

Test the backend directly in your browser or with curl:

```bash
curl https://tek-backend-tek-studio.up.railway.app/health
```

Should return: `{"status":"ok"}`

If this fails, the backend is not accessible.

### 2. Check Frontend Console

Open browser console (F12) and look for:

```
[API] Backend URL configured: https://tek-backend-tek-studio.up.railway.app
```

If you see `undefined` or a wrong URL, the frontend environment variable is not set.

### 3. Verify Frontend Environment Variable

The frontend needs `VITE_API_BASE_URL` set **at build time** (not runtime).

**For Vite:**
- Environment variables must start with `VITE_`
- They must be available when running `npm run build`
- They are embedded into the built JavaScript

**Check your deployment platform:**
- Vercel: Environment Variables → Add `VITE_API_BASE_URL`
- Netlify: Site settings → Environment variables → Add `VITE_API_BASE_URL`
- Other: Set as build-time environment variable

**Value should be:**
```
VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app
```

**No quotes! No trailing slash!**

### 4. Rebuild Frontend After Setting Environment Variable

After setting `VITE_API_BASE_URL`, you **must rebuild** the frontend:

```bash
cd frontend
npm run build
```

The environment variable is embedded at build time, not runtime.

### 5. Check Railway Backend Logs

In Railway Dashboard → Backend Service → Logs, look for:

```
[CORS] Allowed origins: [...]
[CORS] FRONTEND_URL from env: ...
Server started on port 10000
```

If you don't see these, the backend might not be running.

### 6. Verify Backend is Running

Check Railway Dashboard:
- Is the backend service "Active"?
- Are there any error logs?
- Did the last deployment succeed?

## Common Issues

### Issue: Frontend Environment Variable Not Set
- **Symptom:** `[API] Backend URL configured: undefined` in console
- **Fix:** Set `VITE_API_BASE_URL` in your deployment platform and rebuild

### Issue: Frontend Not Rebuilt After Setting Env Var
- **Symptom:** Still shows old URL or undefined
- **Fix:** Rebuild frontend: `npm run build` and redeploy

### Issue: Backend Not Accessible
- **Symptom:** `curl` to backend fails
- **Fix:** Check Railway backend is running and accessible

### Issue: Wrong Backend URL
- **Symptom:** Network error, backend unreachable
- **Fix:** Verify `VITE_API_BASE_URL` matches actual Railway backend URL

## Testing Steps

1. **Test Backend Directly:**
   ```bash
   curl https://tek-backend-tek-studio.up.railway.app/health
   ```

2. **Check Frontend Console:**
   - Open https://rewards.tekportal.app/
   - Press F12 → Console tab
   - Look for `[API] Backend URL configured: ...`

3. **Check Network Tab:**
   - F12 → Network tab
   - Look for failed requests to backend
   - Check the request URL

4. **Verify Environment Variable:**
   - Check your deployment platform's environment variables
   - Ensure `VITE_API_BASE_URL` is set
   - Rebuild frontend after setting

## Current Configuration

- **Backend URL:** `https://tek-backend-tek-studio.up.railway.app`
- **Frontend URL:** `https://rewards.tekportal.app`
- **Frontend Env Var:** `VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app`
