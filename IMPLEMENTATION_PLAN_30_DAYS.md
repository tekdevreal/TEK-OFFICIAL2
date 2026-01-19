# 30-Day Historical Data Implementation Plan

## Current State Analysis

### What Backend Already Has ✅
- Stores last 30 epochs in `cycle-state.json`
- Each epoch contains up to 288 cycles with full details
- API endpoint: `/dashboard/cycles/epoch/:epoch` (YYYY-MM-DD format)
- API endpoint: `/dashboard/cycles/epochs` (list all available epochs)

### What Frontend Currently Shows ❌
- **Reward System:** Today only (with yesterday button that doesn't work)
- **Distributions:** Current epoch only
- **Harvesting:** Limited to current data
- **Distribution page:** Limited to current data
- **Analytics:** No time filters

---

## Implementation Plan - Phase by Phase

### Phase 1: Reward System Section (30-Day Calendar)

**Current:**
```
[Today] [Yesterday]
Shows tooltip data for selected day
```

**Goal:**
```
[Select Month: January 2026 ▼]
[Calendar showing last 30 days with data indicators]
Click any day → Show reward system for that epoch
```

**What Needs to Change:**

1. **Frontend Changes:**
   - Replace "Yesterday" button with "Select Date" dropdown
   - Add date picker showing last 30 days
   - Fetch epoch data when date selected
   - Display cycles for selected epoch

2. **Backend Changes:**
   - ✅ Already has `/dashboard/cycles/epoch/:epoch` endpoint
   - ✅ Returns all cycles for that epoch
   - No changes needed!

3. **Implementation Steps:**
   ```
   Step 1: Add date picker component
   Step 2: Fetch available epochs list on page load
   Step 3: Disable dates outside 30-day range
   Step 4: Load selected epoch data
   Step 5: Render reward system visualization
   ```

**Estimated Time:** 2-3 hours  
**Risk Level:** Low (backend ready)  
**Dependencies:** None

---

### Phase 2: Distributions Section (30-Day History)

**Current:**
```
Distributions Epoch: 1
[Shows 10 recent distribution cards from current epoch]
```

**Goal:**
```
Distributions - Last 30 Days
[Date Range Selector: Last 7 days ▼]
[Shows distribution cards from selected range]
[Load More button]
```

**What Needs to Change:**

1. **Frontend Changes:**
   - Add date range selector (Last 7 days, Last 14 days, Last 30 days)
   - Fetch historical rewards API with date range
   - Display distribution cards for selected range
   - Add pagination/load more

2. **Backend Changes:**
   - ✅ Already has `/dashboard/historical/rewards?limit=300`
   - ❌ Needs date range filtering
   - Add query params: `from=YYYY-MM-DD&to=YYYY-MM-DD`

3. **New Backend Endpoint:**
   ```typescript
   GET /dashboard/historical/rewards?from=2026-01-01&to=2026-01-30&limit=100
   ```

**Estimated Time:** 3-4 hours  
**Risk Level:** Low  
**Dependencies:** Need to update backend API

---

### Phase 3: Harvesting Page (30-Day Table)

**Current:**
```
[Table showing recent harvesting data]
Limited rows, no date filter
```

**Goal:**
```
Harvesting History - Last 30 Days
[Date Range: 2026-01-01 to 2026-01-30]
[Filter ▼] [Export CSV]

| Date       | Epoch | Cycle | NUKE Harvested | SOL Received | Status |
|------------|-------|-------|----------------|--------------|--------|
| 2026-01-11 | 1     | 74    | 1,234.56       | 0.234        | ✓      |
| ...        |       |       |                |              |        |

[Pagination: 1 2 3 ... 30]
```

**What Needs to Change:**

1. **Frontend Changes:**
   - Add date range picker
   - Fetch data for selected range
   - Add table pagination
   - Add CSV export button
   - Show aggregated totals at bottom

2. **Backend Changes:**
   - Create dedicated harvesting endpoint
   - Aggregate cycle data across epochs
   - Return paginated results

3. **New Backend Endpoint:**
   ```typescript
   GET /dashboard/harvesting/history?from=2026-01-01&to=2026-01-30&page=1&limit=50
   
   Response: {
     data: Array<HarvestingRecord>,
     total: number,
     page: number,
     totalPages: number,
     aggregates: {
       totalNukeHarvested: string,
       totalSolReceived: string,
       totalCycles: number,
       successRate: number
     }
   }
   ```

**Estimated Time:** 4-5 hours  
**Risk Level:** Medium (new endpoint)  
**Dependencies:** None

---

### Phase 4: Distribution Page (30-Day Table)

**Current:**
```
[Table showing distribution transactions]
Limited data
```

**Goal:**
```
Distribution History - Last 30 Days
[Date Range: 2026-01-01 to 2026-01-30]
[Filter by Status ▼] [Export CSV]

| Date       | Epoch | Cycle | SOL to Holders | SOL to Treasury | Holders Paid | TX |
|------------|-------|-------|----------------|-----------------|--------------|-----|
| 2026-01-11 | 1     | 74    | 0.234          | 0.058           | 123          | abc |
| ...        |       |       |                |                 |              |     |

[Pagination: 1 2 3 ... 30]
```

**What Needs to Change:**

1. **Frontend Changes:**
   - Add date range picker
   - Add status filter (Distributed, Rolled Over, Failed)
   - Add pagination
   - Add CSV export
   - Link to Solscan for TX

2. **Backend Changes:**
   - Create dedicated distribution endpoint
   - Filter by status
   - Return paginated results

3. **New Backend Endpoint:**
   ```typescript
   GET /dashboard/distributions/history?from=2026-01-01&to=2026-01-30&status=DISTRIBUTED&page=1&limit=50
   
   Response: {
     data: Array<DistributionRecord>,
     total: number,
     page: number,
     totalPages: number,
     aggregates: {
       totalSolToHolders: string,
       totalSolToTreasury: string,
       uniqueHoldersPaid: number,
       totalDistributions: number
     }
   }
   ```

**Estimated Time:** 4-5 hours  
**Risk Level:** Medium (new endpoint)  
**Dependencies:** None

---

### Phase 5: Analytics Page (Enhanced Filters + Monthly Storage)

**Current:**
```
Analytics
- Rewards Over Time (basic chart)
- Volume vs Rewards Correlation
- Treasury Balance Over Time

No time filters
```

**Goal:**
```
Analytics Dashboard

[Time Range: ▼ 24 Hours | 7 Days | 30 Days | All Time]
[Date Range: Custom ▼]

📊 Rewards Over Time
   [Line chart with time range filter applied]

📊 Volume vs Rewards Correlation
   [Scatter plot with time range filter applied]

📊 Treasury Balance Over Time
   [Area chart with time range filter applied]

📊 NEW: Distribution Success Rate
   [Bar chart showing success vs rollover vs failed]

📊 NEW: Holder Growth
   [Line chart showing unique holders over time]
```

**What Needs to Change:**

1. **Frontend Changes:**
   - Add time range selector (24H, 7D, 30D, All Time)
   - Add custom date range picker
   - Update chart queries based on selected range
   - Add new chart components

2. **Backend Changes:**
   - Update analytics endpoints to accept time range
   - Create monthly aggregation system
   - Add new analytics endpoints

3. **New/Updated Backend Endpoints:**
   ```typescript
   // Existing endpoint with new params
   GET /dashboard/analytics/rewards-over-time?range=7d
   GET /dashboard/analytics/rewards-over-time?from=2026-01-01&to=2026-01-30
   
   // New endpoints
   GET /dashboard/analytics/holder-growth?range=30d
   GET /dashboard/analytics/success-rate?range=30d
   GET /dashboard/analytics/monthly-summary?month=2026-01
   ```

4. **Monthly Aggregation System:**
   ```typescript
   // New file: backend/src/services/statisticsService.ts
   
   interface MonthlyStatistics {
     month: string; // "2026-01"
     totalDistributions: number;
     totalSolToHolders: string;
     totalSolToTreasury: string;
     uniqueHoldersPaid: number;
     averageDistributionSize: string;
     successRate: number;
     // ... more metrics
   }
   
   // Generate monthly summary at end of month
   // Store in /data/monthly-statistics.json
   ```

**Estimated Time:** 6-8 hours  
**Risk Level:** Medium-High (new aggregation system)  
**Dependencies:** Phases 1-4 complete

---

## Recommended Implementation Order

### Week 1: Foundation
✅ **Day 1-2: Phase 1** - Reward System (30-day calendar)  
- Low risk, immediate value
- Tests the pattern for other phases

### Week 2: Data Tables
✅ **Day 3-4: Phase 2** - Distributions section  
✅ **Day 5-6: Phase 3** - Harvesting page  
✅ **Day 7: Phase 4** - Distribution page

### Week 3: Analytics & Aggregation
✅ **Day 8-10: Phase 5** - Analytics filters + Monthly storage system

---

## Technical Requirements

### Backend New Files Needed

```
backend/src/
  services/
    statisticsService.ts        ← NEW: Monthly aggregation
  routes/
    analytics.ts                ← UPDATE: Add time filters
    harvesting.ts               ← NEW: Harvesting history
    distributions.ts            ← NEW: Distribution history
```

### Frontend New Components Needed

```
frontend/src/
  components/
    DateRangePicker.tsx         ← NEW: Date selection
    EpochCalendar.tsx           ← NEW: 30-day calendar
    TimeRangeFilter.tsx         ← NEW: Analytics filters
    DataTable.tsx               ← NEW: Reusable table
    ExportButton.tsx            ← NEW: CSV export
  hooks/
    useHistoricalData.ts        ← NEW: Fetch historical data
    useEpochList.ts             ← NEW: Get available epochs
```

---

## Data Storage Plan

### Current (30 Days Detailed)
```
/data/cycle-state.json
{
  "epochs": {
    "2026-01-01": { cycles: [...] },
    ...30 days...
    "2026-01-30": { cycles: [...] }
  }
}
```

### Future (Monthly Summaries)
```
/data/monthly-statistics.json
{
  "2026-01": {
    totalDistributions: 8640,
    totalSolToHolders: "123.456",
    // ... monthly aggregates
  },
  "2026-02": { ... },
  ...forever...
}
```

**Storage Estimate:**
- 30 days detailed: ~4 MB
- Monthly summaries (3 years): ~72 KB
- **Total: ~4.1 MB** (tiny!)

---

## API Response Time Estimates

| Endpoint | Current | With 30 Days | Optimization |
|----------|---------|--------------|--------------|
| Current cycle | ~50ms | ~50ms | No change |
| Single epoch | ~100ms | ~100ms | No change |
| 30 days history | N/A | ~500ms | Add caching |
| Monthly summary | N/A | ~50ms | Pre-aggregated |
| Analytics chart | ~200ms | ~800ms | Add caching |

**Optimization Strategy:**
- Cache frequently accessed data
- Pre-aggregate monthly data
- Use pagination for large datasets

---

## Breaking Changes & Risks

### Low Risk ✅
- Phases 1-2: Only additive, no breaking changes
- Backward compatible

### Medium Risk ⚠️
- Phases 3-4: New endpoints, need testing
- May affect existing analytics if not careful

### Mitigation Strategy
1. Feature flags for new features
2. A/B testing with old vs new views
3. Comprehensive testing before deployment
4. Gradual rollout

---

## User Experience Flow

### Before (Current)
```
User opens dashboard
  → Sees today's data only
  → Can't see history
  → Limited insights
```

### After (Phase 1-5 Complete)
```
User opens dashboard
  → Sees current data
  
Click "View History"
  → Select date from last 30 days
  → See detailed reward system for that day
  
Go to Analytics
  → Select "Last 30 Days"
  → See trends, growth, patterns
  → Export data as CSV
  
Go to Distributions
  → Filter by date range
  → See all distributions
  → Export for analysis
```

---

## My Recommendation

**Start with Phase 1** (Reward System calendar) because:
1. ✅ Backend is ready (no API changes needed)
2. ✅ Low risk (frontend only)
3. ✅ Immediate user value
4. ✅ Tests the pattern for other phases
5. ✅ Can deploy independently

**Then do Phases 2-4** in parallel (different developers if available)

**Finally Phase 5** (Analytics) which builds on the foundation

---

## Questions Before We Start

1. **Do you want to implement Phase 1 first?** (Reward System calendar)
2. **Do you have a preferred date picker library?** (react-datepicker, mui date picker, etc.)
3. **Should we add export to CSV functionality in Phase 1?** (or wait until later?)
4. **What should happen when user selects a date with no data?** (show empty state with message?)

Let me know and I'll start implementing Phase 1! 🚀
