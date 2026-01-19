# Phase 1: Visual Guide

## What Changed

### Before
```
┌─────────────────────────────────────────────────────┐
│  Reward System                                      │
├─────────────────────────────────────────────────────┤
│  [Today] [Yesterday]              Jan 11, 2026 • ... │
└─────────────────────────────────────────────────────┘
```

### After
```
┌─────────────────────────────────────────────────────┐
│  Reward System                                      │
├─────────────────────────────────────────────────────┤
│  [📅 Jan 11, 2026 ▼]                  Cycle 74 / 288│
└─────────────────────────────────────────────────────┘

Click calendar button ↓

┌────────────────────────────────────┐
│  Select Date                       │
│  Last 30 days                      │
├────────────────────────────────────┤
│  January 2026                      │
│  ┌──────────────────────────────┐ │
│  │ SUN MON TUE WED THU FRI SAT  │ │
│  │  11●  10●   9●   8●   7◯  6  │ │
│  │   4    3    2    1            │ │
│  └──────────────────────────────┘ │
│                                    │
│  December 2025                     │
│  ┌──────────────────────────────┐ │
│  │  31   30   29   28   27  26  │ │
│  │  25   24   ...               │ │
│  └──────────────────────────────┘ │
├────────────────────────────────────┤
│  ● Has data    ◯ No data          │
└────────────────────────────────────┘

● = Green dot (clickable)
◯ = Gray (not clickable)
Numbers in gray = No data
Future dates = Grayed out
```

## Features Illustrated

### Date Selection
```
[📅 Jan 11, 2026 ▼]
 ↑       ↑         ↑
Icon  Display   Dropdown
      Text      Arrow
```

### Calendar Day States

#### 1. Today (Current Date)
```
┌──────┐
│ SUN  │  ← Day name
│  11● │  ← Day number + data dot
└──────┘  
^ Blue border
```

#### 2. Selected Date
```
┌──────┐
│ SAT  │  
│  10● │  
└──────┘  
^ Indigo background
```

#### 3. Available Date (Has Data)
```
┌──────┐
│ FRI  │  
│   9● │  ← Green dot
└──────┘  
^ Hover: lift + glow
```

#### 4. Unavailable Date (No Data)
```
┌──────┐
│ THU  │  
│   7  │  ← No dot
└──────┘  
^ Grayed out, not clickable
```

#### 5. Future Date
```
┌──────┐
│ MON  │  
│  14  │  ← No dot
└──────┘  
^ Grayed out, not clickable
```

## Color Scheme

### Dark Mode (Default)
```
Background: #1a1f28 (tertiary)
Border: rgba(255, 255, 255, 0.1)
Text: rgba(255, 255, 255, 0.9)
Selected: rgba(99, 102, 241, 0.2) - Indigo
Today Border: #818cf8 - Indigo-400
Data Dot: #10b981 - Green
Disabled: 30% opacity
```

### Light Mode
```
Background: white
Border: rgba(0, 0, 0, 0.1)
Text: rgba(0, 0, 0, 0.9)
Selected: rgba(99, 102, 241, 0.15) - Indigo
Today Border: #6366f1 - Indigo-500
Data Dot: #10b981 - Green
Disabled: 30% opacity
```

## Interaction Flow

```
User Action                      System Response
───────────                      ───────────────

Click calendar button     →      Dropdown opens
                                 Shows last 30 days
                                 Highlights today
                                 Shows selected date

Hover over available date →      Date lifts up
                                 Background lightens
                                 Cursor: pointer

Hover over disabled date  →      No visual change
                                 Cursor: not-allowed

Click available date      →      Loads epoch data
                                 Dropdown closes
                                 Cycles render

Click disabled date       →      Nothing happens

Click outside dropdown    →      Dropdown closes
```

## Responsive Behavior

### Desktop (>768px)
```
Calendar Grid: 4 columns (wider days)
Day Size: 70px × 70px
Dropdown: Fixed left alignment
```

### Mobile (≤768px)
```
Calendar Grid: 3 columns (compact)
Day Size: 60px × 60px
Dropdown: Right-aligned
```

## Animation Details

### Dropdown Open
```
Duration: 200ms
Easing: ease
Effect: slideDown + fadeIn
From: translateY(-10px), opacity 0
To: translateY(0), opacity 1
```

### Day Hover
```
Duration: 200ms
Easing: ease
Effect: lift
Transform: translateY(-2px)
Background: lighten 3%
```

### Arrow Rotate
```
Duration: 200ms
Easing: ease
Transform: rotate(180deg) when open
```

## Component Structure

```
EpochDatePicker
├─ Button
│  ├─ Calendar Icon
│  ├─ Selected Date Text
│  └─ Dropdown Arrow
│
└─ Dropdown (when open)
   ├─ Header
   │  ├─ Title: "Select Date"
   │  └─ Subtitle: "Last 30 days"
   │
   ├─ Month Group(s)
   │  ├─ Month Header: "January 2026"
   │  └─ Calendar Grid
   │     ├─ Day 1
   │     ├─ Day 2
   │     └─ ... (up to 30 days)
   │
   └─ Footer
      └─ Legend
         ├─ ● Has data
         └─ ◯ No data
```

## Real Example Timeline

```
Today: January 11, 2026

Calendar shows:

Jan 11 (Today)        → ● Available, blue border
Jan 10 (Yesterday)    → ● Available
Jan 9-5 (Last week)   → ● Available
Jan 4-1 (Earlier)     → ◯ No data (grayed)
Dec 31-15 (Previous)  → ◯ No data (grayed)
Jan 12+ (Future)      → ◯ Disabled (grayed)
```

## Usage Scenarios

### Scenario 1: Check Yesterday's Data
```
1. Click calendar button
2. Calendar opens, shows Jan 10 with green dot
3. Click Jan 10
4. Reward system loads yesterday's cycles
5. Can see distributions from Jan 10
```

### Scenario 2: Try to Check Tomorrow
```
1. Click calendar button
2. Calendar shows Jan 12 grayed out
3. Try to click Jan 12
4. Nothing happens (disabled)
5. Tooltip shows "Future date"
```

### Scenario 3: Check Data from 2 Weeks Ago
```
1. Click calendar button
2. Scroll to Dec 28
3. Dec 28 shows green dot
4. Click Dec 28
5. Reward system loads cycles from Dec 28
6. Can analyze historical patterns
```

## Accessibility Features

```
✅ ARIA labels on all buttons
✅ aria-expanded on dropdown button
✅ aria-haspopup for dropdown
✅ Title attributes for disabled dates
✅ Semantic HTML (button, not div)
✅ Keyboard navigation (Tab, Enter, Escape)
✅ Screen reader friendly
✅ High contrast ratios
```

## Performance Considerations

```
✅ Lazy rendering (only visible days)
✅ Memoized date calculations
✅ Event delegation
✅ CSS animations (GPU accelerated)
✅ No heavy JavaScript on scroll
✅ Efficient re-renders
```

---

**Summary:** Modern, accessible, theme-aware calendar picker that makes it easy to explore 30 days of reward system history! 🎉
