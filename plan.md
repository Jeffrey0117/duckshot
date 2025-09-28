# Dukshot 截圖工具開發計畫

## 專案概述
Dukshot 是一個跨平台的截圖工具，使用 Electron 開發，提供區域截圖、全螢幕截圖和視窗截圖等功能。

## 已完成功能
- ✅ 基本截圖功能（區域、全螢幕、視窗）
- ✅ 快捷鍵支援
- ✅ 主視窗界面
- ✅ 檔案管理器
- ✅ 設定系統
- ✅ 高 DPI 螢幕支援
- ✅ 區域截圖邊線調整功能（8個控制點）
- ✅ 截圖游標顯示修正
- ✅ 截圖視窗無法調整大小修正
- ✅ 高 DPI 螢幕截圖模糊問題修正
- ✅ 全螢幕截圖避免重複擷取

## 當前任務
### 1. 工具列自動重新定位
- **問題描述**：移動或調整截圖區域時，工具列位置沒有跟隨更新
- **解決方案**：
  - 在拖曳選取區域時觸發工具列重新定位
  - 在調整大小時觸發工具列重新定位
  - 確保工具列始終在可視範圍內

### 2. 圖片上傳功能
- **新增按鈕**：在工具列添加「上傳」按鈕
- **API 整合**：使用提供的 urusai.cc API
  - URL: `https://api.urusai.cc/v1/upload`
  - TOKEN: 已提供
  - 參數：file, token, r18
- **功能流程**：
  1. 點擊上傳按鈕
  2. 將截圖轉換為 Blob/File
  3. 透過 FormData 上傳
  4. 顯示上傳進度
  5. 返回結果顯示

### 3. 上傳結果彈窗 UX 設計
- **載入狀態**：
  - 顯示上傳進度條或載入動畫
  - 禁用其他操作按鈕
  - 顯示「正在上傳...」提示

- **成功狀態**：
  - 顯示縮圖預覽
  - 提供三種連結：
    - 預覽連結（可複製）
    - 直連連結（可複製）  
    - 刪除連結（可複製）
  - 快速複製按鈕
  - 自動複製直連到剪貼簿
  - 顯示成功訊息（綠色）

- **失敗狀態**：
  - 顯示錯誤訊息（紅色）
  - 提供重試按鈕
  - 保持截圖不關閉

- **彈窗樣式**：
  - 半透明黑色背景遮罩
  - 居中顯示的白色卡片
  - 圓角設計
  - 適當的陰影效果
  - 動畫過渡效果（淡入淡出）

## 技術實現細節

### 工具列重新定位
```javascript
// 在 onMouseMove 中添加
if (this.isDraggingSelection || this.isResizing) {
  this.updateToolbarPosition();
}

// 新增方法
updateToolbarPosition() {
  if (!this.selection || !this.toolbar) return;
  // 計算新位置
  // 確保在可視範圍內
}
```

### 上傳功能實現
```javascript
// 新增上傳方法
async uploadScreenshot() {
  const blob = await this.canvasToBlob();
  const formData = new FormData();
  formData.append('file', blob, 'screenshot.png');
  formData.append('token', TOKEN);
  formData.append('r18', '0');
  
  // 顯示載入狀態
  this.showUploadModal('loading');
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    
    if (data.status === 'success') {
      this.showUploadModal('success', data.data);
    } else {
      this.showUploadModal('error', data.message);
    }
  } catch (error) {
    this.showUploadModal('error', error.message);
  }
}
```

## 檔案結構
```
dukshot/
├── src/
│   ├── main.js          # 主進程（已優化）
│   └── preload.js       # 預載腳本
├── renderer/
│   ├── index.html       # 主界面
│   ├── capture.html     # 截圖界面（需更新）
│   ├── css/
│   └── js/
│       └── capture.js   # 截圖邏輯（需更新）
└── assets/
    └── icons/
```

## 後續優化
- 批次上傳功能
- 上傳歷史記錄
- 自定義上傳服務器設定
- 壓縮選項（可選）
- 浮水印功能（可選）

## 測試重點
1. 工具列在各種操作下的位置正確性
2. 上傳功能的穩定性和錯誤處理
3. 不同網路環境下的上傳體驗
4. UI 反饋的及時性和準確性