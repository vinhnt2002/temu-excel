# 🚀 Hướng dẫn Update Extension

## 📋 Quy trình Update

### Bước 1: Cập nhật Version
```bash
# Cập nhật version mới (ví dụ: 1.3.0)
node update-version.js 1.3.0
```

**Script sẽ tự động:**
- ✅ Cập nhật `manifest.json`
- ✅ Cập nhật `update-info.json` 
- ✅ Cập nhật `popup.js` (currentVersion)
- ✅ Set `hasUpdate = true`
- ✅ Cập nhật `releaseDate`

### Bước 2: Upload lên Google Drive

#### Cách 1: Sử dụng script tự động
```bash
# Upload tất cả files lên Drive
./upload-to-drive.sh
```

#### Cách 2: Upload thủ công
1. **Tạo folder mới trên Drive:**
   - Tên: `Dino_Temu_Tool_v[timestamp]`
   - Ví dụ: `Dino_Temu_Tool_v20250106_143022`

2. **Upload các files:**
   - `manifest.json`
   - `popup.js`
   - `background.js`
   - `app.html`
   - `popup.html`
   - `styles.css`
   - `xlsx.full.min.js`
   - `logothumnail.png`
   - `temu_colors (1).txt`
   - `update-info.json`
   - `HUONG_DAN_SU_DUNG.html`

3. **Share folder:**
   - Click chuột phải → Share
   - Set "Anyone with the link can view"
   - Copy link

### Bước 3: Cập nhật Download URL
```json
{
  "version": "1.3.0",
  "hasUpdate": true,
  "downloadUrl": "https://drive.google.com/drive/folders/[FOLDER_ID]",
  "changelog": [
    "✅ Sửa lỗi đọc header từ 4 hàng đầu",
    "✅ Cải thiện logic tìm cột size",
    "✅ Tối ưu hóa clone Excel template"
  ],
  "releaseDate": "2025-01-06",
  "critical": false
}
```

## 🔧 Cài đặt gdrive CLI (nếu cần)

### macOS:
```bash
brew install gdrive
```

### Linux:
```bash
wget https://github.com/gdrive-org/gdrive/releases/download/2.1.1/gdrive_2.1.1_linux_386.tar.gz
tar -xzf gdrive_2.1.1_linux_386.tar.gz
sudo mv gdrive /usr/local/bin/
```

### Windows:
1. Tải từ: https://github.com/gdrive-org/gdrive/releases
2. Giải nén và thêm vào PATH

## 📝 Checklist Update

- [ ] Chạy `node update-version.js [VERSION]`
- [ ] Kiểm tra version trong 3 files
- [ ] Upload extension lên Drive
- [ ] Upload `update-info.json` lên Drive
- [ ] Share folder publicly
- [ ] Cập nhật `downloadUrl` trong `update-info.json`
- [ ] Test extension với version mới
- [ ] Thông báo cho users

## 🚨 Lưu ý quan trọng

1. **Version format:** Sử dụng semantic versioning (1.2.3)
2. **Backup:** Luôn tạo backup trước khi update
3. **Test:** Test kỹ trước khi release
4. **Changelog:** Ghi rõ những thay đổi quan trọng
5. **Critical:** Đánh dấu `critical: true` nếu có lỗi bảo mật

## 🔗 Links hữu ích

- **Google Drive:** https://drive.google.com/drive/folders/1ANeRm_g3bLI-j3JvEmlySj4-9fHfiD8U
- **gdrive CLI:** https://github.com/gdrive-org/gdrive
- **Semantic Versioning:** https://semver.org/
