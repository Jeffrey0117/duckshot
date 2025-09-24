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