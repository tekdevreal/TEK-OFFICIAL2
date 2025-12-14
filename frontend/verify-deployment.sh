#!/bin/bash
echo "🔍 Frontend Deployment Verification"
echo ""
echo "Checking dist/ folder..."
if [ ! -d "dist" ]; then
  echo "❌ dist/ folder not found!"
  exit 1
fi

echo "✅ dist/ folder exists"
echo ""
echo "Required files:"
[ -f "dist/index.html" ] && echo "  ✅ index.html" || echo "  ❌ index.html MISSING"
[ -f "dist/.htaccess" ] && echo "  ✅ .htaccess" || echo "  ❌ .htaccess MISSING"
[ -d "dist/assets" ] && echo "  ✅ assets/ folder" || echo "  ❌ assets/ MISSING"
[ -f "dist/assets/index-"*.js ] && echo "  ✅ JavaScript bundle" || echo "  ❌ JS bundle MISSING"
[ -f "dist/assets/index-"*.css ] && echo "  ✅ CSS bundle" || echo "  ❌ CSS bundle MISSING"

echo ""
echo "Checking .htaccess content..."
if grep -q "RewriteEngine On" dist/.htaccess 2>/dev/null; then
  echo "  ✅ .htaccess configured for SPA routing"
else
  echo "  ⚠️  .htaccess may be missing rewrite rules"
fi

echo ""
echo "Checking for production backend URL..."
if grep -q "nukerewards-backend.onrender.com" dist/assets/*.js 2>/dev/null; then
  echo "  ✅ Production backend URL found in build"
else
  echo "  ⚠️  Backend URL may be loaded at runtime"
fi

echo ""
echo "📦 Deployment package ready!"
echo "  Location: $(pwd)/dist"
echo "  Size: $(du -sh dist | cut -f1)"
echo "  Files: $(find dist -type f | wc -l)"
