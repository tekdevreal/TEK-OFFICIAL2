#!/bin/bash

# GitHub Repository Setup Script for TEK Project
# This script helps push your code to the new GitHub repository

set -e  # Exit on error

echo "🚀 TEK Project - GitHub Repository Setup"
echo "========================================"
echo ""

# Repository information
GITHUB_USER="tekdevreal"
REPO_NAME="TEK-OFFICIAL2"
REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

# Get token from environment variable or prompt
if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  GITHUB_TOKEN environment variable not set"
    echo "   Please set it with: export GITHUB_TOKEN=your_token_here"
    echo "   Or enter it when prompted for password"
    TOKEN=""
else
    TOKEN="$GITHUB_TOKEN"
fi

echo "📋 Repository Information:"
echo "   Username: ${GITHUB_USER}"
echo "   Repository: ${REPO_NAME}"
echo "   URL: ${REPO_URL}"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    echo "✅ Git initialized"
else
    echo "✅ Git already initialized"
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
echo "📍 Current branch: ${CURRENT_BRANCH}"

# If on master, rename to main
if [ "$CURRENT_BRANCH" = "master" ]; then
    echo "🔄 Renaming branch from master to main..."
    git branch -m master main
    CURRENT_BRANCH="main"
fi

# Check if remote exists
if git remote get-url origin >/dev/null 2>&1; then
    CURRENT_REMOTE=$(git remote get-url origin)
    echo "🔗 Current remote: ${CURRENT_REMOTE}"
    
    if [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
        echo "🔄 Updating remote URL..."
        git remote set-url origin "${REPO_URL}"
        echo "✅ Remote updated"
    else
        echo "✅ Remote already configured correctly"
    fi
else
    echo "➕ Adding remote repository..."
    git remote add origin "${REPO_URL}"
    echo "✅ Remote added"
fi

# Check if there are changes to commit
if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "📝 Staging all changes..."
    git add .
    
    echo "💾 Creating commit..."
    git commit -m "Initial commit: TEK project setup with Railway deployment

- Updated backend configuration for TEK token
- Added Railway deployment documentation
- Updated environment variables for new token
- Frontend URL: https://rewards.tekportal.app/"
    echo "✅ Changes committed"
else
    echo "ℹ️  No changes to commit"
fi

# Push to GitHub
echo ""
echo "🚀 Pushing to GitHub..."
echo "   Repository: ${REPO_URL}"
echo "   Branch: ${CURRENT_BRANCH}"
echo ""

# Push to GitHub (will prompt for credentials if token not set)
if [ -n "$TOKEN" ]; then
    git push -u https://${TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git ${CURRENT_BRANCH}
else
    echo "   You will be prompted for username and password"
    echo "   Username: ${GITHUB_USER}"
    echo "   Password: (use your personal access token)"
    git push -u origin ${CURRENT_BRANCH}
fi

echo ""
echo "✅ Successfully pushed to GitHub!"
echo ""
echo "🔗 Repository URL: ${REPO_URL}"
echo ""
echo "📋 Next Steps:"
echo "   1. Visit: https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo "   2. Verify all files are present"
echo "   3. Connect Railway to this repository"
echo "   4. Follow: backend/RAILWAY_DEPLOY.md"
echo ""
