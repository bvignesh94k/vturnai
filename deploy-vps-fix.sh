#!/bin/bash
# Deploy CRON_SECRET fix to VPS
# Usage: ./deploy-vps-fix.sh <VPS_IP> <CRON_SECRET>

set -e

VPS_IP="${1:-66.29.131.95}"
CRON_SECRET="${2:-}"

if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET not provided"
  echo "Usage: $0 <VPS_IP> <CRON_SECRET>"
  echo ""
  echo "To generate CRON_SECRET locally:"
  echo "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  exit 1
fi

echo "🚀 Deploying CRON_SECRET fix to VPS at $VPS_IP"
echo "CRON_SECRET: ${CRON_SECRET:0:16}...${CRON_SECRET: -8}"

# 1. SSH to VPS and add CRON_SECRET to .env.local
echo ""
echo "📝 Adding CRON_SECRET to /root/vturnai/.env.local..."
ssh root@$VPS_IP << EOF
  set -e
  cd /root/vturnai

  # Backup existing .env.local
  cp .env.local .env.local.backup.$(date +%s)

  # Check if CRON_SECRET already exists
  if grep -q "^CRON_SECRET=" .env.local; then
    # Replace existing
    sed -i "s/^CRON_SECRET=.*/CRON_SECRET=$CRON_SECRET/" .env.local
    echo "✓ Updated existing CRON_SECRET"
  else
    # Add after ENCRYPTION_KEY
    sed -i "/^ENCRYPTION_KEY=/a\\
# Job queue cron worker secret\\
CRON_SECRET=$CRON_SECRET" .env.local
    echo "✓ Added CRON_SECRET to .env.local"
  fi

  # Verify it was added
  grep "CRON_SECRET=" .env.local
EOF

# 2. Restart PM2 process
echo ""
echo "🔄 Restarting application..."
ssh root@$VPS_IP << EOF
  cd /root/vturnai
  pm2 restart vturnai-app
  sleep 2
  pm2 status vturnai-app
EOF

# 3. Verify app is running
echo ""
echo "✅ Verifying application..."
ssh root@$VPS_IP << EOF
  cd /root/vturnai
  curl -s http://localhost:3000/login | head -n 20 | grep -i "log in" && echo "✓ App is responding" || echo "✗ App may not be responding"
EOF

# 4. Test cron endpoint
echo ""
echo "🧪 Testing cron endpoint authentication..."
CRON_RESPONSE=$(ssh root@$VPS_IP "curl -s -I -H 'Authorization: Bearer $CRON_SECRET' http://localhost:3000/api/cron/process-jobs")
if echo "$CRON_RESPONSE" | grep -q "200"; then
  echo "✓ Cron endpoint is working"
else
  echo "⚠ Cron endpoint returned:"
  echo "$CRON_RESPONSE"
fi

# 5. Show PM2 logs for last 20 lines
echo ""
echo "📋 Recent application logs:"
ssh root@$VPS_IP "pm2 logs vturnai-app --lines 20 --nostream"

echo ""
echo "✨ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set up external cron job scheduler to call: https://vturnai.com/api/cron/process-jobs"
echo "2. Authorization header: Bearer $CRON_SECRET"
echo "3. Schedule: Every 2 minutes (recommended)"
echo ""
echo "Test users experiencing data issues should log out and back in to refresh."
