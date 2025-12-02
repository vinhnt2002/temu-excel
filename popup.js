const MAX_IMAGES = 10;
const DEFAULT_IMAGES = 4;

const $ = id => document.getElementById(id);

let colors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Gray']; // Default colors
let selectedColors = [];
let colorImages = {}; // { colorName: [url1, url2, ...], ... } - mỗi màu có bộ ảnh riêng
let activeColor = null; // màu đang được chọn để nhập ảnh
const DEFAULT_IMAGES_PER_COLOR = 2; // Mặc định chỉ hiển thị 2 input
let parsedCsv = null;
let parsedFileName = 'products.csv';
let parsedWorkbook = null;
let parsedWorkbookOriginal = null; // keep original for cloning sample rows
let parsedWorkbookWorking = null; // working copy to write into (headers + appended rows)
let parsedSheetName = null;
let templateHeaders = null;
let templateSampleRows = [];
let writeCursor = 5; // 1-based row index where next write should start (start at row 5)
const MAX_ROWS = 2000;
let productCount = 0; // Counter for products added
let updateNotificationShown = false; // Track if update notification was shown
let lastUpdateCheck = 0; // Track last update check time

// Queue system for background processing
let processingQueue = [];
let isProcessing = false;
let queueIdCounter = 0;
// Đọc version từ manifest.json
let currentVersion = '1.0.0'; // fallback
try {
  currentVersion = chrome.runtime.getManifest().version;
} catch (e) {
  console.warn('Could not read version from manifest:', e);
}

// Hiển thị version ngay lập tức
function displayVersion() {
  const versionDisplay = document.getElementById('versionDisplay');
  if (versionDisplay) {
    versionDisplay.textContent = currentVersion;
    console.log('Version displayed:', currentVersion);
  } else {
    console.error('Version display element not found');
  }
}

// Chạy ngay lập tức và sau khi DOM ready
setTimeout(displayVersion, 100); // Delay 100ms để đảm bảo HTML load xong
document.addEventListener('DOMContentLoaded', displayVersion);
const updateCheckInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const updateDriveUrl = 'https://drive.google.com/uc?export=download&id=19dXyvV8F-8HpONQ8wPmCOyT59Yzo6_vP'; // Download link của update-info.json trên Drive

// Check for updates from Google Drive
async function checkForUpdates() {
  try {
    console.log('🔍 Checking for updates...');
    
    // Always check for updates (no cache)
    await checkAndShowUpdate();
    
  } catch (error) {
    console.log('❌ Update check failed:', error.message);
  }
}

// Check and show update (separate function)
async function checkAndShowUpdate() {
  // Only read from GitHub (no fallback)
  try {
    console.log('🔍 Fetching from GitHub...');
    const response = await fetch('https://raw.githubusercontent.com/lechitrung19360221-bot/Dino-Extension-Manual/main/update.json');
    console.log('📡 GitHub response status:', response.status);
    
    if (response.ok) {
      const updateData = await response.json();
      console.log('☁️ GitHub update data:', updateData);
      
      if (updateData.hasUpdate && updateData.version !== currentVersion) {
        console.log('🆕 New update available from GitHub:', updateData.version);
        // Clear any cached dismiss state
        localStorage.removeItem('updateDismissed');
        console.log('🚀 Showing update notification...');
        showUpdateNotification(updateData, true);
        return;
      } else {
        console.log('✅ No updates available from GitHub');
        return;
      }
    } else {
      console.log('❌ GitHub response not ok:', response.status);
    }
  } catch (githubError) {
    console.log('❌ GitHub update check failed:', githubError.message);
  }
  
  console.log('❌ GitHub failed, no fallback');
}

// Fallback: Check local update file
async function checkLocalUpdate() {
  try {
    // Try to fetch a local update file
    const response = await fetch(chrome.runtime.getURL('update-info.json'));
    if (response.ok) {
      const updateInfo = await response.json();
      if (updateInfo.version !== currentVersion) {
        showUpdateNotification(updateInfo);
      }
    }
  } catch (error) {
    console.log('❌ Local update check failed:', error.message);
  }
}

// Check if should show update notification
function shouldShowUpdateNotification() {
  // Check if user has seen this version's notification
  const lastSeenVersion = localStorage.getItem('lastSeenUpdateVersion');
  const dismissedAt = localStorage.getItem('updateDismissedAt');
  const now = Date.now();
  const dismissCooldown = 24 * 60 * 60 * 1000; // 24 hours
  
  // Don't show if user has seen this version
  if (lastSeenVersion === currentVersion) {
    console.log('🔍 User has already seen this version');
    return false;
  }
  
  // Don't show if user dismissed recently (within 24 hours)
  if (dismissedAt && (now - parseInt(dismissedAt)) < dismissCooldown) {
    console.log('🔍 User dismissed recently, cooldown active');
    return false;
  }
  
  const shouldShow = true;
  
  console.log('🔍 Should show notification check:', {
    lastSeenVersion,
    currentVersion,
    dismissedAt: dismissedAt ? new Date(parseInt(dismissedAt)).toISOString() : 'never',
    dismissCooldownRemaining: dismissedAt ? Math.max(0, dismissCooldown - (now - parseInt(dismissedAt))) : 0,
    shouldShow,
    updateNotificationShown
  });
  
  return shouldShow;
}

// Clear all existing notifications
function clearAllNotifications() {
  const existingNotifications = document.querySelectorAll('#updateNotification');
  existingNotifications.forEach(notification => {
    notification.remove();
  });
  updateNotificationShown = false;
  console.log('🧹 Cleared all existing notifications');
}

// Show update notification with dynamic content
function showUpdateNotification(updateData, force = false) {
  // Clear any existing notifications first
  clearAllNotifications();
  
  if (!force && (updateNotificationShown || !shouldShowUpdateNotification())) {
    console.log('🚫 Notification blocked:', {
      updateNotificationShown,
      shouldShow: shouldShowUpdateNotification(),
      force
    });
    return;
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'updateNotification';
  notification.innerHTML = `
    <div class="update-notification">
      <div class="update-header">
        <span class="update-icon">🚀</span>
        <span class="update-title">Có bản cập nhật mới!</span>
        <button class="update-close" id="updateCloseBtn">×</button>
      </div>
      <div class="update-content">
        <div class="version-info">
          <div class="version-badge">
            <span class="version-label">Phiên bản mới:</span>
            <span class="version-number">${updateData.version || 'mới'}</span>
          </div>
          <div class="current-version">
            <span class="current-label">Hiện tại:</span>
            <span class="current-number">${currentVersion}</span>
          </div>
        </div>
        
        ${updateData.changelog && updateData.changelog.length > 0 ? `
          <div class="changelog">
            <h4>✨ Các tính năng mới:</h4>
            <ul class="changelog-list">
              ${updateData.changelog.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${updateData.releaseDate ? `
          <div class="release-date">
            <span class="date-icon">📅</span>
            <span>Ngày phát hành: ${updateData.releaseDate}</span>
          </div>
        ` : ''}
        
        <div class="update-actions">
          <a href="${updateData.downloadUrl || 'https://drive.google.com/drive/folders/1ANeRm_g3bLI-j3JvEmlySj4-9fHfiD8U?usp=sharing'}" 
             target="_blank" class="update-btn update-download" id="updateDownloadBtn">
            <span class="btn-icon">📥</span>
            <span class="btn-text">Tải về ngay</span>
          </a>
          <button class="update-btn update-later" id="updateLaterBtn">
            <span class="btn-icon">⏰</span>
            <span class="btn-text">Để sau</span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  updateNotificationShown = true;
  
  // Add event listeners
  const downloadBtn = document.getElementById('updateDownloadBtn');
  const laterBtn = document.getElementById('updateLaterBtn');
  const closeBtn = document.getElementById('updateCloseBtn');
  const downloadBtnTest = document.getElementById('updateDownloadBtnTest');
  
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      markUpdateAsSeen();
      closeUpdateNotification();
    });
  }
  
  if (laterBtn) {
    laterBtn.addEventListener('click', () => {
      closeUpdateNotification();
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeUpdateNotification();
    });
  }
  
  if (downloadBtnTest) {
    downloadBtnTest.addEventListener('click', () => {
      closeUpdateNotification();
    });
  }
  
  // Auto close after 30 seconds
  setTimeout(() => {
    if (document.getElementById('updateNotification')) {
      closeUpdateNotification();
    }
  }, 30000);
}

// Close update notification
function closeUpdateNotification() {
  const notification = document.getElementById('updateNotification');
  if (notification) {
    notification.remove();
    
    // Mark as temporarily dismissed (for 24 hours)
    const dismissTime = Date.now();
    localStorage.setItem('updateDismissedAt', dismissTime.toString());
    console.log('📝 Update notification closed - dismissed until next day');
  }
}

// Mark update as seen (only when user actually downloads)
function markUpdateAsSeen() {
  localStorage.setItem('lastSeenUpdateVersion', currentVersion);
  // Clear dismiss state when user actually downloads
  localStorage.removeItem('updateDismissedAt');
  console.log('✅ Update marked as seen - won\'t show again until next version');
}

// Clear dismiss state (for testing or when new update is available)
function clearDismissState() {
  localStorage.removeItem('updateDismissedAt');
  console.log('🧹 Dismiss state cleared - notification can show again');
}

// Test function to force check updates (for debugging)
function forceCheckUpdates() {
  console.log('🔄 Force checking updates...');
  localStorage.removeItem('lastUpdateCheck'); // Clear last check time
  updateNotificationShown = false; // Reset notification state
  checkForUpdates();
}

// Test function to force show update notification (bypass all checks)
function forceShowUpdate() {
  console.log('🔄 Force showing update notification...');
  updateNotificationShown = false; // Reset notification state
  localStorage.removeItem('lastSeenUpdateVersion'); // Reset seen version
  
  showUpdateNotification({
    version: '1.1.2',
    hasUpdate: true,
    downloadUrl: 'https://drive.google.com/drive/folders/1ANeRm_g3bLI-j3JvEmlySj4-9fHfiD8U?usp=sharing',
    changelog: [
      '🚀 Cải thiện hệ thống kiểm tra update tự động',
      '💬 Thêm thông báo thông minh cho người dùng',
      '⚡ Tối ưu hóa hiệu suất xử lý Excel',
      '🎨 Sửa lỗi color suggestion',
      '📜 Thêm scroll bar cho cửa sổ',
      '✨ Cải thiện giao diện người dùng',
      '🖼️ Hỗ trợ tối đa 10 hình ảnh',
      '☁️ Tích hợp Google Drive update system',
      '🔧 Sửa lỗi hiển thị thông báo update',
      '🎯 Cải thiện trải nghiệm người dùng'
    ],
    releaseDate: '2024-01-20'
  });
}

// Test function to show update notification (for debugging)
function testUpdateNotification() {
  showUpdateNotification({
    version: '1.3.0',
    hasUpdate: true,
    downloadUrl: 'https://drive.google.com/drive/folders/1ANeRm_g3bLI-j3JvEmlySj4-9fHfiD8U?usp=sharing',
    changelog: [
      '✅ Test update notification',
      '✅ Kiểm tra hệ thống update',
      '✅ Thông báo hoạt động tốt'
    ]
  });
}

// Test function - call this from console to test
window.testUpdate = testUpdateNotification;
window.forceUpdate = forceCheckUpdates;

// Simple test function - just show notification
function testNotification() {
  console.log('🧪 Testing notification...');
  
  // Create simple notification
  const notification = document.createElement('div');
  notification.id = 'updateNotification';
  notification.innerHTML = `
    <div class="update-notification">
      <div class="update-header">
        <span class="update-icon">🔄</span>
        <span class="update-title">Test Update!</span>
        <button class="update-close" id="updateCloseBtn">×</button>
      </div>
      <div class="update-content">
        <p><strong>Test notification</strong> hoạt động!</p>
        <p>Version: 1.1.2</p>
        <div class="update-actions">
          <button class="update-btn update-download" id="updateDownloadBtnTest">
            ✅ OK
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing notification
  const existing = document.getElementById('updateNotification');
  if (existing) existing.remove();
  
  // Add to page
  document.body.appendChild(notification);
  console.log('✅ Notification added to DOM');
}

// Debug function - check everything
function debugUpdate() {
  console.log('🔍 DEBUG UPDATE SYSTEM:');
  console.log('Current version:', currentVersion);
  console.log('Update notification shown:', updateNotificationShown);
  console.log('Last check time:', localStorage.getItem('lastUpdateCheck'));
  console.log('Last seen version:', localStorage.getItem('lastSeenUpdateVersion'));
  console.log('Should show notification:', shouldShowUpdateNotification());
  
  // Check if notification exists in DOM
  const existingNotification = document.getElementById('updateNotification');
  console.log('Notification in DOM:', !!existingNotification);
  
  // Test local file
  fetch(chrome.runtime.getURL('update-info.json'))
    .then(response => {
      console.log('Local file response status:', response.status);
      return response.json();
    })
    .then(data => {
      console.log('Local update data:', data);
      console.log('Version comparison:', data.version, 'vs', currentVersion);
      console.log('Has update:', data.hasUpdate);
      console.log('Should show:', data.hasUpdate && data.version !== currentVersion);
      
      // Test if notification should show
      if (data.hasUpdate && data.version !== currentVersion) {
        console.log('✅ Should show notification - calling showUpdateNotification');
        showUpdateNotification(data, true);
      } else {
        console.log('❌ Should NOT show notification');
      }
    })
    .catch(error => {
      console.log('Error reading local file:', error);
    });
}

// Reset everything and test
function resetAndTest() {
  console.log('🔄 Resetting everything and testing...');
  
  // Clear all localStorage
  localStorage.clear();
  
  // Reset variables
  updateNotificationShown = false;
  
  // Test notification immediately
  testNotification();
  
  // Test update check
  setTimeout(() => {
    checkForUpdates();
  }, 1000);
}

// Test notification behavior
function testNotificationBehavior() {
  console.log('🧪 Testing notification behavior...');
  
  // Clear everything
  localStorage.clear();
  updateNotificationShown = false;
  
  // Show notification
  forceShowUpdate();
  
  console.log('📝 Now test:');
  console.log('1. Click "Để sau" - should show again next time');
  console.log('2. Click "Tải về ngay" - should NOT show again');
  console.log('3. Run forceCheckUpdates() to test again');
}

// Quick test functions for console
function test1() {
  console.log('🧪 Test 1: Show notification immediately');
  updateNotificationShown = false;
  forceShowUpdate();
}

function test2() {
  console.log('🧪 Test 2: Check update system');
  debugUpdate();
}

function test3() {
  console.log('🧪 Test 3: Reset everything and test');
  resetAndTest();
}

function test4() {
  console.log('🧪 Test 4: Force check updates');
  forceCheckUpdates();
}

function test5() {
  console.log('🧪 Test 5: Show simple notification');
  testNotification();
}

function test6() {
  console.log('🧪 Test 6: Force check and show update');
  updateNotificationShown = false;
  checkAndShowUpdate();
}

function test7() {
  console.log('🧪 Test 7: Check current state');
  console.log('Current version:', currentVersion);
  console.log('Update notification shown:', updateNotificationShown);
  console.log('Last seen version:', localStorage.getItem('lastSeenUpdateVersion'));
  console.log('Should show:', shouldShowUpdateNotification());
}

function test8() {
  console.log('🧪 Test 8: Clear all notifications');
  clearAllNotifications();
}

function test9() {
  console.log('🧪 Test 9: Show single notification');
  clearAllNotifications();
  forceShowUpdate();
}

function test10() {
  console.log('🧪 Test 10: Test notification buttons');
  clearAllNotifications();
  forceShowUpdate();
  
  console.log('📝 Test buttons:');
  console.log('1. Click "Tải về ngay" - should mark as seen and close');
  console.log('2. Click "Để sau" - should only close');
  console.log('3. Click "×" - should only close');
}

function test11() {
  console.log('🧪 Test 11: Test dismiss behavior');
  clearAllNotifications();
  forceShowUpdate();
  
  console.log('📝 Test steps:');
  console.log('1. Click "Để sau" - should close and set dismiss cooldown');
  console.log('2. Try to show again - should be blocked by cooldown');
  console.log('3. Run clearDismissState() to reset');
  console.log('4. Try to show again - should work now');
}

function test12() {
  console.log('🧪 Test 12: Test dismiss cooldown');
  const dismissedAt = localStorage.getItem('updateDismissedAt');
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000; // 24 hours
  
  if (dismissedAt) {
    const remaining = Math.max(0, cooldown - (now - parseInt(dismissedAt)));
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    console.log('⏰ Dismiss cooldown status:');
    console.log(`  Dismissed at: ${new Date(parseInt(dismissedAt)).toISOString()}`);
    console.log(`  Remaining: ${hours}h ${minutes}m`);
    console.log(`  Can show: ${remaining === 0 ? 'Yes' : 'No'}`);
  } else {
    console.log('✅ No dismiss cooldown active');
  }
}

// Make functions global for console access
window.test1 = test1;
window.test2 = test2;
window.test3 = test3;
window.test4 = test4;
window.test5 = test5;
window.test6 = test6;
window.test7 = test7;
window.test8 = test8;
window.test9 = test9;
window.test10 = test10;
window.test11 = test11;
window.test12 = test12;
window.forceShowUpdate = forceShowUpdate;
window.forceCheckUpdates = forceCheckUpdates;
window.checkAndShowUpdate = checkAndShowUpdate;
window.clearAllNotifications = clearAllNotifications;
window.debugUpdate = debugUpdate;
window.resetAndTest = resetAndTest;
window.testNotification = testNotification;
window.markUpdateAsSeen = markUpdateAsSeen;
window.closeUpdateNotification = closeUpdateNotification;
window.clearDismissState = clearDismissState;

// Debounce helper
function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// Update product counter display
function updateProductCounter() {
  const counterEl = $('productCounter');
  if (counterEl) {
    counterEl.textContent = `Đã ghi: ${productCount} sản phẩm`;
  }
  // Auto resize window after content change
  setTimeout(autoResizeWindow, 100);
}

// Auto resize window to fit content (disabled - using scroll instead)
function autoResizeWindow() {
  // Disabled - using scroll bar instead of auto resize
  // This function is kept for compatibility but does nothing
  return;
}

// Reset product counter and working copy
function resetProductCounter() {
  productCount = 0;
  updateProductCounter();
  
  // Reset working copy to original template
  if (parsedWorkbookOriginal && templateHeaders) {
    try {
      // Create fresh working copy from original
      // Sử dụng deep clone để giữ nguyên 100% file gốc
      parsedWorkbookWorking = JSON.parse(JSON.stringify(parsedWorkbookOriginal));
      
      // Clear data from row 5 onwards but keep formatting
      const ws = parsedWorkbookWorking.Sheets[parsedSheetName];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      
      // Clear data from row 5 onwards
      for (let r = 4; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (ws[addr]) {
            ws[addr].v = '';
          }
        }
      }
      
      // KHÔNG cập nhật range - giữ nguyên toàn bộ file để có đủ 4 hàng header
      // ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: range.s.c }, e: { r: 3, c: range.e.c } });
      
      writeCursor = 5;
      $('status').textContent = 'Đã reset - sẵn sàng ghi sản phẩm mới';
      console.log('✅ Reset working copy - ready for new products');
      
      // Cập nhật hiển thị kích thước file
      updateFileSizeDisplay();
    } catch (err) {
      console.error('❌ Failed to reset working copy:', err);
      $('status').textContent = 'Lỗi reset: ' + err.message;
    }
  }
}

// Levenshtein distance
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyFindBest(input) {
  const lower = input.toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const c of colors) {
    const s = levenshtein(lower, c.toLowerCase());
    if (s < bestScore) { bestScore = s; best = c; }
  }
  return { best, score: bestScore };
}

// Cloudinary parsing helper: expect cloudinary://api_key:api_secret@cloud_name or https style
function parseCloudinaryUri(uri) {
  if (!uri) return {};
  uri = uri.trim();
  try {
    if (uri.startsWith('cloudinary://')) {
      const without = uri.slice('cloudinary://'.length);
      const [creds, cloud] = without.split('@');
      const [api_key, api_secret] = creds.split(':');
      return { cloud_name: cloud, api_key, api_secret };
    }
    // support https://res.cloudinary.com/<cloud_name>/... style
    const m = uri.match(/res\.cloudinary\.com\/(.*?)\//);
    if (m) return { cloud_name: m[1] };
  } catch (e) {}
  return {};
}

// Persist form state to chrome.storage.local
function getFormState() {
  // Collect images for each color from UI
  collectColorImagesFromUI();

  const sizeNodes = document.querySelectorAll('.size:checked');
  const sizes = Array.from(sizeNodes).map(n => n.value);
  return {
    cloudinaryUrl: $('cloudinaryUrl') ? $('cloudinaryUrl').value.trim() : '',
    title: $('title') ? $('title').value : '',
    description: $('description') ? $('description').value : '',
    price: $('price') ? $('price').value : '',
    listPrice: $('listPrice') ? $('listPrice').value : '',
    colorInput: $('colorInput') ? $('colorInput').value : '',
    colorSource: $('colorSource') ? $('colorSource').value : '',
    sizes,
    selectedColors,
    colorImages, // Lưu images theo từng color
    shippingTemplate: $('shippingTemplate') ? $('shippingTemplate').value : ''
  };
}

// Thu thập images từ UI cho từng color
function collectColorImagesFromUI() {
  // Lưu images của active color trước
  collectActiveColorImages();
}

const saveFormState = debounce(() => {
  if (!chrome || !chrome.storage) return;
  const state = getFormState();
  chrome.storage.local.set({ temuFormState: state });
}, 300);

function restoreFormState() {
  if (!chrome || !chrome.storage) return;
  chrome.storage.local.get(['temuFormState'], function(res) {
    const s = res.temuFormState;
    if (!s) return;
    if ($('cloudinaryUrl')) $('cloudinaryUrl').value = s.cloudinaryUrl || '';
    if ($('title')) $('title').value = s.title || '';
    if ($('description')) $('description').value = s.description || '';
    if ($('price')) $('price').value = s.price || '';
    if ($('listPrice')) $('listPrice').value = s.listPrice || '';
    if ($('colorInput')) $('colorInput').value = s.colorInput || '';
    if ($('colorSource')) $('colorSource').value = s.colorSource || '';
    if ($('shippingTemplate')) $('shippingTemplate').value = s.shippingTemplate || '';

    // restore sizes
    if (s.sizes && s.sizes.length) {
      const checkboxes = document.querySelectorAll('.size');
      checkboxes.forEach(cb => { cb.checked = s.sizes.includes(cb.value); });
    }

    // restore selected colors and their images
    if (s.selectedColors && s.selectedColors.length) {
      selectedColors = s.selectedColors.slice();
      colorImages = s.colorImages || {};
      activeColor = selectedColors[0] || null;
      renderColorTabs();
    }

    loadColorsFromTextarea();
  });
}

function createImageField(index) {
  const div = document.createElement('div');
  div.className = 'image-field drop-zone';
  div.innerHTML = `<input placeholder="Image URL ${index + 1} (hoặc kéo thả hình ảnh từ web)" class="image-url" /><select class="image-type"><option value="main">main</option><option value="alt">alt</option></select>`;
  
  // Add drag & drop event listeners
  setupImageFieldDragDrop(div, index);
  
  return div;
}

// Setup drag & drop for image field
function setupImageFieldDragDrop(fieldElement, index) {
  const input = fieldElement.querySelector('.image-url');
  
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    fieldElement.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  // Highlight drop zone when dragging over
  ['dragenter', 'dragover'].forEach(eventName => {
    fieldElement.addEventListener(eventName, () => {
      fieldElement.classList.add('drag-over');
    }, false);
  });
  
  // Remove highlight when leaving
  ['dragleave', 'drop'].forEach(eventName => {
    fieldElement.addEventListener(eventName, () => {
      fieldElement.classList.remove('drag-over');
    }, false);
  });
  
  // Handle drop
  fieldElement.addEventListener('drop', (e) => {
    handleImageDrop(e, input, fieldElement);
  }, false);
  
  // Also handle paste for image URLs
  input.addEventListener('paste', (e) => {
    // Allow normal paste, but we can enhance it if needed
  });
}

// Extract image URL from drag event (synchronous version)
// Priority: HTML src > text/plain > uri-list > blob URL (as last resort)
function extractImageUrlFromDragEvent(e) {
  const dataTransfer = e.dataTransfer;
  
  // Try to get URL from different sources
  let imageUrl = null;
  let blobUrl = null; // Store blob URL separately to use only if no real URL found
  
  // Method 1: Get from HTML FIRST (when dragging image from web page) - HIGHEST PRIORITY
  // This usually contains the original src URL
  try {
    const htmlData = dataTransfer.getData('text/html');
    if (htmlData) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlData, 'text/html');
      const img = doc.querySelector('img');
      if (img) {
        // Try to get original src first
        const originalSrc = img.getAttribute('src') || img.src;
        if (originalSrc) {
          // Check if it's a real URL (not blob)
          if (originalSrc.startsWith('http://') || originalSrc.startsWith('https://')) {
            imageUrl = originalSrc;
            console.log('🖼️ Found original image URL in HTML src:', imageUrl);
          } else if (originalSrc.startsWith('blob:') || originalSrc.startsWith('data:')) {
            // Store blob URL but continue searching for real URL
            blobUrl = originalSrc;
            console.log('📎 Found blob URL in HTML, continuing search for real URL...');
          }
        }
        
        // Also check for data-src or other attributes that might contain original URL
        if (!imageUrl) {
          const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
          if (dataSrc && (dataSrc.startsWith('http://') || dataSrc.startsWith('https://'))) {
            imageUrl = dataSrc;
            console.log('🖼️ Found original image URL in data attribute:', imageUrl);
          }
        }
      }
    }
  } catch (err) {
    console.log('Could not get text/html:', err);
  }
  
  // Method 2: Direct URL in text/plain (second priority)
  if (!imageUrl) {
    try {
      const textData = dataTransfer.getData('text/plain');
      if (textData) {
        const trimmed = textData.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          imageUrl = trimmed;
          console.log('📋 Found URL in text/plain:', imageUrl);
        } else if ((trimmed.startsWith('blob:') || trimmed.startsWith('data:')) && !blobUrl) {
          blobUrl = trimmed;
        }
      }
    } catch (err) {
      console.log('Could not get text/plain:', err);
    }
  }
  
  // Method 3: Get from URL (when dragging link)
  if (!imageUrl) {
    try {
      const urlData = dataTransfer.getData('text/uri-list');
      if (urlData) {
        const trimmed = urlData.split('\n')[0].trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          imageUrl = trimmed;
          console.log('🔗 Found URL in uri-list:', imageUrl);
        } else if ((trimmed.startsWith('blob:') || trimmed.startsWith('data:')) && !blobUrl) {
          blobUrl = trimmed;
        }
      }
    } catch (err) {
      console.log('Could not get uri-list:', err);
    }
  }
  
  // Method 4: Check for image files (local files) - only if no URL found
  if (!imageUrl && dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.type.startsWith('image/')) {
        // Create object URL for local file
        imageUrl = URL.createObjectURL(file);
        console.log('📎 Dropped local image file:', file.name, '->', imageUrl);
        break;
      }
    }
  }
  
  // If we only found blob URL and no real URL, try to extract from blob URL
  // Note: blob URLs from extensions can't be converted back to original URL
  // So we'll use blob URL as last resort but warn user
  if (!imageUrl && blobUrl) {
    console.warn('⚠️ Only blob URL found, original URL not available. User should right-click image and copy image address instead.');
    // Don't use blob URL - it won't work for upload
    // Return null so user gets helpful error message
    return null;
  }
  
  return imageUrl;
}

// Handle image drop event
function handleImageDrop(e, inputElement, fieldElement) {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('🖼️ Image drop detected');
  
  try {
    const imageUrl = extractImageUrlFromDragEvent(e);
    
    if (imageUrl) {
      // Clean up the URL (remove query params if needed, or keep as is)
      let cleanUrl = imageUrl.trim();
      
      // Reject blob URLs from extensions (they won't work for upload)
      if (cleanUrl.startsWith('blob:chrome-extension://') || cleanUrl.startsWith('blob:chrome://')) {
        console.warn('⚠️ Blob URL from extension detected - cannot use for upload');
        throw new Error('Không thể sử dụng blob URL từ extension. Vui lòng:\n1. Click chuột phải vào hình ảnh\n2. Chọn "Copy image address"\n3. Paste URL vào ô này');
      }
      
      // Handle local file blob URLs (from file system)
      if (cleanUrl.startsWith('blob:') && !cleanUrl.includes('chrome-extension://') && !cleanUrl.includes('chrome://')) {
        console.log('📎 Local file blob URL detected');
        // For local file blob URLs, we can use them but warn user
        inputElement.value = cleanUrl;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        saveFormState();
        
        // Show success feedback
        fieldElement.classList.add('drop-success');
        setTimeout(() => {
          fieldElement.classList.remove('drop-success');
        }, 1000);
        
        const status = $('status');
        if (status) {
          status.textContent = '✅ Đã thêm blob URL (file local). Lưu ý: blob URL chỉ hoạt động trong session hiện tại.';
        }
        
        console.log('✅ Image blob URL set from drop:', cleanUrl);
        return;
      }
      
      // Handle data URLs
      if (cleanUrl.startsWith('data:')) {
        console.log('📎 Data URL detected');
        inputElement.value = cleanUrl;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        saveFormState();
        
        fieldElement.classList.add('drop-success');
        setTimeout(() => {
          fieldElement.classList.remove('drop-success');
        }, 1000);
        
        console.log('✅ Image data URL set from drop:', cleanUrl);
        return;
      }
      
      // For web URLs, validate and set
      if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        inputElement.value = cleanUrl;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        saveFormState();
        
        // Show success feedback
        fieldElement.classList.add('drop-success');
        setTimeout(() => {
          fieldElement.classList.remove('drop-success');
        }, 1000);
        
        // Show status message
        const status = $('status');
        if (status) {
          status.textContent = `✅ Đã thêm URL hình ảnh từ drag & drop`;
          setTimeout(() => {
            if (status.textContent.includes('drag & drop')) {
              status.textContent = '';
            }
          }, 2000);
        }
        
        console.log('✅ Image URL set from drop:', cleanUrl);
      } else {
        throw new Error('URL không hợp lệ');
      }
    } else {
      // Try to get image from clipboard or other sources
      console.log('⚠️ Could not extract image URL from drag event');
      console.log('Available data types:', Array.from(e.dataTransfer.types));
      
      // Show error feedback
      fieldElement.classList.add('drop-error');
      setTimeout(() => {
        fieldElement.classList.remove('drop-error');
      }, 1000);
      
      const status = $('status');
      if (status) {
        status.textContent = '⚠️ Không thể lấy URL hình ảnh gốc. Vui lòng:\n1. Click chuột phải vào hình ảnh\n2. Chọn "Copy image address" (Sao chép địa chỉ hình ảnh)\n3. Paste URL vào ô này';
      }
    }
  } catch (err) {
    console.error('❌ Error handling image drop:', err);
    fieldElement.classList.add('drop-error');
    setTimeout(() => {
      fieldElement.classList.remove('drop-error');
    }, 1000);
    
    const status = $('status');
    if (status) {
      status.textContent = '❌ Lỗi khi xử lý drag & drop: ' + err.message;
    }
  }
}

function renderImageFields(n) {
  const container = $('imagesContainer');
  
  // Save current values before clearing
  const currentValues = [];
  const currentTypes = [];
  const existingInputs = container.querySelectorAll('.image-url');
  const existingSelects = container.querySelectorAll('.image-type');
  
  existingInputs.forEach((input, index) => {
    currentValues[index] = input.value;
  });
  existingSelects.forEach((select, index) => {
    currentTypes[index] = select.value;
  });
  
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const field = createImageField(i);
    container.appendChild(field);
    
    // Restore saved values
    const input = field.querySelector('.image-url');
    const select = field.querySelector('.image-type');
    
    if (currentValues[i]) {
      input.value = currentValues[i];
    }
    if (currentTypes[i]) {
      select.value = currentTypes[i];
    } else {
      // Set default: first image = "main", others = "alt"
      select.value = i === 0 ? 'main' : 'alt';
    }
    
    // Ensure first image is always "main" if no previous value
    if (i === 0 && !currentTypes[i]) {
      select.value = 'main';
    }
    
    // Note: Drag & drop is already set up in createImageField via setupImageFieldDragDrop
  }
  
  // attach input listeners to new fields to persist
  const inputs = document.querySelectorAll('.image-url');
  inputs.forEach(inp => inp.addEventListener('input', saveFormState));
  
  // Auto resize window after content change
  setTimeout(autoResizeWindow, 100);
}

function addImageFieldIfPossible() {
  const cur = document.querySelectorAll('.image-url').length;
  if (cur < MAX_IMAGES) renderImageFields(cur + 1);
}

function removeLastImageField() {
  const cur = document.querySelectorAll('.image-url').length;
  if (cur > 1) {
    // Save current values before removing
    const container = $('imagesContainer');
    const currentValues = [];
    const currentTypes = [];
    const existingInputs = container.querySelectorAll('.image-url');
    const existingSelects = container.querySelectorAll('.image-type');
    
    existingInputs.forEach((input, index) => {
      currentValues[index] = input.value;
    });
    existingSelects.forEach((select, index) => {
      currentTypes[index] = select.value;
    });
    
    // Remove last field
    const newCount = cur - 1;
    container.innerHTML = '';
    for (let i = 0; i < newCount; i++) {
      const field = createImageField(i);
      container.appendChild(field);
      
      // Restore saved values (except the last one)
      const input = field.querySelector('.image-url');
      const select = field.querySelector('.image-type');
      
      if (currentValues[i]) {
        input.value = currentValues[i];
      }
      if (currentTypes[i]) {
        select.value = currentTypes[i];
      } else {
        // Set default: first image = "main", others = "alt"
        select.value = i === 0 ? 'main' : 'alt';
      }
      
      // Ensure first image is always "main" if no previous value
      if (i === 0 && !currentTypes[i]) {
        select.value = 'main';
      }
    }
    
    // attach input listeners to new fields to persist
    const inputs = document.querySelectorAll('.image-url');
    inputs.forEach(inp => inp.addEventListener('input', saveFormState));
  }
}

function loadColorsFromTextarea() {
  const sourceArea = $('colorSource');
  if (sourceArea && sourceArea.value.trim()) {
    const src = sourceArea.value.split('\n').map(s => s.trim()).filter(Boolean);
    colors = src;
  }
  const dl = $('colorList');
  if (!dl) return;
  dl.innerHTML = '';
  for (const c of colors) {
    const opt = document.createElement('option');
    opt.value = c;
    dl.appendChild(opt);
  }
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function suggestColorSimple(input) {
  if (!input || !colors.length) {
    console.log('❌ No input or colors array empty:', { input, colorsLength: colors.length });
    return [];
  }
  
  input = input.toLowerCase().trim();
  console.log(`🔍 Color input: "${input}", searching in ${colors.length} colors`);
  console.log('📋 Available colors:', colors.slice(0, 5)); // Show first 5 colors
  
  // 1. Exact match
  const exactMatch = colors.filter(c => c.toLowerCase() === input);
  if (exactMatch.length) {
    console.log('✅ Exact match:', exactMatch);
    return exactMatch.slice(0, 8);
  }
  
  // 2. Starts with (case insensitive)
  const startsWith = colors.filter(c => c.toLowerCase().startsWith(input));
  if (startsWith.length) {
    console.log('✅ Starts with:', startsWith);
    return startsWith.slice(0, 8);
  }
  
  // 3. Contains (case insensitive)
  const contains = colors.filter(c => c.toLowerCase().includes(input));
  if (contains.length) {
    console.log('✅ Contains:', contains);
    return contains.slice(0, 8);
  }
  
  // 4. Word boundary matching (matches "Bl" with "Black")
  const wordBoundary = colors.filter(c => {
    const words = c.toLowerCase().split(/\s+/);
    return words.some(word => word.startsWith(input));
  });
  if (wordBoundary.length) {
    console.log('✅ Word boundary:', wordBoundary);
    return wordBoundary.slice(0, 8);
  }
  
  // 5. Fuzzy matching (Levenshtein distance ≤ 2)
  const fuzzyMatches = colors
    .map(c => ({ color: c, distance: levenshtein(input, c.toLowerCase()) }))
    .filter(item => item.distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .map(item => item.color);
    
  if (fuzzyMatches.length) {
    console.log('✅ Fuzzy matches:', fuzzyMatches);
    return fuzzyMatches.slice(0, 8);
  }
  
  console.log('❌ No color suggestions found');
  return [];
}

function renderSelectedColors() {
  renderColorTabs();
}

// Render color tabs
function renderColorTabs() {
  const tabsContainer = $('colorTabs');
  const imagesSection = $('colorImagesSection');

  if (!tabsContainer) return;

  tabsContainer.innerHTML = '';

  if (selectedColors.length === 0) {
    if (imagesSection) imagesSection.style.display = 'none';
    activeColor = null;
    return;
  }

  // Nếu chưa có activeColor hoặc activeColor không còn trong danh sách
  if (!activeColor || !selectedColors.includes(activeColor)) {
    activeColor = selectedColors[0];
  }

  // Render tabs
  selectedColors.forEach((color, idx) => {
    const imgs = colorImages[color] || [];
    const filledCount = imgs.filter(u => u && u.trim()).length;

    const tab = document.createElement('div');
    tab.className = 'color-tab' + (color === activeColor ? ' active' : '');
    tab.innerHTML = `
      <span class="tab-name">${color}</span>
      <span class="tab-count">${filledCount}</span>
      <button class="tab-remove" data-idx="${idx}" title="Xóa màu">×</button>
    `;

    // Click để chọn tab
    tab.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-remove')) {
        setActiveColor(color);
      }
    });

    // Xóa màu
    tab.querySelector('.tab-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeColor(idx);
    });

    tabsContainer.appendChild(tab);
  });

  // Hiển thị images section và render images cho active color
  if (imagesSection) imagesSection.style.display = 'block';
  renderActiveColorImages();
}

// Set active color và render images
function setActiveColor(color) {
  // Lưu images của color cũ trước khi chuyển
  if (activeColor) {
    collectActiveColorImages();
  }

  activeColor = color;
  renderColorTabs();
}

// Render images cho active color
function renderActiveColorImages() {
  const container = $('colorImagesContainer');
  const activeColorName = $('activeColorName');
  const imageCountBadge = $('imageCountBadge');

  if (!container || !activeColor) return;

  // Update header
  if (activeColorName) activeColorName.textContent = activeColor;

  const images = colorImages[activeColor] || [];
  const imageCount = Math.max(images.length, DEFAULT_IMAGES_PER_COLOR);
  const filledCount = images.filter(u => u && u.trim()).length;

  if (imageCountBadge) imageCountBadge.textContent = `${filledCount}/${imageCount}`;

  // Render image fields
  container.innerHTML = '';

  for (let i = 0; i < imageCount; i++) {
    const field = document.createElement('div');
    field.className = 'color-image-field';
    field.innerHTML = `
      <span class="image-number">${i + 1}</span>
      <input type="text" class="color-image-input"
             placeholder="Image URL ${i + 1}"
             value="${images[i] || ''}"
             data-index="${i}" />
    `;
    container.appendChild(field);

    const input = field.querySelector('input');
    input.addEventListener('input', () => {
      updateImageCount();
      saveFormState();
    });
    input.addEventListener('change', () => saveFormState());

    // Drag & drop
    setupColorImageDragDrop(field, activeColor, i);
  }
}

// Update image count badge
function updateImageCount() {
  const imageCountBadge = $('imageCountBadge');
  if (!imageCountBadge || !activeColor) return;

  collectActiveColorImages();
  const images = colorImages[activeColor] || [];
  const filledCount = images.filter(u => u && u.trim()).length;
  const totalCount = Math.max(images.length, DEFAULT_IMAGES_PER_COLOR);
  imageCountBadge.textContent = `${filledCount}/${totalCount}`;

  // Update tab count too
  renderColorTabs();
}

// Collect images từ active color inputs
function collectActiveColorImages() {
  if (!activeColor) return;

  const inputs = document.querySelectorAll('#colorImagesContainer .color-image-input');
  const images = Array.from(inputs).map(input => input.value.trim());
  colorImages[activeColor] = images;
}

// Setup drag & drop cho color image field
function setupColorImageDragDrop(fieldElement, color, index) {
  const input = fieldElement.querySelector('.color-image-input');

  fieldElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    fieldElement.classList.add('drag-over');
  });

  fieldElement.addEventListener('dragleave', (e) => {
    e.preventDefault();
    fieldElement.classList.remove('drag-over');
  });

  fieldElement.addEventListener('drop', (e) => {
    e.preventDefault();
    fieldElement.classList.remove('drag-over');

    const imageUrl = extractImageUrlFromDragEvent(e);
    if (imageUrl) {
      input.value = imageUrl;
      fieldElement.classList.add('drop-success');
      setTimeout(() => fieldElement.classList.remove('drop-success'), 500);
      saveFormState();
    } else {
      fieldElement.classList.add('drop-error');
      setTimeout(() => fieldElement.classList.remove('drop-error'), 500);
    }
  });
}

// Thêm image field cho active color
function addImageToColor(color) {
  const targetColor = color || activeColor;
  if (!targetColor) return;

  collectActiveColorImages(); // Lưu data hiện tại

  if (!colorImages[targetColor]) colorImages[targetColor] = [];
  if (colorImages[targetColor].length >= MAX_IMAGES) {
    $('status').textContent = `Tối đa ${MAX_IMAGES} ảnh cho mỗi màu`;
    return;
  }
  colorImages[targetColor].push('');
  renderActiveColorImages();
  saveFormState();
}

// Xóa image field cuối của active color
function removeImageFromColor(color) {
  const targetColor = color || activeColor;
  if (!targetColor) return;

  collectActiveColorImages(); // Lưu data hiện tại

  if (!colorImages[targetColor] || colorImages[targetColor].length <= 1) {
    $('status').textContent = 'Cần ít nhất 1 ảnh cho mỗi màu';
    return;
  }
  colorImages[targetColor].pop();
  renderActiveColorImages();
  saveFormState();
}

// Xóa color
function removeColor(idx) {
  collectActiveColorImages(); // Lưu data trước khi xóa

  const color = selectedColors[idx];
  selectedColors.splice(idx, 1);
  delete colorImages[color];

  // Reset activeColor nếu cần
  if (activeColor === color) {
    activeColor = selectedColors.length > 0 ? selectedColors[0] : null;
  }

  renderColorTabs();
  saveFormState();
}

function addColorToSelected() {
  const v = ($('colorInput').value || '').trim();
  if (!v) return;

  // Lưu images của color hiện tại trước khi thêm color mới
  collectActiveColorImages();

  console.log('🎨 Adding color:', v);
  console.log('📋 Available colors:', colors);

  // Use suggestColorSimple for better matching
  const suggestions = suggestColorSimple(v);
  console.log('💡 Suggestions:', suggestions);

  if (suggestions.length === 0) {
    // Fallback: check if it's a common color
    const commonColors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Gray'];
    const found = commonColors.find(c => c.toLowerCase() === v.toLowerCase());
    if (found) {
      console.log('✅ Found in common colors:', found);
      if (!selectedColors.includes(found)) {
        selectedColors.push(found);
        colorImages[found] = new Array(DEFAULT_IMAGES_PER_COLOR).fill('');
        activeColor = found; // Set màu mới làm active
      }
      renderColorTabs();
      saveFormState();
      $('status').textContent = `Added color: ${found}`;
      $('colorInput').value = '';
      return;
    }
    alert('Màu không thể fulfill - không có trong danh sách');
    return;
  }

  // Use the best suggestion (first one)
  const best = suggestions[0];
  if (!selectedColors.includes(best)) {
    selectedColors.push(best);
    colorImages[best] = new Array(DEFAULT_IMAGES_PER_COLOR).fill('');
    activeColor = best; // Set màu mới làm active
  }
  renderColorTabs();
  saveFormState();
  $('status').textContent = `Added color: ${best}`;
  $('colorInput').value = ''; // Clear input
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Function kiểm tra kích thước file Excel
function getExcelFileSize() {
  if (!parsedWorkbookWorking) return 0;
  
  try {
    // Tạo workbook binary để tính kích thước
    const wbout = XLSX.write(parsedWorkbookWorking, { 
      bookType: 'xlsx', 
      type: 'array',
      compression: true
    });
    
    // Tính kích thước bằng byte
    const sizeInBytes = wbout.byteLength;
    return sizeInBytes;
  } catch (error) {
    console.error('Error calculating file size:', error);
    return 0;
  }
}



async function fetchImageAsBlob(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch image: ' + resp.status);
  return await resp.blob();
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// Temu fixed size
const TEMU_W = 1340;
const TEMU_H = 1785;

async function resizeImageBlobToBlob(blob) {
  const img = await blobToImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = TEMU_W;
  canvas.height = TEMU_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  const sw = img.width, sh = img.height;
  const scale = Math.max(TEMU_W / sw, TEMU_H / sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const dx = Math.round((TEMU_W - dw) / 2);
  const dy = Math.round((TEMU_H - dh) / 2);
  ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

async function uploadBlobToCloudinary(blob, cloudName) {
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const fd = new FormData();
  fd.append('file', blob, 'image.jpg');
  // try signing client-side if cloudinary URL includes api_key and api_secret
  try {
    const cloudUri = ($('cloudinaryUrl') && $('cloudinaryUrl').value) || '';
    const creds = parseCloudinaryUri(cloudUri);
    if (creds && creds.api_key && creds.api_secret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const toSign = `timestamp=${timestamp}${creds.api_secret}`;
      // compute sha1 hex
      const sig = await (async function sha1Hex(str) {
        const enc = new TextEncoder();
        const data = enc.encode(str);
        const hash = await crypto.subtle.digest('SHA-1', data);
        const arr = Array.from(new Uint8Array(hash));
        return arr.map(b => b.toString(16).padStart(2, '0')).join('');
      })(toSign);
      fd.append('api_key', creds.api_key);
      fd.append('timestamp', String(timestamp));
      fd.append('signature', sig);
    }
  } catch (e) {
    // ignore signing errors; fallback to unsigned attempt
    console.warn('Signing failed', e);
  }
  const resp = await fetch(url, { method: 'POST', body: fd });
  if (!resp.ok) {
    // try to read JSON error body for more detail
    let bodyText;
    try {
      bodyText = await resp.text();
    } catch (e) {
      bodyText = '<no body>';
    }
    throw new Error('Upload failed: ' + resp.status + ' - ' + bodyText);
  }
  return await resp.json();
}

async function processImageUrl(url, cloudName, statusEl) {
  const blob = await fetchImageAsBlob(url);
  const resized = await resizeImageBlobToBlob(blob);
  statusEl.textContent = 'Uploading...';
  const uploadRes = await uploadBlobToCloudinary(resized, cloudName);
  return uploadRes.secure_url || uploadRes.url;
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = lines.map(l => l.split(','));
  return rows;
}

function downloadCsv(filename, rows) {
  const lines = rows.map(r => r.map(csvEscape).join(','));
  const csv = lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadArrayBufferAsFile(arrayBuffer, filename, mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const blob = new Blob([arrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function base64ToArrayBuffer(base64) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function writeWorkbookAndDownload(wb, filename) {
  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX library not loaded yet, please wait...');
    }
    
    // === Xóa datamask từ hàng 5 trở đi để file nhẹ nhất ===
    try {
      const ws = parsedWorkbookWorking.Sheets[parsedSheetName];
      removeDatamaskFromRow5(ws);
      console.log('✅ Removed datamask from row 5+ for lightweight file');
    } catch (e) {
      console.warn('⚠️ Datamask removal skipped:', e);
    }
    
    // 1. Xuất ra binary string (cách ổn định nhất)
    console.log('Writing workbook:', wb);
    const wbout = XLSX.write(wb, { 
      bookType: "xlsx", 
      type: "binary",
      compression: true,
      bookSST: true
    });
    console.log('Binary output length:', wbout.length);
    
    // Check ZIP signature
    const zipSig = wbout.charCodeAt(0) === 0x50 && wbout.charCodeAt(1) === 0x4B;
    console.log('ZIP signature check:', zipSig, 'First 4 bytes:', Array.from(wbout.slice(0, 4)).map(c => '0x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));

    // 1.5. Round-trip verify: đọc lại ngay để bắt lỗi sớm
    try { 
      const verify = XLSX.read(wbout, { type: "binary" });
      console.log('Round-trip verification passed:', verify);
    }
    catch (e) { 
      console.error('Round-trip verification failed:', e);
      throw new Error("Workbook invalid before save: " + e.message); 
    }
    
    // 2. Convert binary string to Uint8Array
    const bytes = new Uint8Array(wbout.length);
    for (let i = 0; i < wbout.length; i++) {
      bytes[i] = wbout.charCodeAt(i) & 0xFF;
    }
    
    // 3. Tạo Blob với MIME chính xác
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    
    // 3. Lưu file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
      console.log('✅ Excel file download initiated successfully');
      
      // Cập nhật hiển thị kích thước file sau khi export
      updateFileSizeDisplay();
      
  } catch (error) {
    console.error('❌ Excel write error:', error);
    throw new Error('Failed to generate Excel file: ' + error.message);
  }
}

// Build rows for workbook or CSV according to templateHeaders mapping
// uploadedByColor: { colorName: [url1, url2, ...], ... } - mỗi màu có bộ URL riêng
function buildRowsForProduct(uploadedByColor) {
  console.log('🔍 DEBUG - buildRowsForProduct called with uploadedByColor:', uploadedByColor);

  const title = ($('title').value || '').trim();
  const description = ($('description').value || '').trim();
  const price = ($('price').value || '').trim();
  const listPrice = ($('listPrice').value || '').trim();
  const shipping = ($('shippingTemplate').value || '').trim();
  const sizeNodes = document.querySelectorAll('.size:checked');
  const sizesSelected = Array.from(sizeNodes).map(n => n.value);

  // Lấy danh sách colors từ uploadedByColor
  const colorsToUse = Object.keys(uploadedByColor).length ? Object.keys(uploadedByColor) : [''];

  function random9() { return String(Math.floor(100000000 + Math.random() * 900000000)); }
  const contributionGoods = random9();
  let skuSeq = 1;
  
  // Helper function to find header index
  function findHeaderIndex(possibleNames) {
    if (!templateHeaders || !Array.isArray(templateHeaders)) return -1;
    const low = templateHeaders.map(h => (h || '').toString().toLowerCase());
    for (let i = 0; i < low.length; i++) {
      for (const name of possibleNames) {
        const n = name.toLowerCase();
        if (low[i] === n || (low[i] && low[i].includes(n))) {
          return i;
        }
      }
    }
    return -1;
  }

  // Helper function to find size column
  function findSizeColumn(headers) {
    if (!headers) return -1;
    
    // Đọc đúng cột 212 (HE) - 0-based index
    let sizeIdx = 211; // Cột HE
    
    console.log(`✅ Size column: ${sizeIdx} - "${headers[sizeIdx]}"`);
    return sizeIdx;
  }

  console.log('🔍 DEBUG - Current state:');
  console.log('  templateHeaders length:', templateHeaders ? templateHeaders.length : 'undefined');
  console.log('  templateHeaders:', templateHeaders);
  console.log('  templateSampleRows length:', templateSampleRows ? templateSampleRows.length : 'undefined');
  console.log('  parsedWorkbookWorking:', !!parsedWorkbookWorking);
  console.log('  parsedWorkbookOriginal:', !!parsedWorkbookOriginal);
  console.log('  sizesSelected:', sizesSelected, 'count:', sizesSelected.length);
  console.log('  sizesSelected types:', sizesSelected.map(s => ({ value: s, type: typeof s, length: s.length })));
  console.log('  colorsToUse:', colorsToUse, 'count:', colorsToUse.length);
  console.log('  Expected rows:', sizesSelected.length * colorsToUse.length);

  // Safety check: ensure templateHeaders is defined
  if (!templateHeaders || !Array.isArray(templateHeaders)) {
    console.warn('❌ templateHeaders not properly initialized, using fallback');
    templateHeaders = [];
  }

  // Clone từ template: Tìm hàng mẫu có size tương ứng và clone nguyên
  console.log('🔍 Checking template data:', {
    templateSampleRows: !!templateSampleRows,
    templateSampleRowsLength: templateSampleRows ? templateSampleRows.length : 0,
    parsedWorkbookOriginal: !!parsedWorkbookOriginal
  });
  
  console.log('🔍 CHECKING CONDITIONS:', {
    templateSampleRows: !!templateSampleRows,
    templateSampleRowsLength: templateSampleRows ? templateSampleRows.length : 0,
    parsedWorkbookOriginal: !!parsedWorkbookOriginal,
    willEnterMainLogic: !!(templateSampleRows && templateSampleRows.length && parsedWorkbookOriginal)
  });

  if (templateSampleRows && templateSampleRows.length && parsedWorkbookOriginal) {
    console.log('✅ ENTERING MAIN CLONE LOGIC');
  } else {
    console.warn('⚠️ Missing required data:', {
      templateSampleRows: !!templateSampleRows,
      templateSampleRowsLength: templateSampleRows ? templateSampleRows.length : 0,
      parsedWorkbookOriginal: !!parsedWorkbookOriginal
    });
    
    // Fallback: Tạo sample row trống nếu không có
    if (!templateSampleRows || templateSampleRows.length === 0) {
      console.log('🔧 Creating fallback empty sample row...');
      templateSampleRows = [new Array(templateHeaders.length).fill('')];
      templateSampleRowIndices = [5]; // Hàng 5
    }
  }

  if (templateSampleRows && templateSampleRows.length && parsedWorkbookOriginal) {
    console.log('✅ ENTERING MAIN CLONE LOGIC');
    
    // Debug: Hiển thị tất cả headers để kiểm tra
    console.log('🔍 DEBUG - All template headers:', templateHeaders.map((h, i) => `${i}: "${h}"`));
    
       // Tìm cột size bằng function findSizeColumn
       const sizeIdx = findSizeColumn(templateHeaders);
       console.log(`✅ Final size column: ${sizeIdx} - "${templateHeaders[sizeIdx]}"`);
    
    if (sizeIdx === -1) {
      console.error('❌ No size column found!');
      return 0;
    }
    console.log('🔍 DEBUG - All sizes found in template:');
    const allSizes = new Set();
    templateSampleRows.forEach((row, i) => {
      const sizeValue = (row[sizeIdx] || '').toString().trim();
      console.log(`  Row ${i + 5}: size="${sizeValue}", sizeIdx=${sizeIdx}, row[${sizeIdx}]=${row[sizeIdx]}`);
      if (sizeValue) {
        allSizes.add(sizeValue);
      }
    });
    console.log('🔍 DEBUG - Unique sizes in template:', Array.from(allSizes));
    console.log('🔍 DEBUG - Total rows with data:', templateSampleRows.length);
    console.log('🔍 DEBUG - Rows with non-empty size:', Array.from(allSizes).length);
    
    console.log('🔍 First 10 template rows with size info:', templateSampleRows.slice(0, 10).map((row, i) => ({
      index: i + 5,
      size: row[sizeIdx],
      fullRow: row.slice(0, 8)
    })));
    
    for (const color of colorsToUse) {
      for (const selectedSize of sizesSelected) {
        console.log(`🔍 Looking for size "${selectedSize}" in template...`);
        
        // 1. Tìm hàng mẫu có size tương ứng trong template
        let sampleRowIndex = null;
        let foundRow = null;
        
        // Function canonSize và sizesEqual
        function canonSize(v) {
          if (v == null) return '';
          let s = String(v).trim().toUpperCase().replace(/[\s.\-_/]+/g,'');
          // 2XL -> XXL, 3XL -> XXXL...
          const m = s.match(/^(\d+)XL$/);
          if (m) return 'X'.repeat(parseInt(m[1],10)) + 'L';
          if (s === 'ONESIZE' || s === 'OSFA') return 'OS';
          return s;
        }

        function sizesEqual(a, b) {
          const A = canonSize(a), B = canonSize(b);
          if (!A || !B) return false;
          if (A === B) return true;
          const EQUIV = [
            ['XS'], ['S'], ['M'], ['L'], ['XL'],
            ['XXL','2XL'], ['XXXL','3XL'], ['XXXXL','4XL'], ['OS']
          ];
          return EQUIV.some(g => g.includes(A) && g.includes(B));
        }
        
        console.log(`🔍 Looking for size "${selectedSize}" in template...`);
        console.log(`🔍 DEBUG - sizeIdx: ${sizeIdx}, templateHeaders[${sizeIdx}]: "${templateHeaders[sizeIdx]}"`);
        
        // Debug: Hiển thị tất cả size trong template
        console.log('🔍 DEBUG - All sizes in template:');
        for (let i = 0; i < Math.min(templateSampleRows.length, 15); i++) {
          const row = templateSampleRows[i];
          const sizeValue = (row[sizeIdx] || '').toString().trim();
          const canonValue = canonSize(sizeValue);
          console.log(`  Row ${i + 5}: size="${sizeValue}" -> canon="${canonValue}"`);
        }
        
        // Tìm size bằng canonSize và sizesEqual
        const target = canonSize(selectedSize);
        console.log(`🔍 Looking for canon size: "${target}"`);
        
        for (let si = 0; si < templateSampleRows.length; si++) {
          const rowVal = templateSampleRows[si][sizeIdx];
          const canonRowVal = canonSize(rowVal);
          const isEqual = sizesEqual(rowVal, target);
          
          console.log(`  Row ${si}: "${rowVal}" -> canon="${canonRowVal}", equal=${isEqual}`);
          
          if (isEqual) {
            sampleRowIndex = templateSampleRowIndices[si];
            foundRow = templateSampleRows[si];
            console.log(`✅ Found matching row at index ${si} for size "${selectedSize}" (canon: "${target}"), sampleRowIndex=${sampleRowIndex}`);
            break;
          }
        }
        
        if (!sampleRowIndex) {
          console.warn(`❌ No template row found for size "${selectedSize}"`);
          console.log('Available sizes:', templateSampleRows.map(row => row[sizeIdx]));
          console.log(`🔍 DEBUG - Looking for size "${selectedSize}" in template...`);
          console.log(`🔍 DEBUG - sizeIdx: ${sizeIdx}`);
          console.log(`🔍 DEBUG - templateSampleRows length: ${templateSampleRows.length}`);
          
          // KHÔNG tạo fallback row - báo lỗi và skip
          console.log(`❌ SKIPPING size "${selectedSize}" - not found in template`);
          continue;
        }
        
        // 2. Clone nguyên hàng size tương ứng + mapping
        const srcRowIndex = sampleRowIndex - 1; // Convert to 0-based
        const wsOrig = parsedWorkbookOriginal.Sheets[parsedSheetName];
        const wsDest = parsedWorkbookWorking.Sheets[parsedSheetName];
        const destRowIndex = writeCursor - 1; // 0-based destination row
        
        console.log(`📋 Copying entire row ${srcRowIndex} → ${destRowIndex} for size ${selectedSize}`);
        
        // Step 1: Copy nguyên toàn bộ hàng
        const range = XLSX.utils.decode_range(wsOrig['!ref'] || 'A1:Z1000');
        for (let c = range.s.c; c <= range.e.c; c++) {
          const srcAddr = XLSX.utils.encode_cell({ c: c, r: srcRowIndex });
          const destAddr = XLSX.utils.encode_cell({ c: c, r: destRowIndex });
          
          if (wsOrig[srcAddr]) {
            // Copy toàn bộ cell (value + formatting)
            wsDest[destAddr] = JSON.parse(JSON.stringify(wsOrig[srcAddr]));
          }
        }
        
        // Step 2: Mapping chỉ những cái cần thiết
        function mapCell(colIdx, value) {
          if (colIdx >= 0) {
            const addr = XLSX.utils.encode_cell({ c: colIdx, r: destRowIndex });
            if (!wsDest[addr]) wsDest[addr] = {};
            wsDest[addr].v = value;
            wsDest[addr].t = 's';
          }
        }
        
        // Mapping data - chỉ mapping những cái cần thiết, KHÔNG đổi size
        mapCell(findHeaderIndex(['product name','title','name']), title);
        mapCell(findHeaderIndex(['description','desc']), description);  
        mapCell(findHeaderIndex(['base price','price']), price);
        mapCell(findHeaderIndex(['list price']), listPrice);
        mapCell(findHeaderIndex(['color']), color);
        // KHÔNG mapping size - giữ nguyên size từ template (XXL, XL, etc.)
        mapCell(findHeaderIndex(['shipping']), shipping);
        mapCell(findHeaderIndex(['contribution goods']), contributionGoods);
        mapCell(findHeaderIndex(['contribution sku']), contributionGoods + String(skuSeq).padStart(3, '0'));
        
        // Mapping images vào SKU Images URL - LẤY IMAGES CỦA COLOR HIỆN TẠI
        const colorUploadedUrls = uploadedByColor[color] || [];
        console.log(`🔍 Looking for SKU Images URL columns for color "${color}"...`);
        console.log(`🔍 Color "${color}" has ${colorUploadedUrls.length} uploaded URLs:`, colorUploadedUrls);

        // Tìm tất cả cột SKU Images URL
        const skuImageCols = [];
        for (let c = 0; c < templateHeaders.length; c++) {
          const header = (templateHeaders[c] || '').toString().toLowerCase();
          if (header.includes('sku') && header.includes('images') && header.includes('url')) {
            skuImageCols.push({ index: c, header: templateHeaders[c] });
          }
        }

        console.log(`🔍 Found ${skuImageCols.length} SKU Images URL columns:`, skuImageCols);

        // Map từng image của COLOR HIỆN TẠI vào từng cột
        for (let i = 0; i < colorUploadedUrls.length && i < skuImageCols.length; i++) {
          const col = skuImageCols[i];
          mapCell(col.index, colorUploadedUrls[i]);
          console.log(`✅ [${color}] Mapped image ${i+1} to column ${col.index} (${col.header}): "${colorUploadedUrls[i]}"`);
        }
        
        // Update range và cursor
        const currentRange = XLSX.utils.decode_range(wsDest['!ref'] || 'A1:A1');
        if (destRowIndex > currentRange.e.r) {
          currentRange.e.r = destRowIndex;
          wsDest['!ref'] = XLSX.utils.encode_range(currentRange);
        }
        
        writeCursor++;
        skuSeq++;
        console.log(`✅ Copied + mapped row for ${color}-${selectedSize}`);
        
        // Cập nhật hiển thị kích thước file
        updateFileSizeDisplay();
      }
    }
  } else {
    console.warn('❌ ENTERING FALLBACK MODE - no template data available');
    console.log('Fallback conditions:', {
      templateSampleRows: !!templateSampleRows,
      templateSampleRowsLength: templateSampleRows ? templateSampleRows.length : 0,
      parsedWorkbookOriginal: !!parsedWorkbookOriginal
    });
    
    console.log('🔍 Will create', sizesSelected.length * colorsToUse.length, 'fallback rows');
    
    // Fallback: Tạo hàng mới nếu không có template
    for (const color of colorsToUse) {
      for (const selectedSize of sizesSelected) {
        console.log(`Creating fallback row for ${color}-${selectedSize}`);
        const newRow = new Array(templateHeaders.length).fill('');
        
        // Fallback mapping - tìm cột size bằng function findSizeColumn
        const idxSize = findSizeColumn(templateHeaders);
        
        const idxProductName = findHeaderIndex(['product name','product nam','title','name']);
        const idxDesc = findHeaderIndex(['description','desc','product description']);
        const idxBasePrice = findHeaderIndex(['base price','price','base price - usd']);
        const idxListPrice = findHeaderIndex(['list price','list price - usd']);
        const idxColor = findHeaderIndex(['color','colour']);
        const idxShip = findHeaderIndex(['shipping','shipping template']);
        const idxContributionGoods = findHeaderIndex(['contribution goods']);
        const idxContributionSKU = findHeaderIndex(['contribution sku']);
        
        if (idxProductName >= 0) newRow[idxProductName] = title;
        if (idxDesc >= 0) newRow[idxDesc] = description;
        if (idxBasePrice >= 0) newRow[idxBasePrice] = price;
        if (idxListPrice >= 0) newRow[idxListPrice] = listPrice;
        if (idxColor >= 0) newRow[idxColor] = color;
        // KHÔNG ghi selectedSize - để trống hoặc dùng size từ template
        if (idxShip >= 0) newRow[idxShip] = shipping;
        if (idxContributionGoods >= 0) newRow[idxContributionGoods] = contributionGoods;
        if (idxContributionSKU >= 0) newRow[idxContributionSKU] = contributionGoods + String(skuSeq).padStart(3, '0');
        
        // Add images - LẤY IMAGES CỦA COLOR HIỆN TẠI
        const colorUploadedUrls = uploadedByColor[color] || [];
        for (let i = 0; i < colorUploadedUrls.length && i < 10; i++) {
          const imgIdx = findHeaderIndex([`sku images url ${i+1}`, `image ${i+1}`, `url ${i+1}`]);
          if (imgIdx >= 0) newRow[imgIdx] = colorUploadedUrls[i];
        }
        
        // Ghi fallback row vào worksheet
        if (parsedWorkbookWorking && templateHeaders) {
          const wsDest = parsedWorkbookWorking.Sheets[parsedSheetName];
          const destRowIndex = writeCursor - 1;
          
          for (let c = 0; c < newRow.length; c++) {
            if (newRow[c]) {
              const destAddr = XLSX.utils.encode_cell({ c: c, r: destRowIndex });
              wsDest[destAddr] = { v: newRow[c], t: 's' };
            }
          }
          
          // Update range
          const currentRange = XLSX.utils.decode_range(wsDest['!ref'] || 'A1:A1');
          if (destRowIndex > currentRange.e.r) {
            currentRange.e.r = destRowIndex;
            wsDest['!ref'] = XLSX.utils.encode_range(currentRange);
          }
          
          writeCursor++;
        }
        
        skuSeq++;
        console.log(`✅ Added fallback row for ${color}-${selectedSize}`);
        
        // Cập nhật hiển thị kích thước file
        updateFileSizeDisplay();
      }
    }
  }
  
  const totalRows = sizesSelected.length * colorsToUse.length;
  console.log(`🔍 SUMMARY:`, {
    sizesSelected: sizesSelected,
    colorsToUse: colorsToUse,
    expectedRows: totalRows,
    templateSampleRows: templateSampleRows ? templateSampleRows.length : 'null',
    parsedWorkbookOriginal: !!parsedWorkbookOriginal,
    parsedWorkbookWorking: !!parsedWorkbookWorking,
    writeCursor: writeCursor
  });
  console.log(`🔍 buildRowsForProduct processed ${totalRows} rows directly to worksheet`);
  return totalRows;
}

// Clear temporary URLs from row 3
function clearTempUrls() {
  if (parsedWorkbookWorking && templateHeaders) {
    const ws = parsedWorkbookWorking.Sheets[parsedSheetName];
    for (let i = 0; i < templateHeaders.length; i++) {
      const h = (templateHeaders[i] || '').toString().toLowerCase();
      if (h && h.includes('image')) {
        const tempAddr = XLSX.utils.encode_cell({ c: i, r: 4 }); // row 5 (0-based = 4)
        if (ws[tempAddr]) {
          delete ws[tempAddr];
        }
      }
    }
  }
}

// Clear image URLs only (keep colors and product info) - DEPRECATED, use clearColorImages
function clearImageUrls() {
  console.log('🧹 clearImageUrls() called - redirecting to clearColorImages()');
  clearColorImages();
}

// === Xóa datamask từ hàng 5 trở đi để file nhẹ nhất ===
function removeDatamaskFromRow5(ws) {
  if (!ws) return;
  
  console.log('🔍 Starting COMPLETE datamask removal from row 5+ (ALL cells)...');
  let cellsProcessed = 0;
  let cellsCleaned = 0;
  
  // Lấy phạm vi hiện tại của worksheet
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  console.log('🔍 Worksheet range:', ws['!ref']);
  
  // Xóa datamask từ TẤT CẢ ô từ hàng 5 trở đi (cả ô có giá trị và ô trống)
  for (let r = 4; r <= range.e.r; r++) { // r=4 là hàng 5 (0-based)
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: r, c: c });
      let cell = ws[addr];
      
      cellsProcessed++;
      
      // Nếu ô không tồn tại, tạo ô trống để xóa style
      if (!cell) {
        cell = { v: undefined };
        ws[addr] = cell;
      }
      
      if (typeof cell !== 'object') continue;
      
      // XÓA SẠCH TẤT CẢ datamask từ hàng 5 trở xuống (cả ô có giá trị)
      let hadStyle = false;
      
      // Xóa TẤT CẢ datamask properties
      if (cell.s !== undefined) { delete cell.s; hadStyle = true; } // style
      if (cell.z !== undefined) { delete cell.z; hadStyle = true; } // number format  
      if (cell.w !== undefined) { delete cell.w; hadStyle = true; } // formatted text cache
      if (cell.f !== undefined) { delete cell.f; hadStyle = true; } // formula
      if (cell.c !== undefined) { delete cell.c; hadStyle = true; } // comment
      if (cell.l !== undefined) { delete cell.l; hadStyle = true; } // link
      
      if (hadStyle) cellsCleaned++;
      
      // Nếu ô trống hoàn toàn sau khi xóa datamask, xóa luôn ô đó
      if (!cell.v && !cell.t && Object.keys(cell).length === 0) {
        delete ws[addr];
      }
    }
  }
  
  // Xóa merge từ hàng 5 trở đi để tránh lây datamask
  if (Array.isArray(ws['!merges']) && ws['!merges'].length) {
    const originalMerges = ws['!merges'].length;
    ws['!merges'] = ws['!merges'].filter(m => (m.s.r < 4 && m.e.r < 4));
    console.log(`🔍 Removed ${originalMerges - ws['!merges'].length} merges from row 5+`);
  }
  
  console.log(`✅ COMPLETE datamask removal: ${cellsCleaned}/${cellsProcessed} cells cleaned from row 5+ (ALL cells)`);
}

// === Tính kích thước file Excel từ parsedWorkbookWorking ===
function getExcelFileSize() {
  if (!parsedWorkbookWorking) {
    console.log('🔍 DEBUG - parsedWorkbookWorking is null/undefined');
    return 0;
  }
  
  try {
    console.log('🔍 DEBUG - Starting getExcelFileSize calculation...');
    
    // Tạo bản sao để tính size mà không ảnh hưởng đến workbook gốc
    const wbForSize = JSON.parse(JSON.stringify(parsedWorkbookWorking));
    console.log('🔍 DEBUG - Created workbook copy');
    
    // Áp dụng xóa datamask giống như khi export
    const ws = wbForSize.Sheets[parsedSheetName];
    if (!ws) {
      console.log('🔍 DEBUG - No worksheet found for sheet:', parsedSheetName);
      return 0;
    }
    
    removeDatamaskFromRow5(ws);
    console.log('🔍 DEBUG - Applied datamask removal');
    
    // Tính size với compression (giống như khi export)
    const wbout = XLSX.write(wbForSize, { 
      bookType: 'xlsx', 
      type: 'array', 
      compression: true, 
      bookSST: true 
    });
    
    console.log('🔍 DEBUG - XLSX.write result:', wbout, 'type:', typeof wbout);
    
    // XLSX.write trả về ArrayBuffer, cần dùng .byteLength thay vì .length
    let fileSize = 0;
    if (wbout instanceof ArrayBuffer) {
      fileSize = wbout.byteLength;
      console.log('📊 ArrayBuffer size:', fileSize, 'bytes');
    } else if (wbout && typeof wbout.length === 'number') {
      fileSize = wbout.length;
      console.log('📊 Array size:', fileSize, 'bytes');
    } else {
      console.error('❌ XLSX.write returned invalid result:', wbout);
      
      // Fallback: thử không dùng compression
      console.log('🔄 Trying fallback without compression...');
      try {
        const wboutFallback = XLSX.write(wbForSize, { 
          bookType: 'xlsx', 
          type: 'array'
        });
        console.log('🔍 DEBUG - Fallback XLSX.write result:', wboutFallback, 'type:', typeof wboutFallback);
        
        if (wboutFallback instanceof ArrayBuffer) {
          fileSize = wboutFallback.byteLength;
          console.log('📊 Fallback ArrayBuffer size:', fileSize, 'bytes');
        } else if (wboutFallback && typeof wboutFallback.length === 'number') {
          fileSize = wboutFallback.length;
          console.log('📊 Fallback Array size:', fileSize, 'bytes');
        }
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
      }
      
      // Last resort: ước tính dựa trên số ô có data
      console.log('🔄 Estimating file size based on data...');
      let cellCount = 0;
      for (const addr of Object.keys(ws)) {
        if (addr[0] !== '!' && ws[addr] && ws[addr].v !== undefined) {
          cellCount++;
        }
      }
      fileSize = Math.max(1000, cellCount * 50); // ước tính ~50 bytes per cell
      console.log('📊 Estimated file size:', fileSize, 'bytes (based on', cellCount, 'cells)');
    }
    
    console.log('📊 Final file size:', fileSize, 'bytes');
    return fileSize;
  } catch (e) {
    console.warn('Failed to calculate file size:', e);
    console.log('🔍 DEBUG - Error details:', e.message, e.stack);
    return 0;
  }
}

// === Format kích thước file ===
function formatFileSize(bytes) {
  // Kiểm tra input hợp lệ
  if (!bytes || bytes === 0 || isNaN(bytes) || !isFinite(bytes)) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Đảm bảo i không vượt quá kích thước mảng
  const index = Math.min(i, sizes.length - 1);
  const size = parseFloat((bytes / Math.pow(k, index)).toFixed(1));
  
  return size + ' ' + sizes[index];
}

// === Tạo thanh progress bar cho file size ===
function createFileSizeProgressBar(bytes, formatted) {
  const maxSize = 2 * 1024 * 1024; // 2MB
  const percentage = Math.min((bytes / maxSize) * 100, 100);
  
  // Màu sắc: xanh → vàng → đỏ
  let color, bgColor;
  if (percentage <= 50) {
    // Xanh → vàng (0-50%)
    color = `hsl(${120 - percentage * 1.2}, 70%, 45%)`; // 120° (xanh) → 60° (vàng)
    bgColor = `hsl(${120 - percentage * 1.2}, 70%, 85%)`;
  } else if (percentage <= 80) {
    // Vàng → cam (50-80%)
    color = `hsl(${60 - (percentage - 50) * 1.0}, 70%, 45%)`; // 60° (vàng) → 30° (cam)
    bgColor = `hsl(${60 - (percentage - 50) * 1.0}, 70%, 85%)`;
  } else {
    // Cam → đỏ (80-100%)
    color = `hsl(${30 - (percentage - 80) * 1.5}, 70%, 45%)`; // 30° (cam) → 0° (đỏ)
    bgColor = `hsl(${30 - (percentage - 80) * 1.5}, 70%, 85%)`;
  }
  
  // Icon dựa trên mức độ
  let icon = '📊';
  if (percentage > 80) icon = '⚠️';
  if (percentage >= 100) icon = '🚨';
  
  return `
    <div style="
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: linear-gradient(90deg, ${bgColor} 0%, rgba(255,255,255,0.3) 100%);
      border-radius: 8px;
      border: 2px solid ${color};
      font-weight: bold;
      color: ${color};
      font-size: 13px;
    ">
      <span>${icon}</span>
      <span>File size: ${formatted}</span>
      <div style="
        flex: 1;
        height: 6px;
        background: rgba(0,0,0,0.1);
        border-radius: 3px;
        overflow: hidden;
        margin-left: 5px;
      ">
        <div style="
          width: ${percentage}%;
          height: 100%;
          background: linear-gradient(90deg, ${color}, ${color}dd);
          border-radius: 3px;
          transition: width 0.3s ease;
        "></div>
      </div>
      <span style="font-size: 11px; opacity: 0.8;">${percentage.toFixed(1)}%</span>
    </div>
  `;
}

// === Cập nhật hiển thị kích thước file ===
function updateFileSizeDisplay() {
  console.log('🔍 updateFileSizeDisplay called');
  console.log('🔍 DEBUG - parsedWorkbookWorking exists:', !!parsedWorkbookWorking);
  console.log('🔍 DEBUG - parsedSheetName:', parsedSheetName);
  
  const sizeBytes = getExcelFileSize();
  console.log('🔍 DEBUG - getExcelFileSize returned:', sizeBytes, 'type:', typeof sizeBytes);
  
  const sizeFormatted = formatFileSize(sizeBytes);
  console.log('🔍 DEBUG - formatFileSize returned:', sizeFormatted);
  
  console.log('📊 File size:', sizeFormatted, '(', sizeBytes, 'bytes )');
  
  // Tìm hoặc tạo element hiển thị kích thước
  let sizeDisplay = document.getElementById('fileSizeDisplay');
  if (!sizeDisplay) {
    console.log('🔧 Creating fileSizeDisplay element');
    sizeDisplay = document.createElement('div');
    sizeDisplay.id = 'fileSizeDisplay';
    sizeDisplay.className = 'file-size-display';
    sizeDisplay.style.cssText = `
      margin: 10px 0;
      padding: 0;
      display: block;
    `;
    
    // Thêm vào sau status
    const status = document.getElementById('status');
    if (status && status.parentNode) {
      status.parentNode.insertBefore(sizeDisplay, status.nextSibling);
      console.log('✅ fileSizeDisplay element created and inserted');
    } else {
      console.error('❌ Could not find status element');
    }
  } else {
    console.log('✅ fileSizeDisplay element already exists');
    // Đảm bảo element được hiển thị
    sizeDisplay.style.display = 'block';
  }
  
  // Tạo thanh progress bar màu sắc
  const progressHtml = createFileSizeProgressBar(sizeBytes, sizeFormatted);
  sizeDisplay.innerHTML = progressHtml;
  console.log('✅ Updated file size display:', sizeFormatted);
}

// === Test function để gọi updateFileSizeDisplay thủ công ===
function testFileSizeDisplay() {
  console.log('🧪 Testing file size display...');
  updateFileSizeDisplay();
}

// Append rows to workbook in-memory (do not download)
function appendRowsToWorkbook(rows) {
  if (parsedWorkbookWorking && templateHeaders) {
    const ws = parsedWorkbookWorking.Sheets[parsedSheetName];
    // before writing, ensure we won't exceed MAX_ROWS
    const projectedLastRow = writeCursor + rows.length - 1;
    if (projectedLastRow > MAX_ROWS) {
      throw new Error(`Cannot write ${rows.length} rows: would exceed max ${MAX_ROWS} rows (would end at ${projectedLastRow})`);
    }
    // Ghi AOA vào đúng vị trí (0-based)
    XLSX.utils.sheet_add_aoa(ws, rows, { origin: { r: writeCursor - 1, c: 0 } });
    writeCursor += rows.length;
    console.log('🔍 DEBUG - Added rows with sheet_add_aoa, writeCursor now:', writeCursor);
    return true;
  } else {
    if (!parsedCsv) parsedCsv = [];
    for (const r of rows) parsedCsv.push(r);
    return true;
  }
}

// Upload images in parallel (faster than sequential)
async function processAndUploadImages(urls, cloudName, statusEl) {
  if (!urls || urls.length === 0) return [];
  
  if (statusEl) {
    statusEl.textContent = `Uploading ${urls.length} images in parallel...`;
  }
  
  console.log(`🚀 Starting parallel upload of ${urls.length} images`);
  
  // Upload all images in parallel
  const uploadPromises = urls.map((url, index) => {
    return processImageUrl(url, cloudName, statusEl).catch(err => {
      console.error(`❌ Failed to upload image ${index + 1} (${url}):`, err);
      // Return null for failed uploads, don't block other images
      return null;
    });
  });
  
  // Wait for all uploads to complete (parallel execution)
  const results = await Promise.all(uploadPromises);
  
  // Filter out failed uploads (null values)
  const uploaded = results.filter(url => url !== null);
  
  if (statusEl) {
    if (uploaded.length === urls.length) {
      statusEl.textContent = `✅ All ${uploaded.length} images uploaded successfully`;
    } else {
      statusEl.textContent = `⚠️ Uploaded ${uploaded.length}/${urls.length} images (${urls.length - uploaded.length} failed)`;
    }
  }
  
  console.log(`✅ Parallel upload complete: ${uploaded.length}/${urls.length} successful`);
  return uploaded;
}

// ========== QUEUE SYSTEM FUNCTIONS ==========

// Get status text in Vietnamese
function getStatusText(status) {
  const statusMap = {
    'pending': '⏳ Chờ xử lý',
    'processing': '🔄 Đang xử lý',
    'completed': '✅ Hoàn thành',
    'error': '❌ Lỗi'
  };
  return statusMap[status] || status;
}

// Update queue display UI
function updateQueueDisplay() {
  const queueEl = document.getElementById('queueDisplay');
  if (!queueEl) return;
  
  const pendingCount = processingQueue.filter(item => item.status === 'pending').length;
  const processingCount = processingQueue.filter(item => item.status === 'processing').length;
  const completedCount = processingQueue.filter(item => item.status === 'completed').length;
  const errorCount = processingQueue.filter(item => item.status === 'error').length;
  
  // Show/hide queue display based on queue length
  if (processingQueue.length === 0) {
    queueEl.style.display = 'none';
    return;
  }
  
  queueEl.style.display = 'block';
  
  queueEl.innerHTML = `
    <div class="queue-header">
      <h3>📋 Queue: ${processingQueue.length} sản phẩm</h3>
      <div class="queue-stats">
        <span class="stat-pending">⏳ ${pendingCount}</span>
        <span class="stat-processing">🔄 ${processingCount}</span>
        <span class="stat-completed">✅ ${completedCount}</span>
        ${errorCount > 0 ? `<span class="stat-error">❌ ${errorCount}</span>` : ''}
      </div>
      ${isProcessing ? '<span class="processing-indicator">Đang xử lý...</span>' : ''}
    </div>
    <div class="queue-list">
      ${processingQueue.slice(0, 10).map(item => `
        <div class="queue-item queue-item-${item.status}" data-id="${item.id}">
          <div class="queue-item-title">
            <span class="queue-item-name">${item.title || 'Untitled Product'}</span>
            <span class="queue-item-time">${formatQueueTime(item.createdAt)}</span>
          </div>
          <div class="queue-item-details">
            <span class="status-badge status-${item.status}">${getStatusText(item.status)}</span>
            ${item.status === 'processing' ? `<span class="queue-progress">Uploading ${item.imageCount || 0} images...</span>` : ''}
            ${item.status === 'completed' ? `<span class="queue-success">${item.rowsCount || 0} rows added</span>` : ''}
            ${item.status === 'error' ? `<span class="queue-error">${item.error || 'Unknown error'}</span>` : ''}
          </div>
        </div>
      `).join('')}
      ${processingQueue.length > 10 ? `<div class="queue-more">... và ${processingQueue.length - 10} sản phẩm khác</div>` : ''}
    </div>
    <div class="queue-actions">
      <button id="clearCompletedBtn" class="btn-clear">Xóa các mục đã hoàn thành</button>
      <button id="clearAllQueueBtn" class="btn-clear-danger">Xóa tất cả</button>
    </div>
  `;
  
  // Attach event listeners
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener('click', clearCompletedItems);
  }
  
  const clearAllBtn = document.getElementById('clearAllQueueBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllQueue);
  }
}

// Format time for queue display
function formatQueueTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (seconds < 10) return 'Vừa xong';
  if (seconds < 60) return `${seconds}s trước`;
  if (minutes < 60) return `${minutes}m trước`;
  return new Date(date).toLocaleTimeString('vi-VN');
}

// Add product to queue
function addToQueue(productData) {
  queueIdCounter++;
  const queueItem = {
    id: queueIdCounter,
    ...productData,
    status: 'pending',
    createdAt: new Date(),
    imageCount: productData.urls ? productData.urls.length : 0
  };
  
  processingQueue.push(queueItem);
  console.log(`📥 Added product to queue: ${queueItem.title || 'Untitled'} (ID: ${queueItem.id})`);
  console.log(`📊 Queue length: ${processingQueue.length}`);
  
  updateQueueDisplay();
  
  // Start processing if not already processing
  if (!isProcessing) {
    processQueue();
  }
  
  return queueItem.id;
}

// Process queue items one by one
async function processQueue() {
  if (isProcessing || processingQueue.length === 0) {
    return;
  }

  isProcessing = true;
  updateQueueDisplay();

  // Find first pending item
  const itemIndex = processingQueue.findIndex(item => item.status === 'pending');
  if (itemIndex === -1) {
    isProcessing = false;
    updateQueueDisplay();
    return;
  }

  const item = processingQueue[itemIndex];

  try {
    console.log(`🔄 Processing queue item ${item.id}: ${item.title || 'Untitled'}`);
    item.status = 'processing';
    updateQueueDisplay();

    // Validate required data
    if (!item.cloudName) {
      throw new Error('Không lấy được cloud name từ Cloudinary URL');
    }

    // Check for new colorImagesData format
    if (!item.colorImagesData || Object.keys(item.colorImagesData).length === 0) {
      throw new Error('Không có dữ liệu ảnh theo màu');
    }

    const statusEl = $('status');

    // Upload images for EACH color separately
    const uploadedByColor = {};
    let totalUploaded = 0;

    for (const color of Object.keys(item.colorImagesData)) {
      const urls = item.colorImagesData[color];
      if (statusEl) {
        statusEl.textContent = `Uploading ${urls.length} images for color "${color}"...`;
      }

      console.log(`🔄 Uploading ${urls.length} images for color "${color}"`);
      const uploaded = await processAndUploadImages(urls, item.cloudName, statusEl);

      if (uploaded.length === 0) {
        console.warn(`⚠️ No images uploaded for color "${color}"`);
      }

      uploadedByColor[color] = uploaded;
      totalUploaded += uploaded.length;
    }

    if (totalUploaded === 0) {
      throw new Error('Không có hình ảnh nào được upload thành công');
    }

    console.log('✅ All images uploaded by color:', uploadedByColor);

    // Temporarily set form values for buildRowsForProduct
    const originalTitle = $('title') ? $('title').value : '';
    const originalDescription = $('description') ? $('description').value : '';
    const originalPrice = $('price') ? $('price').value : '';
    const originalListPrice = $('listPrice') ? $('listPrice').value : '';
    const originalShipping = $('shippingTemplate') ? $('shippingTemplate').value : '';
    const originalSelectedColors = [...selectedColors];
    const originalColorImages = JSON.parse(JSON.stringify(colorImages));
    const originalSizes = Array.from(document.querySelectorAll('.size:checked')).map(n => n.value);

    // Set form values from queue item
    if ($('title')) $('title').value = item.title || '';
    if ($('description')) $('description').value = item.description || '';
    if ($('price')) $('price').value = item.price || '';
    if ($('listPrice')) $('listPrice').value = item.listPrice || '';
    if ($('shippingTemplate')) $('shippingTemplate').value = item.shipping || '';

    // Set selected colors
    selectedColors = [...(item.colors || [])];

    // Set selected sizes
    document.querySelectorAll('.size').forEach(cb => {
      cb.checked = item.sizes && item.sizes.includes(cb.value);
    });

    // Build rows and write to Excel - pass uploadedByColor
    console.log('🔍 About to call buildRowsForProduct with uploadedByColor:', uploadedByColor);
    const rowsCount = buildRowsForProduct(uploadedByColor);
    console.log('🔍 buildRowsForProduct processed:', rowsCount, 'rows');

    // Restore original form values
    if ($('title')) $('title').value = originalTitle;
    if ($('description')) $('description').value = originalDescription;
    if ($('price')) $('price').value = originalPrice;
    if ($('listPrice')) $('listPrice').value = originalListPrice;
    if ($('shippingTemplate')) $('shippingTemplate').value = originalShipping;
    selectedColors = originalSelectedColors;
    colorImages = originalColorImages;
    document.querySelectorAll('.size').forEach(cb => {
      cb.checked = originalSizes.includes(cb.value);
    });

    // Mark as completed
    item.status = 'completed';
    item.rowsCount = rowsCount;
    item.completedAt = new Date();
    productCount++;
    updateProductCounter();

    // Update file size display
    updateFileSizeDisplay();

    if (statusEl) {
      statusEl.textContent = `✅ Queue: ${item.title || 'Product'} - ${rowsCount} rows added. Đã ghi: ${productCount} sản phẩm`;
    }

    // Handle shouldDownloadAfter if needed (usually not needed with queue system)
    if (item.shouldDownloadAfter) {
      console.log(`📥 Auto-download requested for queue item ${item.id}`);
      // Note: Auto-download is disabled in queue mode for better UX
      // User can manually click "Xuất File" button when ready
    }

    console.log(`✅ Queue item ${item.id} completed: ${rowsCount} rows added`);

  } catch (err) {
    console.error(`❌ Queue item ${item.id} failed:`, err);
    item.status = 'error';
    item.error = err?.message || err?.toString() || 'Unknown error';
    item.failedAt = new Date();

    const statusEl = $('status');
    if (statusEl) {
      statusEl.textContent = `❌ Queue error: ${item.title || 'Product'} - ${item.error}`;
    }
  } finally {
    isProcessing = false;
    updateQueueDisplay();

    // Continue processing next item after a short delay
    setTimeout(() => {
      if (processingQueue.some(item => item.status === 'pending')) {
        processQueue();
      }
    }, 500);
  }
}

// Clear completed items from queue
function clearCompletedItems() {
  const beforeLength = processingQueue.length;
  processingQueue = processingQueue.filter(item => item.status !== 'completed');
  const removed = beforeLength - processingQueue.length;
  console.log(`🧹 Removed ${removed} completed items from queue`);
  updateQueueDisplay();
}

// Clear all items from queue
function clearAllQueue() {
  if (processingQueue.some(item => item.status === 'processing')) {
    if (!confirm('Có sản phẩm đang xử lý. Bạn có chắc muốn xóa tất cả?')) {
      return;
    }
  }
  
  const length = processingQueue.length;
  processingQueue = [];
  isProcessing = false;
  console.log(`🧹 Cleared all ${length} items from queue`);
  updateQueueDisplay();
}

// ========== END QUEUE SYSTEM ==========

async function handleWrite(shouldDownloadAfter=false) {
  const status = $('status');

  try {
    // Validate Cloudinary URL
    const cloudinaryUrl = ($('cloudinaryUrl').value || '').trim();
    const parsed = parseCloudinaryUri(cloudinaryUrl);
    const cloudName = parsed.cloud_name;
    if (!cloudName) {
      throw new Error('Không lấy được cloud name từ Cloudinary URL');
    }

    // Collect images from UI cho từng color
    collectColorImagesFromUI();

    // Validate: phải có ít nhất 1 color và mỗi color phải có ít nhất 1 image
    if (selectedColors.length === 0) {
      throw new Error('Phải chọn ít nhất 1 màu');
    }

    let totalImages = 0;
    const colorImagesData = {};
    for (const color of selectedColors) {
      const imgs = (colorImages[color] || []).filter(url => url && url.trim());
      if (imgs.length === 0) {
        throw new Error(`Màu "${color}" chưa có ảnh nào`);
      }
      colorImagesData[color] = imgs;
      totalImages += imgs.length;
    }

    if (totalImages === 0) {
      throw new Error('Phải có ít nhất 1 ảnh cho mỗi màu');
    }

    // Collect product data from form
    const productData = {
      title: ($('title') ? $('title').value : '').trim(),
      description: ($('description') ? $('description').value : '').trim(),
      price: ($('price') ? $('price').value : '').trim(),
      listPrice: ($('listPrice') ? $('listPrice').value : '').trim(),
      shipping: ($('shippingTemplate') ? $('shippingTemplate').value : '').trim(),
      colors: [...selectedColors],
      sizes: Array.from(document.querySelectorAll('.size:checked')).map(n => n.value),
      colorImagesData: colorImagesData, // { color: [url1, url2], ... }
      cloudName: cloudName,
      shouldDownloadAfter: shouldDownloadAfter,
      imageCount: totalImages
    };

    // Add to queue (non-blocking)
    const queueId = addToQueue(productData);

    // Clear form immediately so user can continue entering products
    clearColorImages();
    const titleInput = $('title');
    if (titleInput) {
      titleInput.value = '';
    }

    // Show success message
    status.textContent = `✅ Đã thêm vào queue (ID: ${queueId}). ${selectedColors.length} màu, ${totalImages} ảnh. Tiếp tục nhập...`;
    console.log(`✅ Product added to queue: ${productData.title || 'Untitled'} (Queue ID: ${queueId})`);

  } catch (err) {
    console.error('Error adding to queue:', err);
    const errorMsg = err?.message || err?.toString() || 'Unknown error';
    status.textContent = '❌ Error: ' + errorMsg;
  }
}

// Clear all color images (sau khi thêm vào queue)
function clearColorImages() {
  console.log('🧹 Clearing all color images...');
  selectedColors.forEach(color => {
    if (colorImages[color]) {
      colorImages[color] = new Array(DEFAULT_IMAGES_PER_COLOR).fill('');
    }
  });
  renderColorTabs();
  console.log(`✅ Cleared images for ${selectedColors.length} colors`);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'checkForUpdates') {
    console.log('🔄 Received update check request from background - ignoring to prevent repeated notifications');
    // Don't check updates on every click, only on first load
  }
});

// Event bindings
window.addEventListener('DOMContentLoaded', () => {
  // Initialize color tabs UI
  renderColorTabs();

  // Add/Remove image buttons
  const addImageBtn = $('addImageBtn');
  if (addImageBtn) {
    addImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addImageToColor();
    });
  }

  const removeImageBtn = $('removeImageBtn');
  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      removeImageFromColor();
    });
  }

  // Test button event listener
  const testBtn = document.getElementById('testSizeBtn');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      console.log('🧪 Test button clicked');
      updateFileSizeDisplay();
    });
  }
  
  // Auto resize window on load
  setTimeout(autoResizeWindow, 200);
  
  // Test file size display on load
  setTimeout(() => {
    console.log('🧪 Testing updateFileSizeDisplay on load...');
    updateFileSizeDisplay();
  }, 500);
  
  // Initialize queue display
  setTimeout(() => {
    console.log('📋 Initializing queue display...');
    updateQueueDisplay();
  }, 600);
  
  // Custom dropdown đã được khởi tạo trong event listeners
  console.log('🎨 Custom color dropdown will be initialized when needed');
  
  // Check for updates immediately when extension loads
  console.log('🚀 Extension loaded, checking for updates...');
  
  // Only check once when extension loads
  setTimeout(() => {
    console.log('🔄 Checking for updates...');
    checkForUpdates();
  }, 1000);
  
  // Removed test notification - only show real updates

  // Note: addImage và removeImage đã được thay thế bởi buttons trong mỗi color group
  
  const addColorBtnEl = $('addColorBtn');
  if (addColorBtnEl) addColorBtnEl.addEventListener('click', (e) => { e.preventDefault(); addColorToSelected(); });
  // Only add colorFile listener if element exists
  const colorFileEl = $('colorFile');
  if (colorFileEl) {
    colorFileEl.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        colors = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        loadColorsFromTextarea();
        saveFormState();
      };
      reader.readAsText(f);
    });
  }

  // writeBtn: append to working copy (do not download). User must click Export to download.
  const writeBtnEl = $('writeBtn');
  if (writeBtnEl) writeBtnEl.addEventListener('click', (e) => { 
    try {
      e.preventDefault(); 
      handleWrite(false); 
    } catch (err) {
      console.error('Write button error:', err);
      $('status').textContent = 'Write error: ' + (err?.message || 'Unknown error');
    }
  });
  
  // exportBtn: just export current working copy (without processing new images)
  const exportBtnEl = $('exportBtn');
  if (exportBtnEl) exportBtnEl.addEventListener('click', (e) => { 
    try {
      e.preventDefault();
      const status = $('status');
      if (parsedWorkbookWorking && templateHeaders) {
        try {
          const outName = (parsedFileName && parsedFileName.replace(/\.(csv|xlsx|xls)$/i, '')) || 'products_template';
          const ts = new Date().toISOString().replace(/[:.]/g,'-');
          writeWorkbookAndDownload(parsedWorkbookWorking, outName + '_clone_' + ts + '.xlsx');
          status.textContent = 'Exported working copy.';
          
          // Reset counter and working copy after successful export
          setTimeout(() => {
            resetProductCounter();
          }, 1000);
        } catch (err) { 
          console.error('Export failed:', err);
          const errorMsg = err?.message || err?.toString() || 'Unknown error';
          status.textContent = 'Export failed: ' + errorMsg; 
        }
      } else if (parsedCsv) {
        downloadCsv(parsedFileName, parsedCsv);
        status.textContent = 'Exported CSV buffer.';
      } else {
        status.textContent = 'Nothing to export.';
      }
    } catch (err) {
      console.error('Export button error:', err);
      $('status').textContent = 'Export button error: ' + (err?.message || 'Unknown error');
    }
  });
  
  // Only add cloneBtn listener if element exists
  const cloneBtnEl = $('cloneBtn');
  if (cloneBtnEl) {
    cloneBtnEl.addEventListener('click', (e) => { e.preventDefault();
      const status = $('status');
      if (parsedWorkbookWorking && templateHeaders) {
        try {
          const name = (parsedFileName && parsedFileName.replace(/\.(csv|xlsx|xls)$/i, '')) || 'template_copy';
          writeWorkbookAndDownload(parsedWorkbookWorking, name + '_clone.xlsx');
          status.textContent = 'Working copy cloned and downloaded.';
        } catch (err) { 
          console.error('Failed to clone working copy:', err);
          const errorMsg = err?.message || err?.toString() || 'Unknown error';
          status.textContent = 'Failed to clone working copy: ' + errorMsg; 
        }
      } else if (parsedCsv) {
        try {
          downloadCsv(parsedFileName, parsedCsv);
          status.textContent = 'CSV cloned and downloaded.';
        } catch (err) { 
          console.error('Failed to clone CSV:', err);
          const errorMsg = err?.message || err?.toString() || 'Unknown error';
          status.textContent = 'Failed to clone CSV: ' + errorMsg; 
        }
      } else {
        status.textContent = 'No template loaded to clone.';
      }
    });
  }

  // Color dropdown list
  const colorInputEl = $('colorInput');
  const colorDropdown = $('colorDropdown');
  
  if (colorInputEl && colorDropdown) {
    // Function để populate dropdown với tất cả màu
    const populateColorDropdown = (filter = '') => {
      colorDropdown.innerHTML = '';
      
      const filteredColors = colors.filter(color => 
        color.toLowerCase().includes(filter.toLowerCase())
      );
      
      filteredColors.forEach(color => {
        const option = document.createElement('div');
        option.className = 'color-option';
        option.textContent = color;
        option.addEventListener('click', () => {
          colorInputEl.value = color;
          colorDropdown.style.display = 'none';
        });
        colorDropdown.appendChild(option);
      });
      
      console.log(`✅ Populated dropdown with ${filteredColors.length} colors`);
    };
    
    // Show dropdown khi click vào input
    colorInputEl.addEventListener('click', () => {
      populateColorDropdown(colorInputEl.value);
      colorDropdown.style.display = 'block';
    });
    
    // Show dropdown khi focus vào input
    colorInputEl.addEventListener('focus', () => {
      populateColorDropdown(colorInputEl.value);
      colorDropdown.style.display = 'block';
    });
    
    // Filter dropdown khi gõ
    colorInputEl.addEventListener('input', (e) => {
      const filter = e.target.value;
      populateColorDropdown(filter);
      colorDropdown.style.display = 'block';
      saveFormState();
    });
    
    // Ẩn dropdown khi click outside
    document.addEventListener('click', (e) => {
      if (!colorInputEl.contains(e.target) && !colorDropdown.contains(e.target)) {
        colorDropdown.style.display = 'none';
      }
    });
  }

  // attach input listeners for persistence
  const inputsToPersist = ['cloudinaryUrl','title','description','price','colorInput','shippingTemplate'];
  inputsToPersist.forEach(id => { const el = $(id); if (el) el.addEventListener('input', saveFormState); });
  const listEl = $('listPrice'); if (listEl) listEl.addEventListener('input', saveFormState);

  // Handle loading existing CSV or XLSX
  const excelFileEl = $('excelFile');
  if (excelFileEl) {
    excelFileEl.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    parsedFileName = f.name;
    const reader = new FileReader();
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        
        // QUAN TRỌNG: Khởi tạo ngay sau khi đọc Excel
        parsedWorkbook = wb;
        parsedWorkbookOriginal = wb; // QUAN TRỌNG: dùng để copy cell y nguyên từ mẫu
        parsedSheetName = wb.SheetNames[0];
        
        const wsOrig = wb.Sheets[parsedSheetName];
        const rowsOrig = XLSX.utils.sheet_to_json(wsOrig, { header: 1, defval: '' });
        
        templateHeaders = (rowsOrig[3] || []); // giữ nguyên, kể cả ô rỗng
        console.log('🔍 DEBUG - Loaded templateHeaders from row 4 (unfiltered):', templateHeaders);
        console.log('🔍 DEBUG - Headers with size:', templateHeaders.filter(h => h && h.toString().toLowerCase().includes('size')));
        console.log('🔍 DEBUG - rowsOrig length:', rowsOrig.length);
        console.log('🔍 DEBUG - Row 1 headers:', rowsOrig[0]);
        console.log('🔍 DEBUG - Row 2 headers:', rowsOrig[1]);
        console.log('🔍 DEBUG - Row 3 headers:', rowsOrig[2]);
        console.log('🔍 DEBUG - Row 4 headers:', rowsOrig[3]);
        
        // Lấy sample rows (từ hàng 5 trở đi) - lấy tất cả hàng
        templateSampleRows = [];
        templateSampleRowIndices = [];
        for (let i = 4; i < rowsOrig.length; i++) {
          const row = rowsOrig[i];
          templateSampleRows.push(row || []); // Lấy tất cả hàng, kể cả hàng trống
          templateSampleRowIndices.push(i + 1); // index 1-based
        }
        
        // Debug: Hiển thị tất cả hàng để kiểm tra
        console.log('🔍 DEBUG - All rows from template:');
        for (let i = 0; i < Math.min(templateSampleRows.length, 20); i++) {
          const row = templateSampleRows[i];
          console.log(`  Row ${i + 5}:`, row.map((cell, j) => `[${j}]: "${cell}"`).join(', '));
        }
        
        console.log('🔍 DEBUG - Template sample rows stored:', templateSampleRows.length, 'rows');
        console.log('🔍 DEBUG - Sample rows data:', templateSampleRows);
        
        // Debug: Hiển thị chi tiết sample rows với size
        if (templateSampleRows.length > 0) {
          console.log('🔍 DEBUG - First 10 sample rows with ALL columns:');
          templateSampleRows.slice(0, 10).forEach((row, i) => {
            console.log(`  Row ${i + 5}:`, row.map((cell, j) => `[${j}]: "${cell}"`).join(', '));
          });
          
          console.log('🔍 DEBUG - Looking for size columns in all rows:');
          templateSampleRows.slice(0, 10).forEach((row, i) => {
            const sizeValues = row.map((cell, j) => ({ col: j, value: cell, header: templateHeaders[j] }))
              .filter(item => item.value && item.value.toString().trim() !== '');
            console.log(`  Row ${i + 5} non-empty values:`, sizeValues);
          });
        }
        
        // Debug: Kiểm tra nếu không có sample rows
        if (templateSampleRows.length === 0) {
          console.warn('⚠️ No sample rows found! Template might be empty after row 4.');
          console.log('🔍 DEBUG - All rows from index 4:', rowsOrig.slice(4, 10));
        }
        
        // build a fresh working copy that clones the entire original workbook with formatting
        try {
           // Clone toàn bộ workbook gốc (bao gồm formatting, khung lưới, etc.)
           // Sử dụng deep clone để giữ nguyên 100% file gốc
           parsedWorkbookWorking = JSON.parse(JSON.stringify(wb));
           
           // Cập nhật hiển thị kích thước file ban đầu
           updateFileSizeDisplay();
          
          // Xóa data từ hàng 5 trở đi, chỉ giữ header (hàng 1-4)
          const ws = parsedWorkbookWorking.Sheets[parsedSheetName];
          const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z1000');
          
          // Xóa data từ hàng 5 trở đi (giữ nguyên formatting)
          for (let r = 4; r <= range.e.r; r++) { // r=4 là hàng 5 (0-based)
            for (let c = range.s.c; c <= range.e.c; c++) {
              const addr = XLSX.utils.encode_cell({ c: c, r: r });
              if (ws[addr]) {
                // Giữ formatting nhưng xóa value
                if (ws[addr].v !== undefined) {
                  delete ws[addr].v;
                }
                if (ws[addr].f !== undefined) {
                  delete ws[addr].f;
                }
              }
            }
          }
          
          // KHÔNG cập nhật range - giữ nguyên toàn bộ file để có đủ 4 hàng header
          // ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: range.s.c }, e: { r: 3, c: range.e.c } });
          
          console.log('🔍 DEBUG - Created parsedWorkbookWorking:', parsedWorkbookWorking);
          console.log('🔍 DEBUG - Worksheet data:', parsedWorkbookWorking.Sheets[parsedSheetName]);
          writeCursor = 5; // next write will start at row 5
          productCount = 0; // Reset counter when loading new template
          updateProductCounter();
          $('status').textContent = `Loaded XLSX template; working copy ready (headers preserved)`;
          
          // Hiển thị kích thước file sau khi load template
          updateFileSizeDisplay();
        } catch (err) {
          $('status').textContent = 'Failed to create working copy: ' + err.message;
        }
        saveFormState();
      };
      reader.readAsArrayBuffer(f);
    } else {
      reader.onload = (ev) => {
        try {
          const text = ev.target.result;
          parsedCsv = parseCsvText(text);
          parsedFileName = f.name.replace(/\.(xlsx|xls)$/i, '.csv');
          productCount = 0; // Reset counter when loading new CSV
          updateProductCounter();
          $('status').textContent = 'Loaded CSV with ' + parsedCsv.length + ' rows';
          saveFormState();
        } catch (err) { 
          console.error('Failed to parse CSV:', err);
          const errorMsg = err?.message || err?.toString() || 'Unknown error';
          $('status').textContent = 'Failed to parse CSV: ' + errorMsg; 
        }
      };
      reader.readAsText(f);
    }
  });
  }

  // load default color file if exists via fetch
  const colorFileUrl = chrome.runtime.getURL('temu_colors (1).txt');
  console.log('🔗 Fetching color file from:', colorFileUrl);
  fetch(colorFileUrl).then(r => {
    console.log('📥 Response status:', r.status, r.statusText);
    return r.text();
  }).then(t => { 
    console.log('📄 Raw file content length:', t.length);
    console.log('📄 First 200 chars:', t.substring(0, 200));
    const loadedColors = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    // Merge with default colors to ensure we always have basic colors
    colors = [...new Set([...colors, ...loadedColors])];
    loadColorsFromTextarea(); 
    console.log('✅ Loaded', colors.length, 'colors total');
    console.log('📋 Colors list:', colors.slice(0, 10)); // Show first 10 colors
    console.log('🔍 Checking for "Black":', colors.includes('Black'));
  }).catch((err) => {
    console.warn('⚠️ Could not load temu_colors (1).txt:', err);
    // Keep default colors (already set)
    loadColorsFromTextarea();
    console.log('📋 Using default colors:', colors);
  });

  // Test color matching after a short delay
  setTimeout(() => {
    console.log('🧪 Testing color matching...');
    console.log('Colors array length:', colors.length);
    console.log('Colors array:', colors);
    console.log('Testing "Black":', suggestColorSimple('Black'));
    console.log('Testing "black":', suggestColorSimple('black'));
    console.log('Testing "Bl":', suggestColorSimple('Bl'));
    
    // Test trực tiếp với array
    console.log('🔍 Direct test:');
    console.log('colors.includes("Black"):', colors.includes('Black'));
    console.log('colors.filter(c => c === "Black"):', colors.filter(c => c === 'Black'));
    console.log('colors.filter(c => c.toLowerCase() === "black"):', colors.filter(c => c.toLowerCase() === 'black'));
  }, 1000);

  // restore saved form state
  restoreFormState();
});
