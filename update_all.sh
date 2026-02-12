#!/bin/bash

# Script untuk mengupdate seluruh layanan (Backend & Frontend)

echo "=========================================="
echo "🚀 MEMULAI PROSES UPDATE SISTEM"
echo "=========================================="

# 1. Update Backend
echo ""
echo "📦 [1/2] Updating Backend..."
cd /var/www/sis-project/backend || exit
echo "   -> Syncing Database Schema..."
npx prisma db push
echo "   -> Building TypeScript..."
npm run build
if [ $? -eq 0 ]; then
    echo "   -> Restarting PM2 Service..."
    pm2 restart sis-backend
    echo "   ✅ Backend updated successfully!"
else
    echo "   ❌ Backend build failed!"
    exit 1
fi

# 2. Update Frontend
echo ""
echo "🎨 [2/2] Updating Frontend..."
cd /var/www/sis-project/frontend || exit
echo "   -> Building & Deploying to /var/www/html/..."
npm run deploy
if [ $? -eq 0 ]; then
    echo "   ✅ Frontend updated & deployed successfully!"
else
    echo "   ❌ Frontend deploy failed!"
    exit 1
fi

echo ""
echo "=========================================="
echo "✨ SEMUA LAYANAN SUDAH UP-TO-DATE!"
echo "=========================================="
