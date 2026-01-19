# Debug Tooltip Positioning Issue

## Problem from Screenshot

**Observed:**
- Hovered: Cycle 169 (first orange block in top row "CYCLES 169-192")
- Tooltip Location: Bottom left of screen (completely wrong!)
- Expected: Tooltip should be directly below Cycle 169 block

## Deep Investigation Needed

I've added comprehensive debug logging to understand what's happening.

## Debug Logging Added

```typescript
console.log('🎯 Tooltip Debug:', {
  cycleNumber,
  element: element.className,
  rect: {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  },
  calculated: { x, y },
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
  }
});
```

## Testing Steps

### 1. Build Frontend
```bash
cd /home/van/reward-project/frontend
npm run build
```

### 2. Open Browser with Console
- Open the dashboard
- Press **F12** to open Developer Console
- Go to **Console** tab

### 3. Hover Over Cycle 169
- Hover over the first orange block (Cycle 169)
- Check the console output

### 4. Analyze the Output

Look for the debug log starting with 🎯. It will show:

**Example Expected Output:**
```javascript
🎯 Tooltip Debug: {
  cycleNumber: 169,
  element: "cycle-block-wrapper",
  rect: {
    left: 450,      // Should be position of the block
    top: 200,       // Should be Y position of the block
    right: 480,     // left + width
    bottom: 230,    // top + height
    width: 30,      // Block width
    height: 30,     // Block height
  },
  calculated: {
    x: 465,         // left + width/2 (center)
    y: 238,         // bottom + 8 (below block)
  },
  viewport: {
    width: 1920,    // Your screen width
    height: 1080,   // Your screen height
    scrollY: 0,     // Scroll position
  }
}
```

## Possible Issues to Check

### Issue 1: Element Has No Size
```javascript
rect: { width: 0, height: 0, ... }
```
**Meaning:** The wrapper element has no dimensions
**Fix:** Need to use the actual `.cycle-block` child element

### Issue 2: Wrong Element Position
```javascript
rect: { left: 0, top: 0, ... }
```
**Meaning:** Element positioning is not calculated correctly
**Fix:** Element might not be rendered or CSS issue

### Issue 3: Coordinates Are Relative, Not Fixed
```javascript
rect: { left: 50, top: 100, ... }  // But tooltip appears elsewhere
```
**Meaning:** Coordinates might be relative to parent, not viewport
**Fix:** Tooltip uses `position: fixed` but coordinates might be relative

### Issue 4: Transform or CSS Offset
The tooltip CSS has `transform: translateX(-50%)` which might be causing issues with other transforms or positioning contexts.

## What to Share

Please share the **complete console output** when you hover over Cycle 169. It should look like:

```
🎯 Tooltip Debug: { cycleNumber: 169, element: "...", rect: {...}, calculated: {...}, viewport: {...} }
```

This will tell us:
1. ✅ Is the element being found?
2. ✅ What are its actual coordinates?
3. ✅ What position is being calculated?
4. ✅ What's the viewport size?

## Potential Root Causes

### Hypothesis 1: CSS Transform Context
If a parent element has `transform`, it creates a new positioning context and `position: fixed` becomes relative to that parent instead of the viewport.

**Check:** Look for any parent with `transform` in CSS

### Hypothesis 2: Scroll Container
If the Reward System is in a scrollable container, `getBoundingClientRect()` gives viewport-relative coordinates but the tooltip might need container-relative coordinates.

**Check:** Is there a scrollable parent?

### Hypothesis 3: Wrapper vs Block Size Mismatch
The `.cycle-block-wrapper` might be larger or positioned differently than the visual `.cycle-block`.

**Check:** Compare wrapper rect vs actual block visual position

### Hypothesis 4: Z-index or Stacking Context
Tooltip might be rendered in wrong stacking context.

**Check:** Tooltip has `z-index: 1000` but parent might have lower z-index

## Next Steps

1. **Build and test** with debug logging
2. **Share console output** from hovering Cycle 169
3. **Based on output**, we'll identify the exact issue
4. **Apply targeted fix**

## Quick Fixes to Try

If the console shows the rect values are correct but tooltip still appears wrong:

### Fix A: Use Absolute Positioning
Change tooltip from `position: fixed` to `position: absolute` and wrap in a `position: relative` container.

### Fix B: Remove Transform
Remove `transform: translateX(-50%)` and calculate x position differently:
```typescript
const x = rect.left; // Left edge instead of center
```

### Fix C: Portal Rendering
Render tooltip in a React Portal at document.body level to escape any positioning contexts.

## Summary

The debug logging will reveal the **exact coordinates** being calculated and used. Once we see those values, we can determine if:
- ❌ Coordinates are wrong (calculation issue)
- ❌ Coordinates are right but tooltip appears wrong (CSS/positioning context issue)
- ❌ Element rect is wrong (wrapper vs block issue)

**Please share the console output!** 🔍
