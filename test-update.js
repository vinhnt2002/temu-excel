#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing update system...');

// Đọc currentVersion từ popup.js
const popupPath = path.join(__dirname, 'popup.js');
const popupContent = fs.readFileSync(popupPath, 'utf8');
const currentVersionMatch = popupContent.match(/const currentVersion = '([^']*)';/);
const currentVersion = currentVersionMatch ? currentVersionMatch[1] : 'unknown';

console.log(`📱 Extension currentVersion: ${currentVersion}`);

// Đọc version từ update-info.json
const updateInfoPath = path.join(__dirname, 'update-info.json');
const updateInfo = JSON.parse(fs.readFileSync(updateInfoPath, 'utf8'));

console.log(`📄 update-info.json version: ${updateInfo.version}`);
console.log(`📄 hasUpdate: ${updateInfo.hasUpdate}`);

// So sánh
if (currentVersion === updateInfo.version) {
  console.log('✅ Versions match - no update needed');
} else {
  console.log('🔄 Versions differ - update available');
  console.log(`   Extension: ${currentVersion}`);
  console.log(`   Update: ${updateInfo.version}`);
}

// Kiểm tra manifest.json
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`📋 manifest.json version: ${manifest.version}`);

console.log('\n🔍 Debug info:');
console.log(`   Extension version: ${currentVersion}`);
console.log(`   Manifest version: ${manifest.version}`);
console.log(`   Update version: ${updateInfo.version}`);
console.log(`   Has update: ${updateInfo.hasUpdate}`);

if (currentVersion !== updateInfo.version) {
  console.log('\n⚠️ Extension needs to be reloaded to detect new version!');
  console.log('   1. Go to chrome://extensions/');
  console.log('   2. Find "Dino Temu Tool"');
  console.log('   3. Click reload button (🔄)');
  console.log('   4. Extension will detect version 1.2.1');
}


