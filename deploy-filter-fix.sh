#!/bin/bash
cd /home/van/reward-project
git add frontend/src/pages/HoldersPage.tsx frontend/src/pages/HoldersPage.css
git add frontend/src/pages/HarvestingPage.tsx frontend/src/pages/HarvestingPage.css
git add frontend/src/pages/DistributionPage.tsx frontend/src/pages/DistributionPage.css
cd frontend && npm run build && cd ..
git commit -m "Fix: Better filter layout - Year+Month on row 1, Export CSV on row 2"
git push origin main
echo "✅ Done! Clear browser cache (Ctrl+Shift+R) to see changes"
