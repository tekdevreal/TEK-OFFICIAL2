# Frontend Deployment Configuration

## Environment Variables

The frontend needs the backend API URL configured for production.

### For Production Build

**Option 1: Set in Deployment Platform (Recommended)**

Set the environment variable in your deployment platform (Vercel, Netlify, etc.):

```
VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app
```

**Option 2: Create .env.production File**

Create `.env.production` in the `frontend/` directory (copy from `.env.production.example`):

```env
VITE_API_BASE_URL=https://tek-backend-tek-studio.up.railway.app
```

**Note:** `.env.production` is gitignored - you'll need to create it locally or set it in your deployment platform.

### For Development

Create `.env` in the `frontend/` directory:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## CORS Configuration

The backend must have `FRONTEND_URL` set to allow CORS from the frontend domain.

### Backend Environment Variable (Railway)

Set in Railway Dashboard → Backend Service → Variables:

```
FRONTEND_URL=https://rewards.tekportal.app/
```

**Note:** The backend CORS configuration automatically:
- Normalizes URLs (removes trailing slashes)
- Allows requests from `https://rewards.tekportal.app`
- Allows localhost for development

## Building for Production

```bash
cd frontend
npm run build
```

The build output will be in `frontend/dist/` directory.

## Deployment Checklist

- [ ] Backend `FRONTEND_URL` is set to `https://rewards.tekportal.app/`
- [ ] Frontend `.env.production` has `VITE_API_BASE_URL` set to backend URL
- [ ] Frontend is built with `npm run build`
- [ ] Frontend is deployed to `https://rewards.tekportal.app/`
- [ ] Test API connection from browser console
- [ ] Verify no CORS errors in browser console

## Troubleshooting CORS Errors

If you see CORS errors in the browser console:

1. **Check Backend FRONTEND_URL:**
   - Verify `FRONTEND_URL=https://rewards.tekportal.app/` is set in Railway
   - Restart backend after changing environment variables

2. **Check Frontend API URL:**
   - Verify `VITE_API_BASE_URL` is set correctly
   - Rebuild frontend after changing `.env.production`

3. **Check Browser Console:**
   - Look for the actual origin being blocked
   - Verify it matches `https://rewards.tekportal.app` (no trailing slash)

4. **Test Backend Health:**
   ```bash
   curl https://tek-backend-tek-studio.up.railway.app/health
   ```
