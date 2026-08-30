# V Turn AI - Data Loading Issue - Fix Plan

## Root Cause Analysis
**Issue**: Users see empty dashboards after onboarding because no data appears.

**Root Cause**: The `CRON_SECRET` environment variable was missing from `.env.local` and the production VPS deployment. This breaks the job queue processor that:
1. Runs initial crawls and AI scans after onboarding
2. Processes background jobs throughout the app lifecycle
3. Updates metrics and data in real-time

Without `CRON_SECRET`, the `/api/cron/process-jobs` endpoint rejects all requests and jobs remain queued indefinitely.

## Impact
- **Local Dev**: Dev server couldn't process queued jobs
- **Production VPS**: Same issue - jobs queue but never run
- **User Experience**: Empty dashboards, no scan data, no insights
- **Trial Users**: Can't complete trial workflow (no data = poor experience)

## Fix Checklist

### ✅ 1. Local Development
- [x] Added `CRON_SECRET` to `.env.local`
- [x] Verified `/api/cron/process-jobs` endpoint rejects unauthenticated requests (expected)
- [x] Restarted dev server
- [x] Tests pass (249 tests)

### 🚀 2. Production VPS Deployment (Next Steps)
1. SSH into VPS and add CRON_SECRET to `/root/vturnai/.env.local`
2. Restart PM2 app process
3. Verify cron job processor works

### 3. Enable Automatic Scanning
The onboarding already queues an `initial_scan` job (see `src/app/onboarding/actions.ts:202`), but without the cron processor, it never runs. After adding CRON_SECRET, this will work automatically.

### 4. Set Up Scheduled Job Processing
Options:
1. **Vercel Cron (Recommended)** - If migrating to Vercel
2. **External HTTP Trigger** - Call `/api/cron/process-jobs` from third-party scheduler
3. **PM2 Plus** - Use PM2's built-in cron features on VPS

### 5. Real-Time Data Improvements
- Update onboarding UI to show real-time progress
- Add WebSocket support for live scan updates (optional future enhancement)
- Show demo data while initial scan runs

## Deployment Steps

### Step 1: Fix VPS Production Environment
```bash
# SSH into VPS
ssh root@66.29.131.95

# Generate new CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env.local
cd /root/vturnai
nano .env.local
# Add: CRON_SECRET=<paste-generated-secret>

# Restart app
pm2 restart vturnai-app
pm2 logs vturnai-app  # Verify it starts

# Verify cron endpoint works
curl -sI http://localhost:3000/api/cron/process-jobs \
  -H "Authorization: Bearer <CRON_SECRET>"
# Should return 200
```

### Step 2: Set Up Cron Scheduling
Choose one method:

**Option A: Vercel Cron (Recommended for Next.js)**
- Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/process-jobs",
    "schedule": "*/2 * * * *"
  }]
}
```
- Vercel automatically sends Authorization header with CRON_SECRET

**Option B: External Scheduler (Current Setup)**
- Visit https://cron-job.org or https://easycron.com
- Set up HTTP request to: `https://vturnai.com/api/cron/process-jobs`
- Header: `Authorization: Bearer <CRON_SECRET>`
- Schedule: Every 2 minutes (or adjust based on job volume)

**Option C: PM2 Plus (If staying on VPS)**
```bash
pm2 install pm2-auto-pull  # For deployments
# Add cron job to PM2 ecosystem config
```

## Testing the Fix

### Local Test
```bash
# In dev environment with CRON_SECRET added:
npm run dev

# 1. Create test user account
# 2. Complete onboarding with example.com
# 3. Observe: User redirected to /onboarding/building
# 4. Check database: SELECT * FROM jobs WHERE project_id = '<project-id>'
#    Should show initial_scan job with status 'queued'
# 5. Call cron endpoint manually:
curl http://localhost:PORT/api/cron/process-jobs \
  -H "Authorization: Bearer b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6"
# 6. Should return: { "jobsProcessed": 1, ... }
# 7. Refresh dashboard - data should now appear
```

### Production Verification (After Deploy)
```bash
# 1. Test user account signs up and completes onboarding
# 2. Wait 5 minutes (or trigger cron manually if configured)
# 3. Dashboard should show: V Score, SEO Score, crawl progress
# 4. Check server logs: pm2 logs vturnai-app | grep -i "scan\|job"
# 5. Verify no 401 errors in cron logs
```

## Why This Fixes "No Data" Issue

1. **Onboarding → Initial Scan**: When users complete onboarding, a job is queued
2. **Cron Processor Runs**: On schedule (every 2 min), `/api/cron/process-jobs` claims and runs jobs
3. **Crawl Executes**: Site crawler fetches pages, scores them
4. **Data Populates**: Scores stored in `project_scores` table
5. **Dashboard Updates**: Real-time via SSR data loading (src/lib/data/dashboard.ts)
6. **User Sees Results**: V Score, SEO, AEO, GEO metrics appear immediately

## Related Files Modified
- `.env.local` - Added CRON_SECRET (✅ Done)
- `.claude/launch.json` - Added autoPort for local dev
- VPS `.env.local` - Pending (need to SSH and update)

## Next: Deployment Strategy

Once CRON_SECRET is added to production:
1. Existing queued jobs will automatically run
2. All new onboardings will get scans automatically
3. System becomes truly real-time and data-driven

## Fallback Plan
If cron jobs still don't work after CRON_SECRET is added:
1. Check PM2 logs for errors
2. Verify database connectivity from cron processor
3. Check for failed job table for detailed errors
4. Manually trigger test job via curl with auth header
