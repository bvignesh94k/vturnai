# Manual Deployment: Add CRON_SECRET to VPS

## Step 1: Generate CRON_SECRET Locally
Run this on your local machine:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Output will look like: `b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6`

**Keep this value - you'll need it for the next steps.**

## Step 2: SSH to VPS and Edit .env.local

### Option A: Command Line (SSH)
```bash
ssh root@66.29.131.95

# Navigate to app directory
cd /root/vturnai

# Backup current config
cp .env.local .env.local.backup

# Open in text editor
nano .env.local
```

**In nano editor:**
1. Find the line with `ENCRYPTION_KEY=`
2. Place cursor at end of that line
3. Press Enter to create new line
4. Add these two lines:
   ```
   # Job queue cron worker secret — authenticates /api/cron/process-jobs requests
   CRON_SECRET=<paste-your-secret-here>
   ```
5. Press Ctrl+X, then Y, then Enter to save

### Option B: Using sed (One-liner)
```bash
ssh root@66.29.131.95 << 'EOF'
cd /root/vturnai
cp .env.local .env.local.backup
SECRET="b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6"
sed -i "/^ENCRYPTION_KEY=/a\# Job queue cron worker secret\nCRON_SECRET=$SECRET" .env.local
grep CRON_SECRET .env.local
EOF
```

### Option C: cPanel File Manager (If SSH Unavailable)
1. Log in to cPanel
2. Go to File Manager
3. Navigate to `/home/vturnai/` (or wherever your app is)
4. Right-click `.env.local` → Edit
5. Find `ENCRYPTION_KEY=` line
6. Add after it:
   ```
   # Job queue cron worker secret — authenticates /api/cron/process-jobs requests
   CRON_SECRET=<your-secret>
   ```
7. Save and close

## Step 3: Restart Application

```bash
ssh root@66.29.131.95

# Navigate to app
cd /root/vturnai

# Stop old process
pm2 stop vturnai-app

# Verify stopped
pm2 status | grep vturnai

# Start again (will pick up new .env)
pm2 start vturnai-app
# OR restart
pm2 restart vturnai-app

# Verify it started
pm2 logs vturnai-app --lines 10
```

## Step 4: Verify CRON_SECRET Works

Test that the cron endpoint accepts requests with the secret:

```bash
ssh root@66.29.131.95

# Using your CRON_SECRET
curl -v -H "Authorization: Bearer b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6" \
  http://localhost:3000/api/cron/process-jobs
```

**Expected response** (on first run):
```json
{"jobsProcessed": 0, "jobsFailed": 0, "nextRunAt": null}
```

Or if there were queued jobs:
```json
{"jobsProcessed": 1, "jobsFailed": 0, "nextRunAt": "2026-08-30T10:35:00Z"}
```

If you see `{"error": "Unauthorised"}`, the CRON_SECRET is wrong or not set.

## Step 5: Set Up Automated Cron Scheduling

You need to call the job processor regularly. Choose one option:

### Option A: EasyCron (Recommended - No Installation)

1. Go to https://easycron.com/
2. Sign up (free)
3. Create new cron job:
   - **Cron Expression**: `*/2 * * * *` (every 2 minutes)
   - **URL**: `https://vturnai.com/api/cron/process-jobs`
   - **HTTP Method**: GET
   - **HTTP Headers**: Add
     - Name: `Authorization`
     - Value: `Bearer b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6`
   - Check "HTTP Authentication" if needed
   - Enable notifications for failures
4. Click "Create" and test it

### Option B: cron-job.org

1. Go to https://cron-job.org/
2. Login/Register
3. New cron job:
   - **URL**: `https://vturnai.com/api/cron/process-jobs`
   - **Execution interval**: `2 minutes`
   - **Request Headers**: Add custom header
     - `Authorization: Bearer b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6`
4. Save and test

### Option C: AWS Lambda / Netlify Scheduled Functions

If you have those set up, create a similar function that calls the endpoint.

### Option D: VPS Cron (If you prefer local cron)

```bash
ssh root@66.29.131.95

# Edit crontab
crontab -e

# Add this line (runs every 2 minutes):
*/2 * * * * curl -H "Authorization: Bearer b0dc49e7118a651d12d36157ef716a55fcc0dcf31eab2e368053122621c24da6" http://localhost:3000/api/cron/process-jobs >> /var/log/vturnai-cron.log 2>&1

# Save (Ctrl+X, Y, Enter in nano)

# Verify it was added
crontab -l
```

## Step 6: Test the Fix

After setting up cron scheduling:

1. **Create test user account** at https://vturnai.com
2. **Complete onboarding** with your domain
3. **Watch the dashboard** - you should see:
   - Progress bar updating
   - "Building your visibility profile" message
   - After 2-5 minutes: V Score, SEO Score, etc. appearing
4. **Check logs**:
   ```bash
   ssh root@66.29.131.95
   pm2 logs vturnai-app | grep -i "scan\|job\|crawl"
   ```

## Troubleshooting

### Cron Endpoint Returns 401 (Unauthorised)
- [ ] CRON_SECRET is not in `.env.local`
- [ ] CRON_SECRET is incorrect or has typo
- [ ] App hasn't been restarted after adding secret

**Fix**: Edit `.env.local` again, verify secret matches exactly, restart app.

### Jobs Still Not Running
- [ ] Cron scheduler isn't actually calling the endpoint
- [ ] HTTP endpoint is down

**Fix**:
```bash
# Test endpoint manually
curl -v -H "Authorization: Bearer YOUR_SECRET" https://vturnai.com/api/cron/process-jobs

# Should return 200 with JSON response
```

### Jobs Queued But Not Processing
```bash
ssh root@66.29.131.95

# Check database for stuck jobs
psql $DATABASE_URL -c "SELECT id, job_type, status, attempts, error_message FROM jobs ORDER BY created_at DESC LIMIT 5;"

# If jobs are stuck, manually trigger processing
curl -H "Authorization: Bearer YOUR_SECRET" http://localhost:3000/api/cron/process-jobs

# Check PM2 logs for errors
pm2 logs vturnai-app --err
```

### App Won't Start After Changes
```bash
# Check what went wrong
pm2 logs vturnai-app --err

# Common issues:
# - Syntax error in .env.local
# - Invalid characters in CRON_SECRET

# Restore backup and try again
mv /root/vturnai/.env.local.backup /root/vturnai/.env.local
pm2 restart vturnai-app
```

## Success Criteria

✅ You'll know it's working when:
1. Existing test users see data appearing in their dashboards
2. New users completing onboarding go to "Building..." page that shows progress
3. After 2-5 minutes, dashboard shows V Score, audit results, opportunities
4. No 401 errors in PM2 logs
5. Cron scheduler logs show successful calls

## Next Steps After Deployment

1. **Notify existing users** that their accounts are now functional
2. **Test trial-to-paid workflow** to ensure subscription and billing work
3. **Monitor PM2 logs** for first 24 hours to catch any issues
4. **Set up alerts** if cron processor fails repeatedly
5. **Consider Vercel migration** (simpler cron setup) if staying on shared hosting is problematic

## Questions?

If you encounter issues, check:
1. `.env.local` has `CRON_SECRET=<value>` (no typos)
2. App restarted after adding secret
3. Cron scheduler is actually making HTTP requests
4. Authorization header format is exactly: `Bearer <secret>`
5. PM2 logs show no database connection errors
