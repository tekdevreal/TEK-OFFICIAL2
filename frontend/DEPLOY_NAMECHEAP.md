# Namecheap Deployment Guide

## Pre-Deployment Checklist

✅ **Build Status:**
- Production build completed
- Backend URL: `https://nukerewards-backend.onrender.com`
- `.htaccess` configured for SPA routing
- No localhost references in production code

## Deployment Methods

### Method 1: cPanel File Manager (Recommended)

1. **Access cPanel:**
   - Go to: https://cpanel.imgprotocol.com (or your cPanel URL)
   - Login with your Namecheap credentials

2. **Navigate to Domain:**
   - Open "File Manager"
   - Navigate to: `public_html/nukerewards/` (or root if subdomain is configured)

3. **Upload Files:**
   - Delete existing files (if any) in the directory
   - Click "Upload" button
   - Select ALL files from `frontend/dist/`:
     - `index.html`
     - `assets/` folder (entire folder)
     - `vite.svg` (if present)
     - `.htaccess`
   - Wait for upload to complete

4. **Verify .htaccess:**
   - Ensure `.htaccess` is in the root directory
   - Check that it's not hidden (show hidden files in File Manager)

5. **Set Permissions:**
   - `.htaccess` should have 644 permissions
   - Files should have 644 permissions
   - Folders should have 755 permissions

### Method 2: SFTP/FTP

1. **Connect via SFTP:**
   ```bash
   sftp username@nukerewards.imgprotocol.com
   # Or use FTP client like FileZilla
   ```

2. **Navigate to Directory:**
   ```bash
   cd public_html/nukerewards/
   # Or cd public_html/ if subdomain root
   ```

3. **Upload Files:**
   ```bash
   # From local machine
   cd /path/to/reward-project/frontend/dist
   
   # Upload all files
   put -r * /public_html/nukerewards/
   ```

4. **Verify Upload:**
   - Check that `index.html` exists
   - Check that `assets/` folder exists
   - Check that `.htaccess` exists

## Post-Deployment Verification

### 1. Test Frontend Loading
- Visit: `http://nukerewards.imgprotocol.com/`
- Should see the React dashboard
- Check browser console (F12) for errors

### 2. Test SPA Routing
- Navigate to different pages (Dashboard, Analytics, etc.)
- URLs should change without page reload
- Direct URL access should work (e.g., `/analytics`)

### 3. Test API Connection
- Open browser DevTools → Network tab
- Check API calls go to: `https://nukerewards-backend.onrender.com`
- Verify no CORS errors
- Test endpoints:
  - `/health`
  - `/dashboard/rewards`
  - `/dashboard/holders`

### 4. Common Issues & Fixes

**Issue: 404 on page refresh**
- **Fix:** Ensure `.htaccess` is uploaded and Apache mod_rewrite is enabled

**Issue: API calls fail**
- **Fix:** Verify Render backend is running and accessible
- Check CORS configuration in backend

**Issue: Blank page**
- **Fix:** Check browser console for errors
- Verify `index.html` is in root directory
- Check file permissions (644 for files, 755 for folders)

**Issue: Assets not loading**
- **Fix:** Verify `assets/` folder is uploaded
- Check file paths in `index.html`

## File Structure After Deployment

```
public_html/nukerewards/
├── index.html
├── .htaccess
├── assets/
│   ├── index-*.js
│   └── index-*.css
└── vite.svg (optional)
```

## .htaccess Configuration

The `.htaccess` file is already included in `dist/` with:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

This ensures React Router works correctly for client-side routing.

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify backend is accessible: `https://nukerewards-backend.onrender.com/health`
3. Check Namecheap hosting logs
4. Verify file permissions and `.htaccess` is active

