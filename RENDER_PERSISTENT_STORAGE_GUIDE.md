# Complete Guide: Persistent Epoch Storage on Render

## What This Fixes

**Current Problem:**
- Every deployment resets epoch to 1
- Historical epoch data is lost
- Can't track multi-day history

**After This Fix:**
- Epochs persist across deployments
- Historical data preserved
- Epoch increments daily: 1, 2, 3, 4...

---

## Step-by-Step Setup

### Step 1: Create Persistent Disk in Render

1. **Go to Render Dashboard**
   - URL: https://dashboard.render.com
   - Log in to your account

2. **Select Your Backend Service**
   - Click on your backend web service
   - (The one running your Node.js backend)

3. **Go to Disks Tab**
   - In the left sidebar, click **"Disks"**
   - Or scroll down to find "Disks" section

4. **Click "Add Disk"**

5. **Configure the Disk:**
   ```
   Name: reward-data
   Mount Path: /data
   Size: 1 GB (minimum, more if you want)
   ```

6. **Click "Create Disk"**
   - This will trigger a redeploy
   - Wait 2-3 minutes for deployment to complete

---

### Step 2: Update Code to Use Persistent Storage

Now we need to update the code to use `/data` when it exists:

```typescript
// backend/src/services/cycleService.ts

// Check if /data directory exists and is writable
function getStateFilePath(): string {
  const persistentPath = '/data/cycle-state.json';
  const localPath = path.join(process.cwd(), 'cycle-state.json');
  
  try {
    // Try to access /data directory
    if (fs.existsSync('/data')) {
      // Check if we can write to it
      fs.accessSync('/data', fs.constants.W_OK);
      return persistentPath;
    }
  } catch (error) {
    // /data doesn't exist or not writable, use local
    logger.warn('Persistent storage not available, using local directory', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  return localPath;
}

const STATE_FILE_PATH = getStateFilePath();
```

Let me create this update:
