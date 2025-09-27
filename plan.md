# Dukshot 應用程式改善計劃

## 最新優化需求（2025-09-28 01:00）

### 問題 1：載入速度仍需優化
**用戶反饋**：「這是最快的了嗎」

**當前效能分析**：
- 初始載入 50 個檔案（總共 79 個）
- 每個縮圖載入需要約 50-100ms
- 串行載入導致總時間過長

**優化方案**：

#### A. 極速初始載入（零延遲策略）
1. **完全跳過同步 stat 檢查**
   - 只使用檔名和路徑
   - stat 資訊延後載入
   - 預估可節省 30-40% 時間

2. **並行批次處理**
   - 初始 50 個檔案分成 5 批，每批 10 個
   - 並行處理每批
   - 預估提升 3-5 倍速度

3. **縮圖延遲策略**
   - 完全移除初始縮圖載入
   - 使用純 CSS 佔位符
   - 只在滾動到視圖時載入

#### B. 重複通知問題修復
**問題**：「載入的通知顯示兩次」

**原因分析**：
- list-screenshots 被呼叫多次
- 可能是初始化和重新整理重複觸發

**解決方案**：
1. 加入載入狀態管理，避免重複呼叫
2. 實施防抖動機制
3. 統一載入入口點

### 優化實施計畫

#### 第一階段：即時顯示（目標：< 100ms）
```javascript
// 超快速檔案清單（跳過 stat）
async function getFastFileList(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const imageFiles = entries
    .filter(e => e.isFile() && /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(e.name))
    .map(e => ({
      id: e.name,
      name: e.name,
      path: path.join(dir, e.name),
      thumbnail: null,  // 完全延遲
      needsLoad: true
    }));
  return imageFiles;
}
```

#### 第二階段：智慧載入（視圖驅動）
```javascript
// IntersectionObserver 實現
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && entry.target.dataset.needsLoad) {
      loadThumbnail(entry.target.dataset.path);
      entry.target.dataset.needsLoad = false;
    }
  });
}, { 
  rootMargin: '50px',  // 預載入邊界
  threshold: 0.01 
});
```

#### 第三階段：預測載入
- 基於捲動方向預測下一批
- 背景預載入可能查看的檔案
- 智慧快取管理

### 效能目標
| 指標 | 當前 | 目標 | 改善幅度 |
|------|------|------|---------|
| 初始顯示時間 | 2-3秒 | < 0.1秒 | 95%+ |
| 首批縮圖載入 | 5-8秒 | < 1秒 | 80%+ |
| 完整載入時間 | 15-20秒 | < 5秒 | 70%+ |
| 記憶體使用 | 300MB | < 200MB | 33%+ |

### 防止重複載入機制
```javascript
class LoadingManager {
  constructor() {
    this.isLoading = false;
    this.lastLoadTime = 0;
    this.minInterval = 1000; // 最小間隔 1 秒
  }
  
  canLoad() {
    const now = Date.now();
    if (this.isLoading) return false;
    if (now - this.lastLoadTime < this.minInterval) return false;
    return true;
  }
  
  startLoad() {
    if (!this.canLoad()) return false;
    this.isLoading = true;
    this.lastLoadTime = Date.now();
    return true;
  }
  
  endLoad() {
    this.isLoading = false;
  }
}
```

### 實施步驟

#### 立即修復（5 分鐘）
1. ✅ 修復重複載入通知
2. ✅ 加入載入狀態管理
3. ✅ 防抖動機制

#### 快速優化（30 分鐘）
1. ⏳ 移除同步 stat 呼叫
2. ⏳ 實施並行批次載入
3. ⏳ 優化初始渲染

#### 深度優化（2 小時）
1. ⏳ 實施 IntersectionObserver
2. ⏳ 加入預測載入
3. ⏳ 優化快取策略

---

## 當前問題診斷（2025-09-28 更新）
根據最新測試結果，縮圖載入系統存在以下核心問題：

### 1. 縮圖無限載入問題
- **症狀**：縮圖一直處於載入狀態，永遠不顯示實際圖片
- **原因分析**：
  - `thumbnailLoaded` 事件觸發了整個網格的重新渲染
  - 每次重渲染導致 DOM 元素重建，縮圖狀態被重置
  - 形成無限循環：載入縮圖 → 觸發更新 → DOM重建 → 重新載入縮圖

### 2. UI 不斷閃爍問題
- **症狀**：介面持續閃爍，使用者體驗極差
- **原因分析**：
  - `updateImageGrid` 使用 `innerHTML = ""` 清空整個網格
  - 每個縮圖載入都觸發整頁重繪
  - 批次更新機制（100ms）仍然過於頻繁

### 3. 效能瓶頸
- **症狀**：載入速度慢，系統反應遲鈍
- **原因分析**：
  - 並行載入太多導致系統過載
  - IPC 呼叫過於密集
  - 缺乏智慧型快取策略

## 改善策略

### 策略 1：實現真正的局部更新（優先級：最高）
**目標**：避免整個網格重新渲染，只更新單個圖片元素

**實施方案**：
```javascript
// fileManager.js - 修改縮圖載入完成的事件
this.eventEmitter.emit("thumbnailLoaded", file);

// ui.js - 新增局部更新方法
updateSingleThumbnail(file) {
  const item = document.querySelector(`[data-image-id="${file.id}"]`);
  if (item) {
    const img = item.querySelector("img");
    if (img && file.thumbnail) {
      img.src = file.thumbnail;
      img.style.display = "block";
      item.querySelector(".file-thumbnail").classList.remove("loading");
    }
  }
}

// main.js - 改為局部更新
this.fileManager.on("thumbnailLoaded", (file) => {
  this.ui.updateSingleThumbnail(file);
});
```

### 策略 2：分離資料與顯示邏輯（優先級：高）
**目標**：避免 DOM 操作觸發資料重載

**實施方案**：
1. 初次載入時建立完整 DOM 結構
2. 縮圖使用佔位符（placeholder）
3. 縮圖載入後只更新 `src` 屬性
4. 使用 data 屬性追蹤載入狀態

### 策略 3：實現兩階段載入（優先級：高）
**目標**：快速顯示基本結構，漸進式載入縮圖

**第一階段**：立即顯示
- 檔案名稱
- 檔案大小
- 載入中的佔位符

**第二階段**：背景載入
- 使用 IntersectionObserver 實現懶載入
- 只載入可視區域內的縮圖
- 滾動時動態載入新縮圖

### 策略 4：優化事件處理（優先級：中）
**目標**：減少不必要的事件觸發和處理

**實施方案**：
```javascript
// 使用單一批次更新機制
class ThumbnailBatcher {
  constructor() {
    this.pending = new Map();
    this.timer = null;
  }
  
  add(file) {
    this.pending.set(file.id, file);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 500);
    }
  }
  
  flush() {
    if (this.pending.size > 0) {
      this.pending.forEach(file => {
        updateSingleThumbnail(file);
      });
      this.pending.clear();
    }
    this.timer = null;
  }
}
```

### 策略 5：實現虛擬滾動（優先級：中）
**目標**：大量檔案時保持效能

**實施方案**：
- 只渲染可視區域的檔案項目
- 使用固定高度容器和絕對定位
- 計算滾動位置動態顯示內容

## 具體實施步驟

### 第一步：停用全網格更新
1. 移除 `thumbnailLoaded` 事件的全網格更新
2. 實現 `updateSingleThumbnail` 方法
3. 測試單一縮圖更新是否正常

### 第二步：改善初始載入
1. 修改 `createImageCard` 使用預設載入圖片
2. 設定 `loading="lazy"` 屬性
3. 使用 CSS 動畫替代 JavaScript 動畫

### 第三步：實現智慧型載入
1. 加入 IntersectionObserver
2. 優先載入可視區域
3. 延遲載入非可視區域

### 第四步：優化 IPC 通訊
1. 批次請求縮圖
2. 實現請求去重
3. 加入請求優先級

### 第五步：改善快取策略
1. 使用 IndexedDB 儲存縮圖
2. 實現過期策略
3. 預載入常用縮圖

## 測試檢查清單
- [ ] 縮圖能正常顯示
- [ ] 無閃爍現象
- [ ] 載入通知只顯示一次
- [ ] 滾動流暢
- [ ] 記憶體使用穩定
- [ ] CPU 使用率合理

## 預期成果
1. **立即改善**：停止閃爍，縮圖能正常顯示
2. **短期改善**：載入速度提升 50%
3. **長期改善**：支援 1000+ 檔案流暢瀏覽

## 實施優先順序
1. **緊急**：修復無限載入循環（策略1）
2. **重要**：實現兩階段載入（策略3）
3. **優化**：虛擬滾動和快取（策略5）

## 時間估算
- 緊急修復：1-2 小時
- 基本優化：2-3 小時
- 完整優化：4-6 小時

## 注意事項
- 保持向後相容性
- 每步驟都要測試
- 記錄效能指標
- 準備回滾方案

---

## 截圖畫質優化專案（原有內容）

### 新任務：截圖畫質問題分析與優化

#### 問題描述
使用者回報截圖畫質偏低，特別是在區域截圖選取的時間點就感覺畫質發生變化。需要分析可能原因並提出優化方案。

---

### 畫質問題可能性分析

#### 1. Canvas 解析度與 DPI 問題

##### 1.1 設備像素比例 (devicePixelRatio) 處理
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

##### 1.2 Canvas 縮放導致的品質損失
**可能問題：**
- Canvas 尺寸與顯示尺寸不匹配
- 瀏覽器進行縮放插值導致模糊
- CSS transform 影響渲染品質

#### 2. 截圖來源品質問題

##### 2.1 Electron desktopCapturer API 限制
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

##### 2.2 圖片編碼與壓縮
**檢查點：**
- 從 desktopCapturer 獲得的圖片格式和品質
- 是否經過多次編碼/解碼過程
- Canvas toDataURL 的品質參數設置

#### 3. 渲染流程品質損失

##### 3.1 Image 載入與繪製
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

##### 3.2 Canvas 渲染設置
**需要檢查的設置：**
```javascript
// 圖片平滑度設置
this.ctx.imageSmoothingEnabled = true/false;
this.ctx.imageSmoothingQuality = 'low'/'medium'/'high';

// 像素對齊
this.ctx.translate(0.5, 0.5); // 可能影響清晰度
```

#### 4. 瀏覽器渲染引擎問題

##### 4.1 硬體加速
**檢查項目：**
- GPU 硬體加速是否啟用
- Canvas 是否使用 GPU 渲染
- 記憶體限制導致的品質降級

##### 4.2 色彩空間與位元深度
**可能影響：**
- sRGB vs P3 色彩空間轉換
- 8-bit vs 10-bit 色彩深度
- 色彩設定檔不匹配

---

### 診斷計畫

#### Phase 1: 基礎資訊收集
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

#### Phase 2: 截圖來源品質測試
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

#### Phase 3: Canvas 最佳化測試
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

### 優化方案

#### 方案 1: DPI 感知的 Canvas 系統
**實施重點：**
- 根據 devicePixelRatio 調整 Canvas 解析度
- 確保 Canvas 物理尺寸與顯示尺寸匹配
- 優化圖片繪製的縮放算法

#### 方案 2: 高品質截圖源
**實施重點：**
- 動態調整 desktopCapturer 的 thumbnailSize
- 避免不必要的圖片壓縮
- 選擇最佳的圖片格式和編碼參數

#### 方案 3: 渲染管線優化
**實施重點：**
- 優化 Canvas 渲染設置
- 減少圖片處理環節
- 確保像素對齊和清晰度

---

### 測試驗證方法

#### 1. A/B 對比測試
- 同一螢幕內容的優化前後對比
- 不同解析度螢幕的測試
- 不同縮放比例的測試

#### 2. 客觀品質測量
- 使用 Canvas 檢查像素精確度
- 比較截圖與原始螢幕的差異
- 測量色彩準確度

#### 3. 主觀品質評估
- 文字清晰度測試
- 圖片細節保留測試  
- 邊緣銳利度評估

---

### 實施優先順序

#### 高優先級
1. **DPI 診斷和修復** - 最可能的畫質問題來源
2. **Canvas 解析度優化** - 基礎設施改善
3. **截圖源品質檢查** - 源頭品質確保

#### 中優先級
1. **渲染設置最佳化** - 細節品質改善
2. **圖片處理流程優化** - 減少品質損失

#### 低優先級
1. **進階色彩管理** - 專業級別優化
2. **硬體加速利用** - 效能與品質平衡

---

### 預期效果

完成優化後，截圖品質將具備：
- **高解析度支援**：完整支援高 DPI 螢幕
- **無損品質**：截圖品質接近原始螢幕顯示
- **一致性**：不同環境下穩定的品質表現
- **即時性**：品質提升不影響截圖速度

---

### 實施記錄

#### 待實施項目
- [x] 螢幕環境診斷（DPR/色深/視窗尺寸）於 [renderer/capture.html](renderer/capture.html)
- [x] Canvas DPI 適配（實際像素=CSS像素×DPR，1:1 繪製）於 [renderer/capture.html](renderer/capture.html)
- [x] 截圖源品質優化（依顯示器 scaleFactor 動態計算 thumbnailSize）於 [src/main.js](src/main.js)
- [x] 渲染設置調整（imageSmoothingEnabled 可切換、Quality 高/低；切換即時重繪避免插值殘留）於 [renderer/capture.html](renderer/capture.html)
- [ ] 測試驗證（多螢幕縮放情境實測、A/B 對比樣本彙整）

#### 實施結果記錄
- DPI 診斷與高 DPI 擷取
  - 新增 diagnoseDPI 與 DPI 感知 Canvas 設定，Canvas 物理尺寸隨 DPR 調整並以 ctx.scale 對齊，避免縮放插值
  - 遮罩採雙 Canvas，選區內用 destination-out 完全挖空確保不變暗（[renderer/capture.html](renderer/capture.html)）
- 來源解析度提升
  - desktopCapturer thumbnailSize 依顯示器 scaleFactor 計算，顯著提高來源清晰度（[src/main.js](src/main.js)）
- 區域裁切與剪貼簿輸出
  - 裁切時以 DPR 計算 srcX/Y/Width/Height，輸出與來源像素 1:1（[renderer/capture.html](renderer/capture.html)）
- 影像平滑策略 A/B
  - 平滑預設關閉（文字更銳利），支援 F6/工具列按鈕切換；切換時即時重繪背景以避免舊插值殘留
  - 右上角徽章「平滑：開/關」淡入顯示，1.5s 自動淡出（[renderer/capture.html](renderer/capture.html)）
- UX 強化
  - 工具列加入平滑切換按鈕，初始化與顯示時同步 active 與 title
  - 說明文字補齊快捷鍵：Esc 取消、右鍵重抓/取消、F6 平滑、Enter 儲存、Ctrl+C 複製

#### 下一步驗證與輸出
- 多螢幕與縮放比（100%/125%/150%/200%）實測記錄螢幕診斷與截圖樣本
- 準備 A/B 對比集（平滑開/關、HiDPI 開/關），彙整到 README 或 docs
- 回寫結論與最佳參數至本計畫（例如：HiDPI=開、Smoothing=關 為文字場景預設）

---

**注意：** 畫質優化是一個系統性工程，需要從多個角度同時改善，逐步測試並驗證效果。

## 新規劃與優先事項（更新 2025-09-27）

- 已完成新增
  - 預覽固定關閉平滑：確保文字最銳利（見 [loadScreenImage](renderer/capture.html:469)、[toggleSmoothing](renderer/capture.html:1091)）
  - 選區整數對齊（部分）：MouseUp/拖曳整數化（[onMouseUp](renderer/capture.html:684)、[updateDragPosition](renderer/capture.html:578)），導出座標四捨五入（[generateSelectionDataURL](renderer/capture.html:943)）

- 近期可持續畫質優化項（可逐步實作）
  1) 選區動態顯示整數對齊
     - 在動態框選過程（[updateSelection](renderer/capture.html:847)）立即整數化 x/y/width/height，避免半像素鋸齒。
  2) 多螢幕來源精準匹配
     - 依滑鼠所在顯示器選對 source 與 scaleFactor，避免預設 sources[0]（主程式 [src/main.js](src/main.js) 調整）。
  3) PNG 中繼資料（pHYs、sRGB/gAMA/cHRM）
     - 寫入像素密度和色彩校正，避免外部檢視器誤縮放/偏色（主程式 save 邏輯）。
  4) JPEG 導出與品質
     - 文字預設 PNG；照片情境提供 JPEG 品質（0.85/0.92），並對應平滑策略（[confirmCapture](renderer/capture.html:966) 與主程式對應）。
  5) 2x/等比縮放導出
     - 小區塊可 2x 圖，先 1:1 取樣再等比放大，確保清晰。
  6) 分數 DPR 1.25/1.5/1.75
     - 全鏈路四捨五入策略與日誌驗證（座標×DPR 後再 Math.round）。

---

## 新任務：選區邊線可調整（先實作）

使用者目標：選取完成後，支援用滑鼠拖曳四邊與四角，動態調整矩形大小。左右邊只改 x/width，上下邊只改 y/height；整數對齊，並即時更新遮罩、格線與尺寸標示。

設計要點
- 互動區域（Hit Test）
  - 邊線熱區寬度 6~8px；角落熱區 10~12px。
  - 游標樣式：左右邊（ew-resize）、上下邊（ns-resize）、四角（nwse-nesw / 對應角）。
- 狀態機
  - idle → selecting（框選中）→ selected（框選完成）→ resizing（邊/角拖曳中）
  - 狀態變數：isResizing、resizeEdge（'left'|'right'|'top'|'bottom'|'top-left'|'top-right'|'bottom-left'|'bottom-right'）
- 幾何更新
  - 拖曳中以 Math.round 對齊，確保 width/height ≥ 1。
  - 變更 x/width 或 y/height 後，立即呼叫 [updateSelectionVisuals](renderer/capture.html:618) 與 [updateVisualEffects](renderer/capture.html:871)。
- 工具列位置
  - 重算並避免出界（沿用既有 [showToolbar](renderer/capture.html:911) 邏輯）。

實作規格（預計變更點）
- 檔案：renderer/capture.html
  - 新增成員：isResizing、resizeEdge、resizeStart（滑鼠起點）、regionStart（初始矩形）
  - 新增方法：
    - hitTestEdge(x,y) → 回傳邊/角或 null
    - beginResize(edge, event)
    - updateResize(event) → 計算新矩形（整數對齊、邊界約束）
    - endResize()
  - 事件插入：
    - onMouseDown：在 selected 狀態下優先 hitTestEdge → beginResize；否則沿用拖曳/重新框選
    - onMouseMove：若 isResizing → updateResize；否則更新游標樣式
    - onMouseUp：若 isResizing → endResize
- 互動細節
  - 邊界檢查避免負 width/height；當拖過另一側時自動翻面（left/right 或 top/bottom 交換）
  - 更新游標樣式：document.body.style.cursor = 'ew-resize'|'ns-resize'|'nwse-resize'|'nesw-resize'
- 影響區域
  - 不變更導出流程；完成後仍以 [generateSelectionDataURL](renderer/capture.html:943) 產出

驗收標準
- 已選取矩形後，游標靠近邊/角會變更樣式
- 拖曳邊/角可即時改變矩形，尺寸標示與格線同步更新
- 工具列位置跟隨新矩形並不出界
- 全程整數對齊，無半像素模糊