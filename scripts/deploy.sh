#!/bin/bash
# Deploy script for Cloudflare Workers Dropshipping Automation
# Run: bash scripts/deploy.sh

set -e

echo "=========================================="
echo "  Dropshipping Automation - Deploy Script"
echo "=========================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing Wrangler CLI..."
    npm install -g wrangler
fi

# Check if logged in
echo "Checking Cloudflare authentication..."
wrangler whoami || {
    echo "Please login to Cloudflare first:"
    wrangler login
}

echo ""
echo "Step 1: Creating D1 Database..."
echo ""

# Create D1 database
D1_OUTPUT=$(wrangler d1 create dropshipping-db 2>&1)
echo "$D1_OUTPUT"

# Extract database ID
DB_ID=$(echo "$D1_OUTPUT" | grep -o '"database_id": "[^"]*"' | cut -d'"' -f4)
echo ""
echo "Database ID: $DB_ID"
echo ""

# Update wrangler.toml with database ID
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.toml
else
    sed -i "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.toml
fi

echo "Step 2: Creating KV Namespace..."
echo ""

# Create KV namespace
KV_OUTPUT=$(wrangler kv namespace create KV 2>&1)
echo "$KV_OUTPUT"

# Extract KV ID
KV_ID=$(echo "$KV_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo ""
echo "KV Namespace ID: $KV_ID"
echo ""

# Update wrangler.toml with KV ID
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/YOUR_KV_NAMESPACE_ID/$KV_ID/" wrangler.toml
else
    sed -i "s/YOUR_KV_NAMESPACE_ID/$KV_ID/" wrangler.toml
fi

echo "Step 3: Running Database Migrations..."
echo ""

wrangler d1 execute dropshipping-db --file=./migrations/0001_init.sql
wrangler d1 execute dropshipping-db --file=./migrations/0002_seed.sql

echo ""
echo "Step 4: Deploying Worker..."
echo ""

wrangler deploy

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "Your Worker is deployed at:"
echo "  https://dropshipping-automation.YOUR_SUBDOMAIN.workers.dev"
echo ""
echo "Dashboard URL:"
echo "  https://dropshipping-automation.YOUR_SUBDOMAIN.workers.dev/api/dashboard"
echo ""
echo "Next Steps:"
echo "1. Update wrangler.toml with your API keys"
echo "2. Redeploy: wrangler deploy"
echo "3. Set up WhatsApp Business API webhook"
echo "4. Set up TikTok Content Posting API"
echo ""
