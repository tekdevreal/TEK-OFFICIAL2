#!/bin/bash
cd /home/van/reward-project
git add frontend/src/components/RewardSystem.css
git add frontend/src/components/TopNav.tsx
git add frontend/src/pages/HoldersPage.css
git add frontend/src/pages/HarvestingPage.css
git add frontend/src/pages/DistributionPage.css
git add frontend/src/pages/AnalyticsPage.css
git add frontend/src/pages/AnalyticsPage.tsx
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/responsive.css
cd frontend && npm run build && cd ..
git commit -m "Fix: Dashboard distribution cards - correct cycle numbers & fetch all cycles

DASHBOARD DISTRIBUTIONS FIX:
✅ Increased API limit from 20 to 300 cycles (gets full day of 288 cycles)
✅ Fixed cycle number calculation (now shows actual 1-288, not countdown)
✅ Calculate cycle number from timestamp instead of index
✅ Now displays all recent cycles, not just first 20

CYCLE NUMBER CALCULATION:
OLD (BROKEN):
- epochNumber = cycles.length - index
- Showed countdown: 20, 19, 18... down to 1
- Only had 20 cycles due to limit

NEW (FIXED):
- Calculate from timestamp: minutes since 00:00 UTC ÷ 5
- Shows actual cycle: 1, 2, 3... up to 288
- Fetches up to 300 cycles to ensure full day coverage

LOGIC:
1. Get cycle timestamp
2. Find start of day (00:00 UTC)
3. Calculate minutes since start: (timestamp - startOfDay) / 60000
4. Divide by 5 (cycle duration): cycleNumber = floor(minutes / 5) + 1
5. Result: Actual cycle number (1-288)

EXAMPLE:
- Cycle at 00:00 UTC → 0 minutes → Cycle 1
- Cycle at 00:05 UTC → 5 minutes → Cycle 2
- Cycle at 16:00 UTC → 960 minutes → Cycle 193
- Cycle at 23:55 UTC → 1435 minutes → Cycle 288

RESULT:
✅ Distribution cards show correct cycle numbers (1-288)
✅ Latest cycles displayed (not stuck at Cycle 20)
✅ All cycles from current epoch visible
✅ Proper pagination through all cycles

ALSO INCLUDED:
✅ Analytics Rewards Over Time chart fixed
✅ Clean chart CSS (works on all devices)
✅ Mobile improvements maintained"
git push origin main
echo "✅ Done! Clear browser cache (Ctrl+Shift+R) to see changes"
