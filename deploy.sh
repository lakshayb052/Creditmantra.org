#!/bin/bash
set -e

echo "========================================="
echo "  CreditMantra Deployment Script"
echo "========================================="

# Step 1: Install Node.js 20
echo "[1/9] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Step 2: Install PM2
echo "[2/9] Installing PM2..."
sudo npm install pm2 -g

# Step 3: Install Nginx
echo "[3/9] Installing Nginx..."
sudo apt install nginx -y

# Step 4: Clone project
echo "[4/9] Cloning CreditMantra..."
cd /home/ubuntu
if [ -d "creditmantra" ]; then
    echo "Directory exists, pulling latest..."
    cd creditmantra && git pull
else
    git clone https://github.com/Lakshayb057/CreditMantra.git creditmantra
    cd creditmantra
fi

# Step 5: Install backend dependencies
echo "[5/9] Installing backend dependencies..."
cd /home/ubuntu/creditmantra/server
npm install

# Step 6: Create .env file (if it doesn't exist)
echo "[6/9] Setting up .env file..."
ENV_FILE="/home/ubuntu/creditmantra/server/.env"
if [ -f "$ENV_FILE" ]; then
    echo ".env file already exists — preserving existing configuration."
else
    cat > "$ENV_FILE" << 'ENDOFENV'
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/postgres
ADMIN_PASSWORD=creditMantra@org
LAKSHAY_PASSWORD=Lakshay@123
JWT_SECRET=supersecretjwtkeyforcreditmantra
# WhatsApp credentials are now configurable via Admin Dashboard > Settings
# You can set them here as fallback, or leave blank and use the Admin UI
WA_API_KEY=
WA_PHONE_NUMBER_ID=
WA_OTP_TEMPLATE_NAME=auth_otp
WA_REFERRAL_TEMPLATE_NAME=transactional_link
WA_TEMPLATE_LANGUAGE=en
ENDOFENV
    echo ".env file created — edit it with your actual DATABASE_URL before starting."
fi

# Step 7: Start backend with PM2
echo "[7/9] Starting backend..."
cd /home/ubuntu/creditmantra/server
pm2 stop creditmantra-backend 2>/dev/null || true
pm2 delete creditmantra-backend 2>/dev/null || true
pm2 start server.js --name "creditmantra-backend"
pm2 save

# Step 8: Build frontend and deploy
echo "[8/9] Building frontend..."
cd /home/ubuntu/creditmantra/client
npm install --legacy-peer-deps
npm run build
sudo mkdir -p /var/www/creditmantra
sudo cp -r dist/* /var/www/creditmantra/
sudo chown -R www-data:www-data /var/www/creditmantra

# Step 9: Configure Nginx (uses the production-tested nginx.conf from the repo)
echo "[9/9] Configuring Nginx..."
sudo cp /home/ubuntu/creditmantra/nginx.conf /etc/nginx/sites-available/creditmantra
sudo ln -sf /etc/nginx/sites-available/creditmantra /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Enable PM2 to start on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
pm2 save

echo ""
echo "========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "  Your site is live at: http://$(curl -s ifconfig.me)"
echo ""
echo "  NEXT STEPS:"
echo "  1. Edit server/.env with your actual DATABASE_URL"
echo "  2. Configure WhatsApp API via Admin Dashboard > Settings"
echo "  3. Run: pm2 restart creditmantra-backend"
echo "========================================="
