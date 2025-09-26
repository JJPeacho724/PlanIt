#!/bin/bash

# Setup automatic Gmail ingestion cron job
echo "Setting up automatic Gmail ingestion..."

# Add cron job to run every 15 minutes during business hours (7 AM - 8 PM)
# and every 30 minutes during off hours
CRON_JOB_BUSINESS="*/15 7-20 * * * cd /root/startup && npm run cron >> /var/log/gmail-ingest.log 2>&1"
CRON_JOB_OFF_HOURS="*/30 21-6 * * * cd /root/startup && npm run cron >> /var/log/gmail-ingest.log 2>&1"

# Check if cron jobs already exist
if crontab -l 2>/dev/null | grep -q "gmail-ingest.log"; then
    echo "Cron jobs already exist. Updating..."
    # Remove existing jobs and add new ones
    (crontab -l 2>/dev/null | grep -v "gmail-ingest.log"; echo "$CRON_JOB_BUSINESS"; echo "$CRON_JOB_OFF_HOURS") | crontab -
else
    echo "Adding new cron jobs..."
    (crontab -l 2>/dev/null; echo "$CRON_JOB_BUSINESS"; echo "$CRON_JOB_OFF_HOURS") | crontab -
fi

# Create log file if it doesn't exist
sudo touch /var/log/gmail-ingest.log
sudo chmod 664 /var/log/gmail-ingest.log

echo "✅ Automatic Gmail ingestion cron jobs set up successfully!"
echo "📧 Emails will be synced every 15 minutes during business hours (7 AM - 8 PM)"
echo "🌙 Emails will be synced every 30 minutes during off hours (8 PM - 7 AM)"
echo "📝 Logs will be written to /var/log/gmail-ingest.log"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To view ingestion logs: tail -f /var/log/gmail-ingest.log"
echo ""
echo "Manual commands:"
echo "- Test ingestion: npm run cron"
echo "- Check status: curl http://localhost:3000/api/auto-ingest"
