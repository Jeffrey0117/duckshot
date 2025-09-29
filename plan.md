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

### 1. 視窗置頂功能
- **目標**：實作主視窗可以保持在其他視窗上方的功能
- **實作方案**：
  - 在工具列添加「置頂」按鈕（圖釘圖標）
  - 使用 Electron 的 `setAlwaysOnTop()` API
  - 切換狀態時改變按鈕樣式（active/inactive）
  - 儲存置頂狀態到設定檔
- **技術細節**：
  ```javascript
  // 主進程 IPC 處理
  ipcMain.on('toggle-always-on-top', (event, isOnTop) => {
    this.mainWindow.setAlwaysOnTop(isOnTop);
    // 儲存狀態到設定
    store.set('alwaysOnTop', isOnTop);
  });
  
  // 渲染進程觸發
  toggleAlwaysOnTop() {
    const isActive = !this.isAlwaysOnTop;
    this.isAlwaysOnTop = isActive;
    electronAPI.send('toggle-always-on-top', isActive);
    // 更新按鈕樣式
  }
  ```

### 2. 截圖快捷鍵啟用/停用功能
- **目標**：允許使用者控制全域快捷鍵的啟用狀態
- **實作方案**：
  - 在設定介面中添加「快捷鍵設定」區塊
  - 提供每個快捷鍵的開關選項
  - 支援自訂快捷鍵組合
  - 顯示快捷鍵衝突警告
- **快捷鍵清單**：
  - 區域截圖：Ctrl+PrintScreen（可自訂）
  - 全螢幕截圖：PrintScreen（可自訂）
  - 視窗截圖：Alt+PrintScreen（可自訂）
- **技術細節**：
  ```javascript
  // 主進程快捷鍵管理
  class ShortcutManager {
    constructor() {
      this.shortcuts = new Map();
      this.enabled = true;
    }
    
    register(shortcut, callback) {
      if (this.enabled && store.get(`shortcuts.${shortcut}.enabled`, true)) {
        const key = store.get(`shortcuts.${shortcut}.key`, defaultKeys[shortcut]);
        globalShortcut.register(key, callback);
        this.shortcuts.set(shortcut, { key, callback });
      }
    }
    
    unregister(shortcut) {
      const data = this.shortcuts.get(shortcut);
      if (data) {
        globalShortcut.unregister(data.key);
        this.shortcuts.delete(shortcut);
      }
    }
    
    toggleShortcut(shortcut, enabled) {
      if (enabled) {
        this.register(shortcut, this.shortcuts.get(shortcut).callback);
      } else {
        this.unregister(shortcut);
      }
      store.set(`shortcuts.${shortcut}.enabled`, enabled);
    }
    
    updateShortcutKey(shortcut, newKey) {
      // 檢查衝突
      if (globalShortcut.isRegistered(newKey)) {
        return { error: '快捷鍵已被使用' };
      }
      
      // 更新快捷鍵
      this.unregister(shortcut);
      store.set(`shortcuts.${shortcut}.key`, newKey);
      this.register(shortcut, this.shortcuts.get(shortcut).callback);
      
      return { success: true };
    }
  }
  ```

### 3. 設定介面優化
- **新增設定項目**：
  - 「視窗設定」區塊
    - 啟動時置頂：開關
    - 最小化到系統托盤：開關
  - 「快捷鍵設定」區塊
    - 啟用全域快捷鍵：總開關
    - 各快捷鍵獨立設定：
      - 啟用/停用開關
      - 快捷鍵編輯器（點擊記錄新按鍵）
      - 重設為預設值按鈕
- **UI 設計**：
  ```html
  <!-- 快捷鍵設定區塊 -->
  <div class="settings-section">
    <h3>快捷鍵設定</h3>
    <div class="setting-item">
      <label>
        <input type="checkbox" id="enable-global-shortcuts">
        啟用全域快捷鍵
      </label>
    </div>
    
    <div class="shortcuts-list">
      <div class="shortcut-item">
        <span class="shortcut-name">區域截圖</span>
        <input type="checkbox" class="shortcut-enabled">
        <div class="shortcut-key-editor">
          <input type="text" value="Ctrl+PrintScreen" readonly>
          <button class="edit-key">編輯</button>
          <button class="reset-key">重設</button>
        </div>
      </div>
      <!-- 其他快捷鍵項目 -->
    </div>
  </div>
  ```

### 4. 工具列自動重新定位
- **問題描述**：移動或調整截圖區域時，工具列位置沒有跟隨更新
- **解決方案**：
  - 在拖曳選取區域時觸發工具列重新定位
  - 在調整大小時觸發工具列重新定位
  - 確保工具列始終在可視範圍內

### 5. 圖片上傳功能
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
- 系統托盤功能
- 快捷鍵匯入/匯出設定
- 多顯示器支援優化

## 測試重點
1. 視窗置頂功能在不同應用程式間的切換
2. 快捷鍵設定的儲存和載入
3. 快捷鍵衝突檢測的準確性
4. 自訂快捷鍵的相容性
5. 工具列在各種操作下的位置正確性
6. 上傳功能的穩定性和錯誤處理
7. 不同網路環境下的上傳體驗
8. UI 反饋的及時性和準確性