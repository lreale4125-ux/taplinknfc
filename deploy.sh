#!/bin/bash

# NFC Analytics Deployment Script
# Usage: ./deploy.sh [ubuntu@server-ip]

set -e

SERVER=${1:-"ubuntu@51.75.70.149"}
PROJECT_NAME="nfc-analytics"
REMOTE_PATH="/home/ubuntu"
WEB_PATH="/var/www/taplinknfc.it"

echo "🚀 Starting deployment to $SERVER..."

# Build the frontend
echo "📦 Building frontend..."
cd ../nfc-link-stats-main
npm run build
cd ../dist

# Copy frontend build to deployment package
cp -r ../nfc-link-stats-main/dist ./frontend-dist

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf ${PROJECT_NAME}.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    --exclude='*.log' \
    --exclude='database.db' \
    --exclude="${PROJECT_NAME}.tar.gz" \
    .

# Upload to server
echo "📤 Uploading to server..."
scp ${PROJECT_NAME}.tar.gz ${SERVER}:${REMOTE_PATH}/

# Deploy on server
echo "🔧 Deploying on server..."
ssh ${SERVER} << EOF
    cd ${REMOTE_PATH}

    # Initial setup for fresh VPS
    echo "🔧 Setting up server environment..."
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y curl

    # Install Node.js (latest LTS)
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs

    # Install nginx
    sudo apt install -y nginx

    # Install PM2 globally
    sudo npm install -g pm2

    # Create web directory
    sudo mkdir -p ${WEB_PATH}
    sudo chown -R ubuntu:ubuntu ${WEB_PATH}

    # Setup nginx configuration
    sudo cp ${REMOTE_PATH}/nginx.conf /etc/nginx/sites-available/taplinknfc.it
    sudo ln -sf /etc/nginx/sites-available/taplinknfc.it /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl enable nginx
    sudo systemctl start nginx

    # Backup current database if it exists
    if [ -f "database.db" ]; then
        cp database.db database.db.backup
        echo "💾 Database backed up"
    fi

    # Extract new files
    tar -xzf ${PROJECT_NAME}.tar.gz
    rm ${PROJECT_NAME}.tar.gz

    # Install/update dependencies
    npm install --production

    # Stop existing PM2 process
    pm2 stop ${PROJECT_NAME} || true
    pm2 delete ${PROJECT_NAME} || true

    # Start with PM2
    pm2 start ecosystem.config.js --env production
    pm2 save

    # Setup PM2 startup (run only once)
    # sudo env PATH=\$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

    echo "✅ Backend deployed successfully"
EOF

# Deploy frontend
echo "🎨 Deploying frontend..."
ssh ${SERVER} "sudo cp -r ${REMOTE_PATH}/frontend-dist/* ${WEB_PATH}/"

# Reload nginx
echo "🔄 Reloading nginx..."
ssh ${SERVER} "sudo systemctl reload nginx"

echo "🎉 Deployment completed successfully!"
echo "🌐 Your app is now live at: https://taplinknfc.it"
echo "🔧 Backend API running on port 3001"
echo "💾 Database: ${REMOTE_PATH}/database.db"