#!/bin/bash

# Script untuk mengupdate seluruh layanan (Backend & Frontend)

ROOT_DIR="/var/www/sis-project"

echo "=========================================="
echo "🚀 MEMULAI PROSES UPDATE SISTEM"
echo "=========================================="

# Safety gate (can be bypassed with ALLOW_DIRTY_DEPLOY=1)
if [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]; then
    echo ""
    echo "🛡️  Menjalankan repo safety gate (mode: web)..."
    bash "$ROOT_DIR/scripts/repo-safety-gate.sh" web
    if [ $? -ne 0 ]; then
        echo "   ❌ Safety gate menolak deploy. Isolasi perubahan dulu atau set ALLOW_DIRTY_DEPLOY=1 jika memang darurat."
        exit 1
    fi
fi

# 1. Update Backend
echo ""
echo "📦 [1/2] Updating Backend..."
cd "$ROOT_DIR/backend" || exit
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
cd "$ROOT_DIR/frontend" || exit
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
