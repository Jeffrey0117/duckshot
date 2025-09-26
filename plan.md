# 截圖視覺體驗問題分析

## 問題描述
使用者回報在截圖過程中，選區外的暗化區域可能出現模糊效果，影響了截圖體驗。

## 當前截圖流程分析

### 1. 視覺層級結構
```
背景圖片 (Canvas) 
  └── 遮罩層 (Canvas) - rgba(0,0,0,0.7) 暗化
      └── 選區挖洞 (destination-out) - 透明區域
      └── 延伸線 (虛線) - rgba(255,255,255,0.3)
```

### 2. CSS 濾鏡效果檢查
目前工具列使用：
```css
.capture-toolbar {
  backdrop-filter: blur(8px);  /* 可能的模糊來源 */
}

.capture-btn {
  backdrop-filter: blur(4px);  /* 可能的模糊來源 */
}
```

### 3. 潛在模糊原因分析

#### A. backdrop-filter 影響範圍
- 工具列的 `backdrop-filter: blur(8px)` 可能影響整體視覺
- 按鈕的 `backdrop-filter: blur(4px)` 可能疊加效果

#### B. Canvas 渲染品質
- Canvas 的縮放比例是否正確設置
- 高 DPI 螢幕的像素密度處理

#### C. 遮罩透明度疊加
- 多層半透明效果可能造成視覺模糊感
- rgba(0,0,0,0.7) 的暗化可能過重

## 問題識別重點

### 需要確認的技術細節：

1. **backdrop-filter 是否過度使用？**
   - 工具列模糊效果是否必要
   - 是否影響到選區外的整體視覺

2. **Canvas 解析度設置**
   ```javascript
   this.canvas.width = window.screen.width;
   this.canvas.height = window.screen.height;
   ```
   - 是否考慮 devicePixelRatio
   - 是否造成圖像縮放模糊

3. **遮罩透明度**
   - 0.7 的透明度是否過重
   - 是否需要動態調整

## 建議的診斷步驟

### Phase 1: 隔離測試
1. **移除所有 backdrop-filter 效果**
   - 測試是否解決模糊問題
   - 確認影響範圍

2. **調整遮罩透明度**
   - 測試 0.5, 0.6, 0.7 不同透明度
   - 找到最佳視覺平衡點

3. **Canvas DPI 檢查**
   - 檢查高解析度螢幕的處理
   - 確保 1:1 像素對應

### Phase 2: 使用者體驗測試
1. **不同螢幕解析度測試**
   - 1080p, 1440p, 4K
   - 不同 DPI 設置

2. **不同背景內容測試**
   - 亮色背景（文檔）
   - 暗色背景（程式碼）
   - 高對比背景（圖片）

## 技術解決方案

### 方案 1: 移除 backdrop-filter
```css
.capture-toolbar {
  /* backdrop-filter: blur(8px); 移除 */
  background: rgba(0, 0, 0, 0.8); /* 提高不透明度補償 */
}

.capture-btn {
  /* backdrop-filter: blur(4px); 移除 */
  background: rgba(255, 255, 255, 0.15); /* 略微調整 */
}
```

### 方案 2: 優化 Canvas DPI 處理
```javascript
const dpr = window.devicePixelRatio || 1;
this.canvas.width = window.screen.width * dpr;
this.canvas.height = window.screen.height * dpr;
this.canvas.style.width = window.screen.width + 'px';
this.canvas.style.height = window.screen.height + 'px';
this.ctx.scale(dpr, dpr);
```

### 方案 3: 調整遮罩透明度
```javascript
// 動態透明度，根據背景亮度調整
this.maskCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // 降低到 0.5
```

## 使用者回饋重點

### 需要確認的問題：
1. 模糊現象在哪個階段最明顯？
   - 拖拽選區時
   - 選區確定後
   - 工具列顯示時

2. 模糊影響範圍？
   - 只有選區外暗化區域
   - 整個螢幕
   - 特定區域

3. 螢幕環境？
   - 螢幕解析度
   - 縮放比例設置
   - 瀏覽器類型

## 下一步行動計畫

1. **立即診斷** - 移除 backdrop-filter 測試
2. **透明度調整** - 降低遮罩透明度到 0.5
3. **DPI 優化** - 實作高解析度螢幕支援
4. **使用者驗證** - 確認改善效果

---

**重要提醒：** 截圖工具的視覺清晰度是核心體驗，任何模糊效果都會直接影響使用者對截圖品質的感知。優先解決這個問題。