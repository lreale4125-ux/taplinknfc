# NFC Analytics - Full-Stack Deployment Guide

A complete NFC keychain analytics platform with company-based user management, admin controls, and real-time analytics.

## 🚀 Features

- **Company-Based Registration**: Users register with company names, companies created dynamically
- **Admin-Only Keychain Management**: Only admins can assign keychain numbers and manage links
- **Real-Time Analytics**: Track NFC keychain scans with detailed analytics
- **Link Management**: Create company-wide links that all keychains redirect to
- **Secure Authentication**: JWT-based auth with role-based access control

## 📋 Prerequisites

- Ubuntu 20.04+ VPS
- Node.js 18+
- Nginx
- PM2 (process manager)
- SSL certificate (Let's Encrypt recommended)

## 🛠️ Local Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Frontend runs on http://localhost:8080
# Backend runs on http://localhost:5000
```

## 🚀 Production Deployment

### 1. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install nginx
sudo apt install nginx -y
```

### 2. Deploy Application

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment (replace with your server IP)
./deploy.sh ubuntu@51.75.70.149
```

### 3. Configure Nginx

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/taplinknfc.it

# Enable site
sudo ln -s /etc/nginx/sites-available/taplinknfc.it /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 4. SSL Setup (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d taplinknfc.it -d www.taplinknfc.it

# Auto-renewal is automatically configured
```

### 5. PM2 Startup Configuration

```bash
# On your server, run this once to enable PM2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

## 📁 Project Structure

```
├── server.js              # Express backend server
├── ecosystem.config.js    # PM2 configuration
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables
├── nginx.conf            # Nginx configuration
├── deploy.sh             # Deployment script
├── database.db           # SQLite database (created on first run)
├── logs/                 # PM2 logs
└── ../nfc-link-stats-main/  # Frontend React app
    ├── dist/            # Built frontend files
    └── src/             # Source code
```

## 🔧 Configuration

### Environment Variables (.env)

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=your-super-secure-jwt-secret-change-this
DATABASE_PATH=./database.db
CORS_ORIGIN=https://taplinknfc.it
```

### PM2 Management

```bash
# Check status
pm2 status

# View logs
pm2 logs nfc-analytics-api

# Restart service
pm2 restart nfc-analytics-api

# Stop service
pm2 stop nfc-analytics-api
```

## 🔐 Security Notes

- Change the JWT_SECRET in production
- Use strong passwords for admin accounts
- Keep SSL certificates updated
- Regularly backup the database.db file
- Monitor logs for suspicious activity

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### User Management (Admin Only)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Keychain Management
- `GET /api/keychains` - User's keychains
- `POST /api/keychains` - Create keychain
- `PUT /api/keychains/:id/link` - Assign link to keychain
- `DELETE /api/admin/keychains/:id` - Delete keychain (Admin)

### Link Management
- `GET /api/links` - Company links
- `POST /api/links` - Create link
- `PUT /api/links/:id` - Update link
- `DELETE /api/links/:id` - Delete link

### Analytics
- `GET /api/analytics` - View analytics
- `GET /api/analytics/summary` - Analytics summary

### Public Endpoints
- `GET /redirect/:keychainId` - NFC redirect endpoint

## 🎯 Usage

### For Companies
1. Register with company name
2. Employees can create keychains
3. All keychains redirect to company links

### For Admins
1. Login with admin credentials
2. Create/manage company links
3. Assign keychain numbers
4. Monitor analytics

### NFC Integration
- Keychains redirect to: `https://taplinknfc.it/redirect/{keychainId}`
- Analytics automatically collected on each scan

## 🔄 Backup Strategy

```bash
# Database backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /home/ubuntu/database.db /home/ubuntu/backups/database_$DATE.db

# Frontend backup
cp -r /var/www/taplinknfc.it /home/ubuntu/backups/frontend_$DATE
```

## 📞 Support

For issues or questions:
- Check PM2 logs: `pm2 logs nfc-analytics-api`
- Check nginx logs: `sudo tail -f /var/log/nginx/taplinknfc.it.error.log`
- Database location: `/home/ubuntu/database.db`

## 🎉 You're All Set!

Your NFC Analytics platform is now live and ready to manage company keychains with full admin controls and analytics! 🚀