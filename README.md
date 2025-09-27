# Electron Desktop Application

一個基於 Electron 框架開發的桌面應用程式。

## 技術棧

- **框架**: Electron
- **前端**: HTML5, CSS3, JavaScript
- **UI 圖標**: Lucide Icons
- **構建工具**: Electron Builder

## 專案結構

```
├── src/                    # 主進程原始碼
│   ├── main.js            # 應用程式入口
│   └── preload.js         # 預載腳本
├── renderer/              # 渲染進程資源
│   ├── index.html         # 主視窗頁面
│   ├── css/               # 樣式檔案
│   └── js/                # JavaScript 模組
├── assets/                # 靜態資源
│   └── icons/             # 應用圖標
└── package.json           # 專案設定檔
```

## 開發環境設定

### 安裝依賴

```bash
npm install
```

### 開發模式

```bash
npm run dev
```

### 打包應用

```bash
npm run build
```

## 功能特性

- 跨平台支援 (Windows, macOS, Linux)
- 現代化使用者介面
- 模組化程式架構
- 完善的事件處理機制

## 系統需求

- Node.js 14.0 或更高版本
- npm 6.0 或更高版本

## 授權

MIT License

---

## 截圖與畫質

- 區域截圖介面：在主視窗執行區域截圖後會開啟全螢幕覆蓋的截圖頁（[renderer/capture.html](renderer/capture.html)）
- 特色
  - HiDPI 擷取：依螢幕縮放比例以高解析度抓圖（來源更清晰）
  - 雙 Canvas 遮罩：選區內完全不變暗（destination-out 挖洞）
  - DPR 感知裁切：輸出 1:1 像素，避免縮放插值

## 快捷鍵（截圖介面）

- F6：切換影像平滑（Badge 顯示「平滑：開/關」，1.5 秒自動淡出）
- Enter：儲存截圖
- Ctrl/Cmd + C：複製選區到剪貼簿
- Esc：取消截圖並關閉
- 右鍵：第一次重抓截圖來源，再按一次取消截圖

工具列也提供「平滑切換」按鈕（與 F6 同功能）。

## 畫質選項

- 高 DPI 擷取（highDpiCapture）：預設開啟
  - 來源：主進程依顯示器 scaleFactor 計算 desktopCapturer 的 thumbnailSize（[src/main.js](src/main.js)）
- 影像平滑（smoothing）：預設關閉（文字更銳利）
  - 可於截圖介面以 F6/按鈕即時切換，並立即以 1:1 重繪背景避免插值殘留
- 設定持久化：切換後會寫回設定（[src/preload.js](src/preload.js) 暴露 settings API）

## A/B 測試建議流程

1) 開啟相同畫面內容（含細文字與斜體/輕字重）
2) 進入區域截圖介面
3) 截圖兩組：
   - 平滑：關（預設）
   - 平滑：開（F6 或工具列按鈕）
4) 若要對比來源解析度，再各自於主設定中切換：
   - HiDPI 擷取：開/關
5) 比較指標
   - 文字邊緣鋸齒/發糊程度
   - 細節保留與對比
   - 線條銳利度

## 多螢幕/縮放注意事項

- 已在主進程依各顯示器 scaleFactor 自動調整擷取解析度
- 建議在 100%/125%/150%/200% 縮放實測
- 若發現來源尺寸與畫布尺寸不一致，會於 console 提示可能發生縮放（[renderer/capture.html](renderer/capture.html)）
