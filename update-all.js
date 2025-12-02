#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Đọc version mới từ command line argument
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ Vui lòng cung cấp version mới!');
  console.log('📝 Cách sử dụng: node update-all.js 1.3.0');
  process.exit(1);
}

console.log(`🚀 Updating everything to version ${newVersion}...`);

// 1. Update manifest.json
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Updated manifest.json: ${manifest.version}`);

// 2. Update update-info.json
const updateInfo = {
  "version": newVersion,
  "hasUpdate": true,
  "downloadUrl": "https://github.com/trunglee0611/dino-temu-tool/releases/latest",
  "changelog": [
    "✅ Sửa lỗi đọc header từ 4 hàng đầu tiên",
    "✅ Cải thiện logic tìm cột size (HE)",
    "✅ Tối ưu hóa clone Excel template",
    "✅ Sửa lỗi 'No template row found for size'",
    "✅ Thêm debug chi tiết cho sample rows",
    "✅ Cải thiện so sánh size linh hoạt"
  ],
  "releaseDate": new Date().toISOString().split('T')[0],
  "critical": false
};

const updateInfoPath = path.join(__dirname, 'update-info.json');
fs.writeFileSync(updateInfoPath, JSON.stringify(updateInfo, null, 2));
console.log(`✅ Updated update-info.json: ${updateInfo.version}`);

// 3. Update popup.js version
const popupPath = path.join(__dirname, 'popup.js');
let popupContent = fs.readFileSync(popupPath, 'utf8');
popupContent = popupContent.replace(/const currentVersion = '[^']*';/, `const currentVersion = '${newVersion}';`);
fs.writeFileSync(popupPath, popupContent);
console.log(`✅ Updated popup.js: currentVersion = ${newVersion}`);

console.log('\n🎉 All files updated!');
console.log('\n📋 Next steps:');
console.log('1. Upload extension folder to GitHub repository');
console.log('2. Upload update.json to GitHub repository');
console.log('3. Extension will automatically detect the new version from GitHub');
console.log('4. Users will see update notification');

console.log('\n🔗 GitHub repository:');
console.log('   https://github.com/trunglee0611/dino-temu-tool');

console.log('\n📝 Chỉ cần 1 lệnh này để update version!');
console.log('   node update-all.js [VERSION]');
