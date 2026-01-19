# GitHub Repository Setup for TEK Project

This guide helps you push your TEK project code to the new GitHub repository.

## Repository Information

- **GitHub Username**: `tekdevreal`
- **Repository**: `TEK-OFFICIAL2`
- **Repository URL**: `https://github.com/tekdevreal/TEK-OFFICIAL2.git`

---

## Initial Setup & Push

### Step 1: Check Current Git Status

```bash
# Navigate to project root
cd ~/TEK-OFFICIAL2

# Check if git is already initialized
git status
```

### Step 2: Initialize Git (if not already initialized)

If git is not initialized:

```bash
# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: TEK project setup with Railway deployment"
```

### Step 3: Add Remote Repository

```bash
# Add the new GitHub repository as remote
git remote add origin https://github.com/tekdevreal/TEK-OFFICIAL2.git

# Verify remote is added
git remote -v
```

### Step 4: Push to GitHub

**Option A: Using Personal Access Token (Recommended for first push)**

```bash
# Push to main branch (will prompt for credentials)
git push -u origin main
```

When prompted:
- **Username**: `tekdevreal`
- **Password**: `YOUR_PERSONAL_ACCESS_TOKEN` (use your GitHub personal access token)

**Option B: Configure Git Credential Helper (One-time setup)**

```bash
# Configure git to use credential helper
git config --global credential.helper store

# Push (will prompt once, then save credentials)
git push -u origin main
```

**Option C: Use Token in URL (One-time push)**

```bash
# Push with token in URL (replace YOUR_TOKEN with your actual token)
git push https://YOUR_TOKEN@github.com/tekdevreal/TEK-OFFICIAL2.git main
```

**Note**: Replace `YOUR_TOKEN` with your actual GitHub personal access token. Never commit the token to the repository.

---

## Verify Push

1. **Check GitHub Repository:**
   - Visit: https://github.com/tekdevreal/TEK-OFFICIAL2
   - Verify all files are present

2. **Check Git Status:**
   ```bash
   git status
   git log --oneline
   ```

---

## Future Updates

After initial push, you can update the repository normally:

```bash
# Make your changes
# ...

# Stage changes
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push origin main
```

---

## Connect to Railway

After pushing to GitHub:

1. **Go to Railway Dashboard:**
   - Visit: https://railway.app/dashboard
   - Sign in with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose: `tekdevreal/TEK-OFFICIAL2`
   - Select branch: `main`

3. **Railway will auto-detect:**
   - Node.js project
   - Build commands from `package.json`
   - Start commands from `package.json`

---

## Security Notes

⚠️ **Important Security Reminders:**

1. **Personal Access Token:**
   - Store your token securely (use environment variables or credential helper)
   - **Never commit this token to the repository**
   - Consider rotating the token periodically
   - If token is exposed, revoke it immediately in GitHub Settings → Developer settings → Personal access tokens

2. **Environment Variables:**
   - Never commit `.env` files
   - Never commit private keys or secrets
   - Use Railway's secret management for sensitive data

3. **Git Ignore:**
   - Ensure `.gitignore` includes:
     - `.env`
     - `node_modules/`
     - `*.log`
     - `dist/` (if not needed)
     - Private key files

---

## Troubleshooting

### Issue: Authentication Failed

**Solution:**
```bash
# Clear cached credentials
git credential reject <<EOF
protocol=https
host=github.com
EOF

# Try push again with token
```

### Issue: Repository Already Exists

**Solution:**
```bash
# Remove old remote
git remote remove origin

# Add new remote
git remote add origin https://github.com/tekdevreal/TEK-OFFICIAL2.git

# Push again
git push -u origin main
```

### Issue: Branch Name Mismatch

**Solution:**
```bash
# Check current branch
git branch

# If on 'master', rename to 'main'
git branch -m master main

# Push to main
git push -u origin main
```

---

## Next Steps

After successfully pushing to GitHub:

1. ✅ Code is on GitHub
2. ⏳ Connect Railway to GitHub repository
3. ⏳ Deploy backend to Railway
4. ⏳ Update frontend and telegram bot
5. ⏳ Deploy all services

---

## Related Files

- `backend/RAILWAY_DEPLOY.md` - Railway deployment guide
- `backend/RAILWAY_CHECKLIST.md` - Deployment checklist
- `TEK_MIGRATION_PLAN.md` - Complete migration plan
