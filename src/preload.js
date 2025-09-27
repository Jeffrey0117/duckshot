const { contextBridge, ipcRenderer } = require("electron");

// 視窗控制 API
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  onMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback)
});

// 安全地暴露 API 給渲染程序
contextBridge.exposeInMainWorld("electronAPI", {
  // 重新組織 API 結構，將截圖相關 API 分組
  capture: {
    getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),
    startRegionCapture: () => ipcRenderer.invoke("start-region-capture"),
    startFullscreenCapture: () =>
      ipcRenderer.invoke("start-fullscreen-capture"),
    startWindowCapture: () => ipcRenderer.invoke("start-window-capture"),
    // 可選 label 參數供 A/B 命名使用
    saveScreenshot: (imageData, format, label) =>
      ipcRenderer.invoke("save-screenshot", imageData, format, label),
  },

  // 檔案系統 API
  files: {
    openFolder: (folderPath) => ipcRenderer.invoke("open-folder", folderPath),
    listScreenshots: () => ipcRenderer.invoke("list-screenshots"),
    getThumbnail: (filePath, width) => ipcRenderer.invoke("get-thumbnail", filePath, width),
  },

  // 設定 API
  settings: {
    get: () => ipcRenderer.invoke("get-settings"),
    save: (settings) => ipcRenderer.invoke("save-settings", settings),
  },

  // 與舊版相容的頂層 API 代理
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),
  saveScreenshot: (imageData, format, label) =>
    ipcRenderer.invoke("save-screenshot", imageData, format, label),

  // 事件監聽
  on: (channel, callback) => {
    const validChannels = [
      "capture-completed",
      "capture-cancelled",
      "settings-updated",
      "screen-data",
      "more-files-loaded",
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },
  
  // 專門處理螢幕數據的監聽器
  onScreenData: (callback) => {
    ipcRenderer.on("screen-data", (event, data) => callback(data));
  },

  // 移除事件監聽
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // 發送事件到主程序
  send: (channel, data) => {
    const validChannels = [
      "capture-region-selected",
      "capture-cancelled",
      "window-close",
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
});

// 提供一些實用工具函數
contextBridge.exposeInMainWorld("utils", {
  // 格式化檔案大小
  formatFileSize: (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

  // 格式化日期
  formatDate: (date) => {
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  },

  // 生成唯一 ID
  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // 防抖函數
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
});

// 在視窗載入完成時通知主程序
window.addEventListener("DOMContentLoaded", () => {
  console.log("Preload script loaded successfully");
});
