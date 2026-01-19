#!/bin/bash

echo "======================================"
echo "Testing Frontend Build"
echo "======================================"

cd /home/van/reward-project/frontend

echo "Running TypeScript check..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "✅ Build SUCCESS!"
    echo "======================================"
else
    echo ""
    echo "======================================"
    echo "❌ Build FAILED!"
    echo "======================================"
    exit 1
fi
