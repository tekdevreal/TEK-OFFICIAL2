# Monthly Statistics System - Brainstorming Session

## Current State Analysis

### What We Track Now (24 hours)

**Storage:**
- Last 30 epochs (30 days of data)
- Up to 288 cycles per epoch
- Each cycle includes:
  - Tax collected (NUKE)
  - NUKE swapped to SOL
  - SOL distributed to holders
  - SOL sent to treasury
  - Number of holders paid
  - Transaction signatures

**Frontend Display:**
- Last 300 distributions (from historical API)
- Current epoch/cycle status
- Total accumulated values
- Recent distribution cards

### Current Limitations

❌ **No monthly aggregations**  
❌ **No weekly summaries**  
❌ **No month-over-month comparisons**  
❌ **No holder growth tracking over time**  
❌ **No average daily metrics**  
❌ **Can't see trends beyond 30 days**  

---

## What Should We Track Monthly?

### Option 1: Detailed Monthly Storage (Keep Everything)

**Pros:**
- Complete historical data
- Can reconstruct any stat later
- Full audit trail

**Cons:**
- Large storage requirements
- Expensive queries
- Slow dashboard loads

**Storage Estimate:**
```
1 month = 30 epochs × 288 cycles = 8,640 cycles
Each cycle ~500 bytes of data = 4.32 MB/month
1 year = ~52 MB
```

### Option 2: Monthly Aggregations (Smart Summaries)

**Pros:**
- Fast queries
- Small storage footprint
- Easy to display
- Can show trends

**Cons:**
- Can't reconstruct detailed history
- Need to decide what to aggregate upfront

**Storage Estimate:**
```
1 month summary = ~2 KB
1 year = ~24 KB
```

### Option 3: Hybrid Approach (Recommended)

**Keep detailed data for:**
- Last 30 days (current approach)
- Queryable, full detail

**Create monthly summaries for:**
- Older than 30 days
- Aggregate statistics only

**Example:**
```
Days 0-30: Full cycle-by-cycle data
Days 31+: Monthly summary records
```

---

## Proposed Monthly Statistics

### Core Metrics (Must Have)

1. **Distribution Metrics**
   - Total distributions in month
   - Total NUKE collected
   - Total NUKE swapped
   - Total SOL to holders
   - Total SOL to treasury
   - Average distribution size
   - Largest distribution
   - Success rate (distributed vs rolled over)

2. **Holder Metrics**
   - Unique holders paid
   - Average holders per distribution
   - Total payouts made
   - Average SOL per holder

3. **Time Metrics**
   - Total cycles executed
   - Failed cycles count
   - Rolled over cycles count
   - Uptime percentage

### Extended Metrics (Nice to Have)

4. **Growth Metrics**
   - New holders this month
   - Holders lost this month
   - Net holder growth
   - Month-over-month % change

5. **Performance Metrics**
   - Average tax collection time
   - Average swap time
   - Average distribution time
   - Average SOL/NUKE ratio

6. **Trend Analysis**
   - Daily averages within month
   - Peak distribution day
   - Lowest distribution day
   - Best performing week

---

## Data Structure Design

### Option A: Monthly Summary Record

```typescript
interface MonthlyStatistics {
  month: string; // "2026-01" (YYYY-MM)
  year: number;
  monthNumber: number; // 1-12
  
  // Distribution metrics
  distributions: {
    total: number;
    successful: number;
    failed: number;
    rolledOver: number;
    successRate: number; // percentage
  };
  
  // Financial metrics
  financial: {
    totalNukeCollected: string; // Total NUKE with decimals
    totalNukeSwapped: string;
    totalSolToHolders: string;
    totalSolToTreasury: string;
    averageDistributionSol: string;
    largestDistributionSol: string;
    smallestDistributionSol: string;
  };
  
  // Holder metrics
  holders: {
    uniqueHoldersPaid: number;
    totalPayoutsMade: number;
    averageHoldersPerDistribution: number;
    averageSolPerHolder: string;
  };
  
  // Cycle metrics
  cycles: {
    totalExecuted: number;
    totalDistributed: number;
    totalRolledOver: number;
    totalFailed: number;
    expectedCycles: number; // 8,640 for full month
    executionRate: number; // percentage
  };
  
  // Time metadata
  epochsIncluded: string[]; // ["2026-01-01", "2026-01-02", ...]
  firstEpoch: string;
  lastEpoch: string;
  daysInMonth: number;
  
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}
```

### Option B: Weekly Summaries (More Granular)

```typescript
interface WeeklyStatistics {
  week: string; // "2026-W01" (ISO week)
  startDate: string; // "2026-01-01"
  endDate: string; // "2026-01-07"
  
  // Same structure as monthly but for week
  // ...
}
```

### Option C: Daily Rollups (Keep More Detail)

```typescript
interface DailyStatistics {
  date: string; // "2026-01-01"
  epoch: string; // Same as date
  
  // Aggregate of all cycles in this day
  distributions: { /* ... */ };
  financial: { /* ... */ };
  holders: { /* ... */ };
  cycles: { /* ... */ };
}
```

---

## Storage Architecture Options

### Option 1: Single File Per Month

```
/data/statistics/
  monthly-2026-01.json
  monthly-2026-02.json
  monthly-2026-03.json
```

**Pros:** Easy to manage, one file per month  
**Cons:** Need to read multiple files for year view

### Option 2: Consolidated Statistics File

```
/data/statistics.json
{
  "monthly": {
    "2026-01": { /* stats */ },
    "2026-02": { /* stats */ },
    ...
  },
  "weekly": { /* ... */ },
  "yearly": { /* ... */ }
}
```

**Pros:** All stats in one place  
**Cons:** File grows over time, need cleanup

### Option 3: Database-Style (Multiple Files)

```
/data/cycle-state.json        ← Current epochs (30 days)
/data/monthly-stats.json      ← Monthly summaries (all time)
/data/yearly-stats.json       ← Yearly summaries (all time)
```

**Pros:** Organized, predictable file sizes  
**Cons:** Need to manage multiple files

---

## When to Generate Statistics

### Option A: On-Demand Calculation

**When:** User requests monthly view  
**How:** Calculate from stored epoch data  

**Pros:** Always accurate, no storage needed  
**Cons:** Slow, expensive computation

### Option B: Daily Rollup (End of Epoch)

**When:** At 23:59 UTC each day  
**How:** Process completed epoch, update monthly stats  

**Pros:** Fast queries, incremental updates  
**Cons:** Need background job

### Option C: Real-Time Updates

**When:** After each distribution  
**How:** Update running monthly totals  

**Pros:** Always current  
**Cons:** More complex, more writes

### Option D: Hybrid (Recommended)

**Daily rollup** for completed days  
**On-demand calculation** for current day  
**Monthly finalization** at end of month

---

## API Endpoints Design

### New Endpoints Needed

```typescript
// Get monthly statistics
GET /dashboard/statistics/monthly?year=2026&month=1
Response: MonthlyStatistics

// Get monthly statistics for multiple months
GET /dashboard/statistics/monthly?from=2026-01&to=2026-06
Response: MonthlyStatistics[]

// Get yearly summary
GET /dashboard/statistics/yearly?year=2026
Response: YearlyStatistics

// Get all-time statistics
GET /dashboard/statistics/all-time
Response: AllTimeStatistics

// Get weekly statistics
GET /dashboard/statistics/weekly?year=2026&week=1
Response: WeeklyStatistics

// Get comparison data
GET /dashboard/statistics/compare?months=2026-01,2026-02,2026-03
Response: ComparisonData
```

---

## Frontend Dashboard Components

### New Pages/Sections

1. **Monthly Overview**
   ```
   [January 2026]  [February 2026]  [March 2026]
   
   Total Distributed: 123.45 SOL
   Total Distributions: 456
   Unique Holders: 1,234
   Success Rate: 98.5%
   
   [Chart showing daily distributions]
   ```

2. **Trends & Analytics**
   ```
   [Line chart: SOL distributed over 6 months]
   [Bar chart: Distributions per month]
   [Growth chart: Holder count over time]
   ```

3. **Comparison View**
   ```
   | Metric              | Jan 2026 | Feb 2026 | Change  |
   |---------------------|----------|----------|---------|
   | SOL Distributed     | 123.45   | 145.67   | +18%    |
   | Unique Holders      | 1,234    | 1,456    | +18%    |
   | Avg Distribution    | 0.27     | 0.32     | +19%    |
   ```

4. **Historical Records**
   ```
   Largest Distribution Ever: 2.345 SOL on Jan 15, 2026
   Most Active Day: Jan 15, 2026 (288 cycles)
   Longest Streak: 30 days without missed cycle
   ```

---

## Data Migration Strategy

### Phase 1: Current System (Now)
- Keep existing 30-day cycle storage
- No changes needed

### Phase 2: Add Statistics Generation (Pre-Launch)
- Add monthly statistics calculation
- Run retrospectively on existing data
- Test aggregations

### Phase 3: Deploy with Persistent Storage (Launch)
- Enable Render disk
- Start accumulating monthly data
- Daily rollups begin

### Phase 4: Frontend Updates (Post-Launch)
- Add monthly statistics pages
- Add trend charts
- Add comparison tools

---

## Data Retention Policy

### Recommended Approach

**Detailed Cycle Data:**
- Keep last 30 days (current approach)
- After 30 days, archive or delete

**Daily Summaries:**
- Keep last 90 days
- Lightweight, fast queries

**Monthly Summaries:**
- Keep forever (small size)
- Complete history

**Yearly Summaries:**
- Keep forever
- Generate from monthly data

**Storage Math:**
```
30 days detailed: ~4 MB
90 days daily summaries: ~180 KB
36 months monthly summaries: ~72 KB
3 years yearly summaries: ~6 KB
--------------------------------
Total after 3 years: ~4.3 MB
```

Very reasonable for 1 GB disk!

---

## Implementation Priority

### Phase 1 (Essential - Launch Day)
1. Monthly statistics data structure
2. Daily rollup job
3. Basic API endpoints
4. Simple monthly view page

### Phase 2 (Post-Launch - Week 2)
1. Trend charts
2. Comparison views
3. Historical records
4. Export functionality

### Phase 3 (Enhancement - Month 2)
1. Weekly statistics
2. Advanced analytics
3. Predictions/projections
4. Email reports

---

## Questions to Consider

### 1. **How far back should monthly data go?**
   - Option A: Keep all data forever
   - Option B: Keep last 12 months
   - Option C: Keep last 36 months
   - **Recommendation:** Keep forever (cheap storage)

### 2. **Should we track holder-specific history?**
   - Individual holder statistics over time?
   - Top holders by month?
   - Holder retention analysis?
   - **Consideration:** Privacy vs insights

### 3. **What timezone for monthly boundaries?**
   - UTC (matches epoch system)
   - User's timezone (configurable)
   - **Recommendation:** UTC (consistent with epochs)

### 4. **Should statistics be public or private?**
   - Public: Anyone can see historical stats
   - Private: Only admin/authenticated users
   - **Consideration:** Transparency vs competitive advantage

### 5. **Export functionality?**
   - CSV export of monthly data?
   - JSON API for external tools?
   - GraphQL endpoint?
   - **Recommendation:** CSV export for transparency

---

## Recommended Approach

### My Suggestion: **Hybrid + Phased**

**Phase 1 (Launch):**
1. Keep detailed cycle data for 30 days
2. Generate monthly summaries automatically
3. Store monthly summaries forever
4. Basic monthly view in dashboard

**Phase 2 (Post-Launch):**
1. Add daily summaries (90 days)
2. Add trend charts
3. Add comparison tools
4. Add CSV export

**Storage Structure:**
```
/data/
  cycle-state.json          ← Last 30 days detailed
  monthly-statistics.json   ← All monthly summaries
  daily-rollups.json        ← Last 90 days (optional)
```

**Key Benefits:**
- ✅ Fast queries (pre-aggregated)
- ✅ Small storage footprint
- ✅ Complete history
- ✅ Easy to extend
- ✅ Cheap to maintain

---

## Next Steps

Before implementing, decide:

1. **Which metrics matter most?** (Start simple, add more later)
2. **How to display on dashboard?** (What charts/graphs?)
3. **When to implement?** (Pre-launch or post-launch?)
4. **Who needs access?** (Public or private?)

**Recommendation:** Start with monthly summaries of core metrics, add details later based on user feedback.

---

## Cost & Performance Impact

**Storage:** Negligible (~10 MB over 3 years)  
**Compute:** Minimal (one rollup per day)  
**Query Speed:** Fast (pre-aggregated)  
**User Experience:** Much better!  

---

What do you think? Which approach resonates with you?
