# 截圖畫質優化專案

## 新任務：截圖畫質問題分析與優化

### 問題描述
使用者回報截圖畫質偏低，特別是在區域截圖選取的時間點就感覺畫質發生變化。需要分析可能原因並提出優化方案。

---

## 畫質問題可能性分析

### 1. Canvas 解析度與 DPI 問題

#### 1.1 設備像素比例 (devicePixelRatio) 處理
**目前實現：**
```javascript
this.canvas.width = window.screen.width;
this.canvas.height = window.screen.height;
```

**潛在問題：**
- 未考慮高 DPI 螢幕的像素密度
- 現代螢幕常見 1.25x、1.5x、2x 等縮放比例
- Canvas 解析度可能低於實際顯示需求

**診斷方法：**
```javascript
console.log('devicePixelRatio:', window.devicePixelRatio);
console.log('screen size:', window.screen.width, 'x', window.screen.height);
console.log('canvas size:', this.canvas.width, 'x', this.canvas.height);
```

#### 1.2 Canvas 縮放導致的品質損失
**可能問題：**
- Canvas 尺寸與顯示尺寸不匹配
- 瀏覽器進行縮放插值導致模糊
- CSS transform 影響渲染品質

### 2. 截圖來源品質問題

#### 2.1 Electron desktopCapturer API 限制
**檢查項目：**
```javascript
// 目前的截圖獲取方式
const sources = await desktopCapturer.getSources({
  types: ['screen'],
  thumbnailSize: { width: 1920, height: 1080 } // 可能限制了解析度
});
```

**潛在問題：**
- `thumbnailSize` 設置可能低於螢幕實際解析度
- API 預設壓縮算法影響品質
- 多螢幕環境下的解析度選擇問題

#### 2.2 圖片編碼與壓縮
**檢查點：**
- 從 desktopCapturer 獲得的圖片格式和品質
- 是否經過多次編碼/解碼過程
- Canvas toDataURL 的品質參數設置

### 3. 渲染流程品質損失

#### 3.1 Image 載入與繪製
**目前流程：**
```javascript
const img = new Image();
img.onload = () => {
  this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
};
img.src = screenData; // base64 data URL
```

**潛在問題：**
- 圖片縮放算法選擇 (nearest-neighbor vs bilinear vs bicubic)
- Canvas 繪製時的抗鋸齒設置
- 圖片尺寸與 Canvas 尺寸不匹配的縮放

#### 3.2 Canvas 渲染設置
**需要檢查的設置：**
```javascript
// 圖片平滑度設置
this.ctx.imageSmoothingEnabled = true/false;
this.ctx.imageSmoothingQuality = 'low'/'medium'/'high';

// 像素對齊
this.ctx.translate(0.5, 0.5); // 可能影響清晰度
```

### 4. 瀏覽器渲染引擎問題

#### 4.1 硬體加速
**檢查項目：**
- GPU 硬體加速是否啟用
- Canvas 是否使用 GPU 渲染
- 記憶體限制導致的品質降級

#### 4.2 色彩空間與位元深度
**可能影響：**
- sRGB vs P3 色彩空間轉換
- 8-bit vs 10-bit 色彩深度
- 色彩設定檔不匹配

---

## 診斷計畫

### Phase 1: 基礎資訊收集
1. **螢幕環境檢測**
   ```javascript
   const diagnostics = {
     devicePixelRatio: window.devicePixelRatio,
     screenSize: { width: window.screen.width, height: window.screen.height },
     viewportSize: { width: window.innerWidth, height: window.innerHeight },
     colorDepth: window.screen.colorDepth,
     pixelDepth: window.screen.pixelDepth
   };
   ```

2. **Canvas 狀態檢查**
   ```javascript
   console.log('Canvas 實際尺寸:', this.canvas.width, 'x', this.canvas.height);
   console.log('Canvas CSS 尺寸:', this.canvas.style.width, this.canvas.style.height);
   console.log('圖片平滑設置:', this.ctx.imageSmoothingEnabled);
   ```

### Phase 2: 截圖來源品質測試
1. **提高 thumbnailSize 解析度**
   ```javascript
   const sources = await desktopCapturer.getSources({
     types: ['screen'],
     thumbnailSize: { 
       width: window.screen.width * window.devicePixelRatio,
       height: window.screen.height * window.devicePixelRatio
     }
   });
   ```

2. **比較不同品質設置**
   - 測試不同的 thumbnailSize 參數
   - 檢查原始圖片 vs 處理後的差異

### Phase 3: Canvas 最佳化測試
1. **DPI 感知的 Canvas 設置**
   ```javascript
   const dpr = window.devicePixelRatio || 1;
   this.canvas.width = window.screen.width * dpr;
   this.canvas.height = window.screen.height * dpr;
   this.canvas.style.width = window.screen.width + 'px';
   this.canvas.style.height = window.screen.height + 'px';
   this.ctx.scale(dpr, dpr);
   ```

2. **圖片渲染品質優化**
   ```javascript
   this.ctx.imageSmoothingEnabled = false; // 測試關閉平滑
   // 或
   this.ctx.imageSmoothingQuality = 'high'; // 測試最高品質
   ```

---

## 優化方案

### 方案 1: DPI 感知的 Canvas 系統
**實施重點：**
- 根據 devicePixelRatio 調整 Canvas 解析度
- 確保 Canvas 物理尺寸與顯示尺寸匹配
- 優化圖片繪製的縮放算法

### 方案 2: 高品質截圖源
**實施重點：**
- 動態調整 desktopCapturer 的 thumbnailSize
- 避免不必要的圖片壓縮
- 選擇最佳的圖片格式和編碼參數

### 方案 3: 渲染管線優化
**實施重點：**
- 優化 Canvas 渲染設置
- 減少圖片處理環節
- 確保像素對齊和清晰度

---

## 測試驗證方法

### 1. A/B 對比測試
- 同一螢幕內容的優化前後對比
- 不同解析度螢幕的測試
- 不同縮放比例的測試

### 2. 客觀品質測量
- 使用 Canvas 檢查像素精確度
- 比較截圖與原始螢幕的差異
- 測量色彩準確度

### 3. 主觀品質評估
- 文字清晰度測試
- 圖片細節保留測試  
- 邊緣銳利度評估

---

## 實施優先順序

### 高優先級
1. **DPI 診斷和修復** - 最可能的畫質問題來源
2. **Canvas 解析度優化** - 基礎設施改善
3. **截圖源品質檢查** - 源頭品質確保

### 中優先級
1. **渲染設置最佳化** - 細節品質改善
2. **圖片處理流程優化** - 減少品質損失

### 低優先級
1. **進階色彩管理** - 專業級別優化
2. **硬體加速利用** - 效能與品質平衡

---

## 預期效果

完成優化後，截圖品質將具備：
- **高解析度支援**：完整支援高 DPI 螢幕
- **無損品質**：截圖品質接近原始螢幕顯示
- **一致性**：不同環境下穩定的品質表現
- **即時性**：品質提升不影響截圖速度

---

## 實施記錄

### 待實施項目
- [ ] 螢幕環境診斷
- [ ] Canvas DPI 適配
- [ ] 截圖源品質優化
- [ ] 渲染設置調整
- [ ] 測試驗證

### 實施結果記錄
*此區域將在實施過程中更新*

---

**注意：** 畫質優化是一個系統性工程，需要從多個角度同時改善，逐步測試並驗證效果。