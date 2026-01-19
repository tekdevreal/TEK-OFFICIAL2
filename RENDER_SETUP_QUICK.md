# Quick Start: Enable Persistent Epoch Storage on Render

## 🎯 What You Need to Do

### Part 1: Create Disk in Render (5 minutes)

1. **Go to:** https://dashboard.render.com
2. **Click:** Your backend service
3. **Click:** "Disks" in left sidebar
4. **Click:** "Add Disk" button
5. **Fill in:**
   - **Name:** `reward-data`
   - **Mount Path:** `/data`
   - **Size:** `1` GB
6. **Click:** "Create Disk"
7. **Wait:** 2-3 minutes for deployment

### Part 2: Deploy Updated Code (2 minutes)

Run these commands:

```bash
cd /home/van/reward-project

git add backend/src/services/cycleService.ts

git commit -m "Add persistent storage support with auto-fallback

- Checks if /data directory exists and is writable
- Uses persistent storage when available
- Falls back to local directory if not
- Epochs will now survive deployments on Render"

git push origin main
```

**Wait 2-3 minutes for deployment**

---

## ✅ Verify It's Working

### Check Logs

After deployment, look for this in Render logs:

**✅ SUCCESS (using persistent storage):**
```
[INFO] Using persistent storage {"path":"/data/cycle-state.json"}
```

**⚠️ FALLBACK (still using local - disk not mounted yet):**
```
[INFO] Persistent storage not available, using local directory {"path":"/opt/render/project/src/cycle-state.json"}
```

If you see the fallback message, wait a minute and redeploy - the disk might still be mounting.

### Test Persistence

1. **Note current epoch number**
2. **Make a small change and push** (e.g., add a comment)
3. **Wait for deployment**
4. **Check epoch number** - should be the same!

---

## 📊 What This Achieves

### Before (Without Persistent Storage)

```
Day 1, Deploy 1: Epoch 1
Day 1, Deploy 2: Epoch 1  ← Reset!
Day 2, Deploy 1: Epoch 1  ← Reset!
Day 3, Deploy 1: Epoch 1  ← Reset!
```

### After (With Persistent Storage)

```
Day 1, Deploy 1: Epoch 1
Day 1, Deploy 2: Epoch 1  ← Preserved!
Day 2, Deploy 1: Epoch 2  ← Incremented!
Day 3, Deploy 1: Epoch 3  ← Incremented!
```

---

## 🔧 How It Works

The code now:

1. **Checks if `/data` exists**
2. **Checks if it's writable**
3. **Uses `/data/cycle-state.json` if available**
4. **Falls back to local if not**

**Smart fallback means:**
- Works in development (no /data directory)
- Works in production without disk (uses local)
- Works in production with disk (uses persistent storage)

---

## 📝 Backup Strategy (Optional but Recommended)

### Manual Backup

```bash
# In Render shell (if you have access)
cat /data/cycle-state.json

# Copy the output to a local file
```

### Automated Backup (Future Enhancement)

Add a daily backup script that copies `/data/cycle-state.json` to a cloud storage service.

---

## 🚨 Troubleshooting

### Problem: Still seeing "using local directory" after adding disk

**Solution:**
1. Check disk is "Mounted" in Render dashboard
2. Trigger a manual redeploy
3. Check logs for mount errors

### Problem: Permission denied on /data

**Solution:**
- Render should automatically set correct permissions
- If not, contact Render support
- Code will fall back to local directory automatically

### Problem: Disk full

**Solution:**
1. Increase disk size in Render dashboard
2. Or clean up old epochs (code keeps last 30 days automatically)

---

## 💰 Cost

**Render Disk Pricing:**
- 1 GB: ~$0.25/month
- Very affordable for persistent data

---

## Summary Commands

```bash
# 1. Create disk in Render dashboard (web UI)
# 2. Deploy updated code:

cd /home/van/reward-project
git add backend/src/services/cycleService.ts
git commit -m "Add persistent storage support with auto-fallback"
git push origin main

# 3. Wait 2-3 minutes
# 4. Check logs for "Using persistent storage"
# 5. Done! Epochs will now persist forever!
```

---

**Total time: ~10 minutes** ⏱️  
**Cost: ~$0.25/month** 💰  
**Result: Epochs never reset!** 🎉
