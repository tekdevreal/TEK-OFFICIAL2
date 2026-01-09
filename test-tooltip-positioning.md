# Tooltip Positioning Test Guide

## Issue from Screenshot

**Observed:**
- Hovered Block: Cycle 152 (7th green block in top row "CYCLES 145-168")
- Tooltip Location: Appearing on the right side, overlapping lower rows
- Problem: Tooltip not appearing directly below/near the hovered block

## Root Cause Identified

The hover event is attached to `.cycle-block-wrapper` but the actual visual block is `.cycle-block` inside it. The wrapper might have different dimensions or positioning than the visual block.

## Fix Applied

Changed `handleBlockHover` to:
1. Get the wrapper element from `event.currentTarget`
2. Query for the actual `.cycle-block` child element
3. Use `.cycle-block`'s `getBoundingClientRect()` for positioning
4. Added console logging for debugging

## Testing Steps

### 1. Open Browser Console
```
F12 or Right-click → Inspect → Console tab
```

### 2. Test Different Cycle Positions

#### Test A: Cycle in Top-Left
- Hover over first colored block (Cycle 145-148 range)
- **Expected Console Output:**
  ```
  Tooltip position: {
    cycleNumber: 14X,
    blockRect: { left: ~XXX, top: ~XXX, width: ~XX, height: ~XX },
    tooltipPos: { x: ~XXX, y: ~XXX },
    viewport: { width: XXXX, height: XXXX }
  }
  ```
- **Expected Visual:** Tooltip appears directly below the block

#### Test B: Cycle in Top-Right
- Hover over last colored block in top row
- **Expected:** Tooltip shifts left if near edge, appears below

#### Test C: Cycle in Middle
- Hover over Cycle 152 (the one from screenshot)
- **Expected:** Tooltip centered below the block

### 3. Check Console Output

Look for these values in console:
- `blockRect.left` should match the visual position of the hovered block
- `blockRect.width` should be ~20-40px (size of one block)
- `tooltipPos.x` should be close to `blockRect.left + blockRect.width/2`
- `tooltipPos.y` should be `blockRect.bottom + 8`

### 4. Visual Verification

**Good Positioning:**
```
[Hovered Block]  ← Green glow
     ↓ 8px gap
  [Tooltip]      ← Black box centered below
```

**Bad Positioning (What we're fixing):**
```
[Hovered Block]  ← Green glow
                 
                 
                      [Tooltip] ← Far away
```

## If Still Not Working

### Debug Checklist

1. **Check if `.cycle-block` is found:**
   - Look for console warning: "CycleBlock element not found"
   - If present, the querySelector is failing

2. **Check blockRect values:**
   - If `blockRect.left` is 0 or very large, element positioning is wrong
   - If `blockRect.width` is 0, element has no size

3. **Check viewport values:**
   - Should match your browser window size
   - If wrong, viewport detection is failing

### Alternative Fix: Use Wrapper Directly

If querying for `.cycle-block` fails, we can use the wrapper:

```typescript
const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
```

But this might give us the wrapper's dimensions, not the visual block's.

### CSS Debug: Add Border

Temporarily add to `RewardSystem.css`:

```css
.cycle-block-wrapper {
  border: 1px solid red; /* Debug: see wrapper */
}

.cycle-block {
  border: 1px solid blue; /* Debug: see actual block */
}
```

This will show if wrapper and block have different sizes/positions.

## Expected Behavior After Fix

### Scenario 1: Normal Hover
```
User hovers Cycle 152
↓
JavaScript gets .cycle-block position
↓
Calculates: x = blockLeft + blockWidth/2, y = blockBottom + 8
↓
Tooltip renders at (x, y) with transform: translateX(-50%)
↓
Result: Tooltip centered below block
```

### Scenario 2: Near Bottom Edge
```
User hovers cycle near bottom
↓
spaceBelow < tooltipHeight
↓
spaceAbove > tooltipHeight
↓
y = blockTop - tooltipHeight - 8
↓
Result: Tooltip appears above block
```

### Scenario 3: Near Right Edge
```
User hovers cycle on right side
↓
x + halfTooltipWidth > viewportWidth
↓
x = viewportWidth - halfTooltipWidth - 10
↓
Result: Tooltip shifts left to stay on screen
```

## Deploy & Test

1. Build frontend:
   ```bash
   cd frontend && npm run build
   ```

2. Open in browser with console open

3. Hover over different cycles

4. Check console output and visual position

5. Verify tooltip appears near hovered block

## Success Criteria

✅ Tooltip appears within 20px of hovered block
✅ Tooltip doesn't go off-screen
✅ Console shows correct blockRect values
✅ Works in collapsed and expanded views
✅ Works for all cycles in the row

## If Problem Persists

Share the console output from hovering, and we can diagnose further:
- What are the `blockRect` values?
- What are the `tooltipPos` values?
- What is the viewport size?

This will tell us exactly what's happening with the positioning calculation.
