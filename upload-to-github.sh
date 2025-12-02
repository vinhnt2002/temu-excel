#!/bin/bash

# Script để upload extension lên GitHub
echo "🚀 Uploading Dino Temu Tool v1.2.2 to GitHub..."

# Kiểm tra git status
echo "📋 Checking git status..."
git status

# Add tất cả files
echo "📁 Adding all files..."
git add .

# Commit với message
echo "💾 Committing changes..."
git commit -m "🚀 Release v1.2.2 - Clone Excel theo size, báo dung lượng file, xóa URL hình ảnh"

# Push lên GitHub
echo "⬆️ Pushing to GitHub..."
git push origin main

echo "✅ Upload completed!"
echo "📊 Version: 1.2.2"
echo "🔗 GitHub: https://github.com/lechitrung19360221-bot/Dino-Extension-Manual"
echo "📥 Download: https://github.com/lechitrung19360221-bot/Dino-Extension-Manual/releases"


