# CORS Troubleshooting Guide

## Issue: Network/CORS Errors on Frontend

If you're seeing CORS errors in the browser console, follow these steps:

## 1. Check Railway Environment Variable

**Important:** Remove quotes from the `FRONTEND_URL` value in Railway!

### ❌ Wrong (with quotes):
```
FRONTEND_URL="https://rewards.tekportal.app"
```

### ✅ Correct (without quotes):
```
FRONTEND_URL=https://rewards.tekportal.app
```

**Steps:**
1. Go to Railway Dashboard → Backend Service → Variables
2. Find `FRONTEND_URL`
3. Remove any quotes around the value
4. Save and redeploy

## 2. Verify Backend is Accessible

Test if the backend is reachable:

```bash
curl https://tek-backend-tek-studio.up.railway.app/health
```

Should return: `{"status":"ok"}`

## 3. Check Backend Logs

In Railway Dashboard → Backend Service → Logs, look for:

```
[CORS] Allowed origins: [...]
[CORS] FRONTEND_URL from env: ...
[CORS] Normalized frontend URL: ...
```

This will show you what origins are actually allowed.

## 4. Check Browser Console

In the browser console (F12), check:
- What origin is being blocked
- The exact error message
- Network tab → Check the failed request → Headers → See the actual origin

## 5. Verify Frontend Environment Variable

Make sure your frontend deployment has:

```
VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app
```

**No trailing slash!**

## 6. Common Issues

### Issue: Quotes in Railway Environment Variable
- **Symptom:** CORS errors even though URL looks correct
- **Fix:** Remove quotes from `FRONTEND_URL` in Railway

### Issue: Trailing Slash Mismatch
- **Symptom:** Origin `https://rewards.tekportal.app/` doesn't match `https://rewards.tekportal.app`
- **Fix:** The code normalizes URLs, but ensure Railway has no trailing slash

### Issue: Backend Not Deployed
- **Symptom:** "Network Error" instead of CORS error
- **Fix:** Check Railway backend is running and accessible

### Issue: Frontend Using Wrong Backend URL
- **Symptom:** Network errors, backend unreachable
- **Fix:** Verify `VITE_API_BASE_URL` is set correctly in frontend deployment

## 7. Testing CORS Manually

Test CORS with curl:

```bash
curl -H "Origin: https://rewards.tekportal.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://tek-backend-tek-studio.up.railway.app/health \
     -v
```

Look for `Access-Control-Allow-Origin: https://rewards.tekportal.app` in the response.

## 8. After Making Changes

1. **Backend:** Railway will auto-redeploy after environment variable changes
2. **Frontend:** Rebuild and redeploy with correct `VITE_API_BASE_URL`
3. **Clear Browser Cache:** Hard refresh (Ctrl+Shift+R) or clear cache
4. **Wait:** Give Railway a few seconds to restart the backend

## Current Configuration

- **Backend URL:** `https://tek-backend-tek-studio.up.railway.app`
- **Frontend URL:** `https://rewards.tekportal.app`
- **CORS:** Configured to allow `https://rewards.tekportal.app` (without trailing slash)
