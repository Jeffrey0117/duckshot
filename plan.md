# Dukshot 開發計劃

## 專案概述
Dukshot 是一個基於 Electron 的截圖應用程式，提供區域截圖、全螢幕截圖和視窗截圖功能。

## 當前狀態 (2025-01-29)

### ✅ 已完成功能
1. **基礎截圖功能**
   - 區域截圖 (Ctrl+PrintScreen)
   - 全螢幕截圖 (PrintScreen)
   - 視窗截圖 (Alt+PrintScreen)

2. **檔案管理**
   - 桌面圖片自動載入
   - 縮圖生成與顯示
   - 檔案排序與搜尋

3. **效能優化**
   - 批次載入機制
   - 並行縮圖處理（10個工作器）
   - 延遲載入策略

4. **已修復問題**
   - ✅ 桌面資料讀取問題
   - ✅ 縮圖載入順序問題
   - ✅ 重複通知問題
   - ✅ 只載入15個檔案的限制
   - ✅ 游標顯示問題（commit: 07be448）
   - ✅ 截圖視窗可調整大小問題（commit: 3cc180b）

## 🔴 緊急修復：截圖模糊問題

### 問題診斷 (2025-01-29)

#### 根本原因分析
重構截圖系統時，新的 capture.html 沒有正確處理高 DPI 螢幕的像素比例，導致：
1. Canvas 解析度不夠高
2. 繪製時沒有考慮 devicePixelRatio
3. 截圖時沒有正確縮放

#### 影響範圍
- 所有高 DPI 螢幕（如 4K 顯示器、MacBook Retina 顯示器）
- 導致截圖品質下降，文字模糊

### 解決方案

#### 1. Canvas DPI 感知設定
```javascript
setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  
  // 設定實際解析度（考慮 DPI）
  this.canvas.width = screenWidth * dpr;
  this.canvas.height = screenHeight * dpr;
  
  // 設定 CSS 顯示尺寸
  this.canvas.style.width = screenWidth + 'px';
  this.canvas.style.height = screenHeight + 'px';
  
  // 縮放 context 以匹配 DPI
  this.ctx.scale(dpr, dpr);
}
```

#### 2. 正確載入高解析度螢幕圖片
```javascript
loadScreenImage(screenData) {
  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    
    // 清除並重設 canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 保存當前狀態
    this.ctx.save();
    
    // 重置縮放（因為 canvas 已經是高解析度）
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // 關閉圖片平滑（保持銳利）
    this.ctx.imageSmoothingEnabled = false;
    
    // 繪製完整解析度圖片
    this.ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      0, 0, this.canvas.width, this.canvas.height
    );
    
    // 恢復狀態
    this.ctx.restore();
    
    // 重新設定縮放以便後續操作
    this.ctx.scale(dpr, dpr);
  };
  img.src = screenData;
}
```

#### 3. 截圖時正確處理 DPI
```javascript
async saveScreenshot() {
  if (!this.selection) return;
  
  const dpr = window.devicePixelRatio || 1;
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  
  // 設定正確的解析度
  tempCanvas.width = this.selection.width * dpr;
  tempCanvas.height = this.selection.height * dpr;
  
  // 關閉圖片平滑
  tempCtx.imageSmoothingEnabled = false;
  
  // 從高解析度 canvas 擷取
  tempCtx.drawImage(
    this.canvas,
    this.selection.x * dpr,
    this.selection.y * dpr,
    this.selection.width * dpr,
    this.selection.height * dpr,
    0,
    0,
    tempCanvas.width,
    tempCanvas.height
  );
  
  const imageData = tempCanvas.toDataURL('image/png');
  // ... 儲存邏輯
}
```

### 實施步驟

1. **立即修復（高優先級）**
   - [ ] 更新 capture.html 的 Canvas 初始化
   - [ ] 修正圖片載入邏輯
   - [ ] 修正截圖儲存邏輯

2. **測試驗證**
   - [ ] 在高 DPI 螢幕測試（如 4K 顯示器）
   - [ ] 在標準 DPI 螢幕測試
   - [ ] 確認文字銳利度
   - [ ] 確認圖片品質

3. **優化項目**
   - [ ] 加入 DPI 偵測顯示
   - [ ] 提供品質選項（高品質/標準）
   - [ ] 優化記憶體使用

### 技術細節

#### DPI 相關常數
```javascript
const DPI_CONFIG = {
  // 獲取實際 DPI
  getDevicePixelRatio: () => window.devicePixelRatio || 1,
  
  // 檢查是否為高 DPI
  isHighDPI: () => (window.devicePixelRatio || 1) > 1,
  
  // 獲取最佳縮圖尺寸
  getOptimalSize: () => {
    const dpr = window.devicePixelRatio || 1;
    return {
      width: window.screen.width * dpr,
      height: window.screen.height * dpr
    };
  }
};
```

#### 除錯資訊
```javascript
console.log('=== DPI 診斷 ===');
console.log('Device Pixel Ratio:', window.devicePixelRatio);
console.log('螢幕尺寸:', window.screen.width, 'x', window.screen.height);
console.log('Canvas 尺寸:', canvas.width, 'x', canvas.height);
console.log('CSS 尺寸:', canvas.style.width, canvas.style.height);
```

## 區域截圖增強功能

### 已完成
- ✅ 選區邊線調整功能（8個控制點）
- ✅ 游標正確顯示（move/resize）
- ✅ 整數對齊避免模糊

### 待優化
- 提高輔助線可見度
- 加入視覺化控制點
- 優化邊線檢測精確度

## 實施時程

| 任務 | 預計時間 | 優先級 | 狀態 |
|------|---------|--------|------|
| 修復截圖模糊問題 | 45分鐘 | 🔴 緊急 | 進行中 |
| DPI 感知 Canvas | 20分鐘 | 高 | 待處理 |
| 高解析度圖片處理 | 15分鐘 | 高 | 待處理 |
| 測試驗證 | 30分鐘 | 高 | 待處理 |

## 更新記錄

- 2025-01-27：完成桌面資料讀取修復
- 2025-01-27：新增區域截圖功能改進計劃
- 2025-01-28：實作基礎邊線調整功能（commit: d7ae775）
- 2025-01-28：修復游標顯示問題（commit: 07be448）
- 2025-01-29：修復截圖視窗可調整大小問題（commit: 3cc180b）
- 2025-01-29：發現並診斷截圖模糊問題（DPI 處理不當）