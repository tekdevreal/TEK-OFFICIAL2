/**
 * PATCH: Add Deployment ID Logging to Identify Duplicate Instances
 * 
 * This patch adds unique deployment ID logging to help identify
 * if multiple bot instances are running on Railway.
 * 
 * Apply this patch to telegram-bot/src/index.ts
 */

import crypto from 'crypto';

// Add this near the top of main() function (around line 177)
const DEPLOYMENT_ID = process.env.RAILWAY_DEPLOYMENT_ID 
  || process.env.RAILWAY_REPLICA_ID 
  || crypto.randomBytes(8).toString('hex');

console.log('='.repeat(80));
console.log('[Bot] 🚀 STARTING TELEGRAM BOT');
console.log('[Bot] Deployment ID:', DEPLOYMENT_ID);
console.log('[Bot] Environment:', process.env.NODE_ENV || 'development');
console.log('[Bot] Railway Service:', process.env.RAILWAY_SERVICE_NAME || 'N/A');
console.log('[Bot] Railway Environment:', process.env.RAILWAY_ENVIRONMENT_NAME || 'N/A');
console.log('='.repeat(80));

// Modify the tickAutomaticRewards function logging (around line 244)
console.log('[AutoRewards] New swap + distribution detected, broadcasting to authorized chats', {
  deploymentId: DEPLOYMENT_ID,  // ADD THIS LINE
  lastSwapTx,
  authorizedChatIds,
  timestamp: new Date().toISOString(),
});

// Modify the send notification logging (around line 252)
console.log('[AutoRewards] Sent swap/distribution notification', { 
  deploymentId: DEPLOYMENT_ID,  // ADD THIS LINE
  chatId,
  timestamp: new Date().toISOString(),
});

// Modify the Express server listening log (around line 268)
console.log('[Bot] Express server listening', { 
  deploymentId: DEPLOYMENT_ID,  // ADD THIS LINE
  port, 
  webhookUrl, 
  backendUrl, 
  pollingIntervalMs,
  timestamp: new Date().toISOString(),
});

/**
 * INSTRUCTIONS:
 * 
 * 1. Open telegram-bot/src/index.ts
 * 
 * 2. Add at the top of main() function (after line 177):
 *    ```typescript
 *    const DEPLOYMENT_ID = process.env.RAILWAY_DEPLOYMENT_ID 
 *      || process.env.RAILWAY_REPLICA_ID 
 *      || crypto.randomBytes(8).toString('hex');
 * 
 *    console.log('='.repeat(80));
 *    console.log('[Bot] 🚀 STARTING TELEGRAM BOT');
 *    console.log('[Bot] Deployment ID:', DEPLOYMENT_ID);
 *    console.log('[Bot] Environment:', process.env.NODE_ENV || 'development');
 *    console.log('[Bot] Railway Service:', process.env.RAILWAY_SERVICE_NAME || 'N/A');
 *    console.log('[Bot] Railway Environment:', process.env.RAILWAY_ENVIRONMENT_NAME || 'N/A');
 *    console.log('='.repeat(80));
 *    ```
 * 
 * 3. Add `deploymentId: DEPLOYMENT_ID,` to all console.log statements in tickAutomaticRewards
 * 
 * 4. Build and deploy:
 *    ```bash
 *    cd telegram-bot
 *    npm run build
 *    git add .
 *    git commit -m "debug: add deployment ID logging to identify duplicate instances"
 *    git push
 *    ```
 * 
 * 5. Check Railway logs for:
 *    - How many different DEPLOYMENT_IDs appear
 *    - If you see 2 different IDs, you have 2 instances running
 * 
 * 6. Example of what to look for:
 *    ```
 *    [Bot] Deployment ID: abc123def456  <-- Instance 1
 *    [Bot] Deployment ID: xyz789ghi012  <-- Instance 2 (DUPLICATE!)
 *    ```
 */
