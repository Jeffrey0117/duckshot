const electron = require("electron");
const {
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  dialog,
  shell,
} = electron;
const path = require("path");
const fs = require("fs").promises;
const os = require("os");

// 依顯示器 scaleFactor 動態計算最適縮圖尺寸（DPR 感知）
function getOptimalThumbnailSize() {
  try {
    const useHiDpi = typeof store?.get === "function" ? store.get("highDpiCapture") !== false : true;
    const displays = electron.screen.getAllDisplays();
    let maxW = 0, maxH = 0;
    for (const d of displays) {
      const scale = (d.scaleFactor || 1);
      const w = Math.round(d.size.width  * (useHiDpi ? scale : 1));
      const h = Math.round(d.size.height * (useHiDpi ? scale : 1));
      if (w * h > maxW * maxH) {
        maxW = w;
        maxH = h;
      }
    }
    if (maxW > 0 && maxH > 0) {
      return { width: maxW, height: maxH };
    }
  } catch (e) {
    console.warn("getOptimalThumbnailSize error:", e.message);
  }
  // 後備：預設 4K
  return { width: 3840, height: 2160 };
}

// 工具函式：用於控制等待時機
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 動態等待時間配置
const COMPOSITOR_WAIT_CONFIG = {
  minWait: 16,     // 最小等待時間 (ms)
  maxWait: 48,     // 最大等待時間 (ms)
  baseWait: 32,    // 基準等待時間 (ms)
  loadThreshold: 0.7, // CPU負載閾值 (0-1)
};

// 系統負載檢測和動態等待時間計算
function getDynamicWaitTime(targetWaitMs = 32) {
  try {
    // 獲取系統負載 (1分鐘平均負載)
    const loadAvg = os.loadavg()[0];
    const numCpus = os.cpus().length;

    // 計算相對負載 (0-1)
    const relativeLoad = Math.min(loadAvg / numCpus, 1);

    console.debug(`[動態等待] 系統負載: ${loadAvg.toFixed(2)}, CPU數: ${numCpus}, 相對負載: ${(relativeLoad * 100).toFixed(1)}%`);

    let waitTime;

    if (relativeLoad > COMPOSITOR_WAIT_CONFIG.loadThreshold) {
      // 高負載時使用較長等待時間
      waitTime = Math.min(targetWaitMs + 8, COMPOSITOR_WAIT_CONFIG.maxWait);
      console.debug(`[動態等待] 高負載模式: ${waitTime}ms`);
    } else if (relativeLoad < 0.3) {
      // 低負載時使用較短等待時間
      waitTime = Math.max(targetWaitMs - 8, COMPOSITOR_WAIT_CONFIG.minWait);
      console.debug(`[動態等待] 低負載模式: ${waitTime}ms`);
    } else {
      // 中等負載使用基準等待時間
      waitTime = targetWaitMs;
      console.debug(`[動態等待] 標準模式: ${waitTime}ms`);
    }

    return Math.round(waitTime);
  } catch (error) {
    console.warn("[動態等待] 負載檢測失敗，使用基準等待時間:", error.message);
    return targetWaitMs;
  }
}

// 優化等待函數 - 整合動態調整和錯誤處理
async function optimizedSleep(targetMs = 32, description = "等待") {
  const dynamicMs = getDynamicWaitTime(targetMs);
  console.debug(`[${description}] ${description} ${dynamicMs}ms (目標: ${targetMs}ms)`);

  try {
    await sleep(dynamicMs);
    console.debug(`[${description}] ${description}完成`);
  } catch (error) {
    console.error(`[${description}] ${description}失敗:`, error);
    // 錯誤時仍嘗試等待基準時間
    try {
      await sleep(targetMs);
    } catch (fallbackError) {
      console.error(`[${description}] 後備等待也失敗:`, fallbackError);
    }
  }
}

// 向下相容的舊常數 (將逐步淘汰)
const COMPOSITOR_WAIT_TIME = 32; // 初始值 32ms，若仍有殘影可調整為 48-64ms
const COMPOSITOR_WAIT_TIME_1 = 32; // 單幀等待時間
const COMPOSITOR_WAIT_TIME_2 = 64; // 雙幀等待時間（更保守）

// 隱藏視窗時的螢幕外座標
const HIDE_OFFSCREEN_POS = { x: -10000, y: -10000 };

// 設定檔案路徑
const settingsPath = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "Dukshot",
  "settings.json"
);

// 設定存儲類別
class SettingsStore {
  constructor() {
    this.settings = {};
    this.load();
  }

  async load() {
    try {
      const data = await fs.readFile(settingsPath, "utf8");
      this.settings = JSON.parse(data);
    } catch (error) {
      this.settings = {
        theme: "light",
        autoSave: true,
        screenshotFormat: "png",
        // 預設儲存到桌面（可在設定中覆蓋）
        saveDirectory: path.join(os.homedir(), "Desktop"),
        // 僅在開發模式且此設定為 true 時才會自動開啟 DevTools
        openDevTools: false,
        // 影像/畫質相關設定
        highDpiCapture: true,   // 啟用高 DPI 擷取（DPR 感知）
        smoothing: false        // 預設關閉影像平滑，避免文字模糊
      };
      await this.save();
    }
  }

  async save() {
    try {
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
  }

  get store() {
    return this.settings;
  }

  set store(newSettings) {
    this.settings = newSettings;
    this.save();
  }
}

const store = new SettingsStore();

class DukshotApp {
  constructor() {
    this.mainWindow = null;
    this.captureWindow = null;
    this.isDebug = process.argv.includes("--dev");
    this.originalMainWindowBounds = null; // 記錄主視窗原始位置，供還原使用
    this.originalMainWindowState = null; // 記錄主視窗原始狀態
  }

  async initialize() {
    // 等待 Electron 準備完成
    await electron.app.whenReady();

    // 創建主視窗
    this.createMainWindow();

    // 註冊全域快捷鍵
    this.registerGlobalShortcuts();

    // 設定應用事件
    this.setupAppEvents();

    // 設定 IPC 處理器
    this.setupIpcHandlers();
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 900,
      height: 650,
      minWidth: 800,
      minHeight: 600,
      frame: false, // 隱藏原生標題列
      titleBarStyle: "hidden", // Windows 平台隱藏標題列
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        webSecurity: true,
      },
      icon: path.join(__dirname, "../assets/icons/logo-imgup.png"),
      show: false, // 先不顯示，等載入完成後再顯示
    });

    // 載入主界面
    this.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

    // 視窗準備好後顯示
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show();

      // 開發模式且設定允許時才開啟開發者工具
      if (this.isDebug && store.get("openDevTools") === true) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // 視窗關閉事件
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });
  }

  registerGlobalShortcuts() {
    // 區域截圖快捷鍵 (Ctrl+PrintScreen)
    globalShortcut.register("CommandOrControl+PrintScreen", () => {
      this.startRegionCapture();
    });

    // 全螢幕截圖快捷鍵 (PrintScreen)
    globalShortcut.register("PrintScreen", () => {
      this.startFullScreenCapture();
    });

    // 當前視窗截圖快捷鍵 (Alt+PrintScreen)
    globalShortcut.register("Alt+PrintScreen", () => {
      this.startActiveWindowCapture();
    });
  }

  setupAppEvents() {
    // 當所有視窗關閉時
    electron.app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        electron.app.quit();
      }
    });

    // macOS 重新激活應用
    electron.app.on("activate", () => {
      if (this.mainWindow === null) {
        this.createMainWindow();
      }
    });

    // 應用退出前清理
    electron.app.on("before-quit", () => {
      // 清理全域快捷鍵
      globalShortcut.unregisterAll();
    });
  }

  setupIpcHandlers() {
    // 視窗控制 IPC 處理
    ipcMain.on("minimize-window", () => {
      if (this.mainWindow) this.mainWindow.minimize();
    });

    ipcMain.on("maximize-window", () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    ipcMain.on("close-window", () => {
      if (this.mainWindow) this.mainWindow.close();
    });

    // 視窗狀態變化通知
    this.mainWindow.on("maximize", () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("window-maximized");
      }
    });

    this.mainWindow.on("unmaximize", () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("window-unmaximized");
      }
    });

    // 獲取螢幕截圖源
    ipcMain.handle("get-desktop-sources", async () => {
      try {
        console.log("Requesting desktop sources...");

        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: getOptimalThumbnailSize(),
          fetchWindowIcons: false,
        });

        console.log(`Found ${sources.length} sources`);

        if (sources.length === 0) {
          console.warn("No desktop sources found");
          return [];
        }

        // 轉換 NativeImage 為 data URL
        const processedSources = sources.map((source, index) => {
          try {
            console.log(`Processing source ${index}: ${source.name}`);
            return {
              id: source.id,
              name: source.name,
              thumbnail: source.thumbnail.toDataURL(),
            };
          } catch (error) {
            console.error(`Error processing source ${index}:`, error);
            // 提供備用的空白圖像
            return {
              id: source.id,
              name: source.name,
              thumbnail:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            };
          }
        });

        console.log("Successfully processed sources");
        return processedSources;
      } catch (error) {
        console.error("Error getting desktop sources:", error);
        return [];
      }
    });

    // 開始區域截圖
    ipcMain.handle("start-region-capture", () => {
      return this.startRegionCapture();
    });

    // 開始全螢幕截圖
    ipcMain.handle("start-fullscreen-capture", () => {
      return this.startFullScreenCapture();
    });

    // 開始視窗截圖
    ipcMain.handle("start-window-capture", () => {
      return this.startActiveWindowCapture();
    });

    // 儲存截圖（支援可選 label 以利 A/B 命名）
    ipcMain.handle("save-screenshot", async (event, imageData, format, label) => {
      try {
        console.log("Starting screenshot save process...");

        const fsp = require("fs").promises;
        const pathMod = require("path");

        // 使用預設儲存目錄（可由設定覆蓋，預設為桌面）
        const targetDir = this.getDefaultSaveDir();
        await fsp.mkdir(targetDir, { recursive: true });

        console.log(`Save path: ${targetDir}`);

        // 生成檔案名稱（可選 label）
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        let safeLabel = (typeof label === "string" && label.trim().length > 0) ? label.trim() : "";
        // 基本清理：移除不安全字元
        safeLabel = safeLabel.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const filename = safeLabel ? `Dukshot-${timestamp}-${safeLabel}.${format}` : `Dukshot-${timestamp}.${format}`;
        const filePath = pathMod.join(targetDir, filename);

        console.log(`Full file path: ${filePath}`);

        // 檢查 imageData 格式
        if (!imageData || typeof imageData !== "string") {
          throw new Error("Invalid image data format");
        }

        // 確保 imageData 是正確的 base64 格式
        const base64Data = imageData.includes(",")
          ? imageData.split(",")[1]
          : imageData;

        if (!base64Data) {
          throw new Error("No base64 data found");
        }

        // 儲存檔案
        const buffer = Buffer.from(base64Data, "base64");
        console.log(`Buffer size: ${buffer.length} bytes`);

        await fsp.writeFile(filePath, buffer);

        console.log("Screenshot saved successfully!");

        // 通知主視窗更新清單（特別是區域截圖從 capture.html 呼叫本 IPC 時）
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("capture-completed", {
              success: true,
              path: filePath,
              data: imageData, // 傳回 base64 以便立即顯示縮圖
              type: "region",
            });
          }
        } catch (notifyError) {
          console.error(
            "Error notifying renderer about capture completion:",
            notifyError
          );
        }

        return { success: true, path: filePath };
      } catch (error) {
        console.error("Error saving screenshot:", error);
        return { success: false, error: error.message };
      }
    });

    // 開啟檔案夾（若未提供路徑，開啟預設截圖資料夾）
    ipcMain.handle("open-folder", async (event, folderPath) => {
      try {
        const targetPath = folderPath || this.getDefaultSaveDir();
        await shell.openPath(targetPath);
        return { success: true, path: targetPath };
      } catch (error) {
        console.error("Error opening folder:", error);
        return { success: false, error: error.message };
      }
    });

    // 獲取設定
    ipcMain.handle("get-settings", () => {
      return store.store;
    });

    // 儲存設定
    ipcMain.handle("save-settings", (event, settings) => {
      store.store = settings;
      return { success: true };
    });

    // 列出預設截圖資料夾中的圖片（用於前端顯示）- 優化版本
    ipcMain.handle("list-screenshots", async () => {
      try {
        const dir = this.getDefaultSaveDir();
        await fs.mkdir(dir, { recursive: true });

        const fsp = require("fs").promises;
        const pathMod = require("path");
        const entries = await fsp.readdir(dir, { withFileTypes: true });

        // 以資料夾名產生顯示用分頁標籤（Desktop → 桌面）
        const dirName = pathMod.basename(dir);
        const folderLabel =
          dirName.toLowerCase() === "desktop" ? "桌面" : dirName;

        // 只取常見圖片副檔名
        const exts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
        
        // 極速優化：只取前 50 個檔案立即返回，其餘在背景載入
        const MAX_INITIAL_FILES = 50;
        const filteredEntries = entries.filter(entry => {
          if (!entry.isFile()) return false;
          const ext = pathMod.extname(entry.name).toLowerCase();
          return exts.has(ext);
        });

        // 分成初始批次和延遲批次
        const initialBatch = filteredEntries.slice(0, MAX_INITIAL_FILES);
        const remainingBatch = filteredEntries.slice(MAX_INITIAL_FILES);

        // 並行處理初始批次（前50個檔案）
        const initialFilePromises = initialBatch.map(async (entry) => {
          const full = pathMod.join(dir, entry.name);
          
          try {
            // 使用 stat 的簡化版本，只取必要資訊
            const stat = await fsp.stat(full);
            
            return {
              id: `${full}:${stat.mtimeMs}`,
              name: entry.name,
              path: full,
              thumbnail: null, // 完全不載入縮圖
              size: stat.size,
              createdAt: stat.birthtime?.toISOString?.() || new Date().toISOString(),
              modifiedAt: stat.mtime?.toISOString?.() || new Date().toISOString(),
              type: `image/${pathMod.extname(entry.name).replace(".", "")}`,
              folder: folderLabel,
              dimensions: null, // 跳過尺寸計算
              isInitialBatch: true
            };
          } catch (e) {
            return null;
          }
        });

        // 處理剩餘檔案（延遲載入）
        const remainingFilePromises = remainingBatch.map(async (entry) => {
          const full = pathMod.join(dir, entry.name);
          
          try {
            const stat = await fsp.stat(full);
            
            return {
              id: `${full}:${stat.mtimeMs}`,
              name: entry.name,
              path: full,
              thumbnail: null,
              size: stat.size,
              createdAt: stat.birthtime?.toISOString?.() || new Date().toISOString(),
              modifiedAt: stat.mtime?.toISOString?.() || new Date().toISOString(),
              type: `image/${pathMod.extname(entry.name).replace(".", "")}`,
              folder: folderLabel,
              dimensions: null,
              isInitialBatch: false
            };
          } catch (e) {
            return null;
          }
        });

        // 快速返回初始批次
        const initialFiles = (await Promise.all(initialFilePromises)).filter(Boolean);
        
        // 快速排序（只排序初始批次）
        initialFiles.sort((a, b) =>
          new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
        );

        // 如果有剩餘檔案，標記需要載入更多
        const hasMore = remainingBatch.length > 0;
        
        // 背景處理剩餘檔案（不等待）
        if (hasMore) {
          Promise.all(remainingFilePromises).then(moreFiles => {
            const validFiles = moreFiles.filter(Boolean);
            // 這裡可以透過 IPC 發送給前端
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("more-files-loaded", {
                files: validFiles,
                directory: dir
              });
            }
          });
        }

        return {
          success: true,
          files: initialFiles,
          directory: dir,
          hasMore,
          totalCount: filteredEntries.length
        };
      } catch (error) {
        console.error("Error listing screenshots:", error);
        return { success: false, error: error.message, files: [] };
      }
    });

    // 新增獨立的縮圖生成 API（按需調用）
    ipcMain.handle("get-thumbnail", async (event, filePath, width = 300) => {
      try {
        const thumbImage = electron.nativeImage
          .createFromPath(filePath)
          .resize({ width });
        return thumbImage.isEmpty() ? null : thumbImage.toDataURL();
      } catch (error) {
        console.error("Error generating thumbnail:", error);
        return null;
      }
    });
  }

  async startRegionCapture() {
    console.log("Starting region capture...");
    console.debug("[區域截圖] 開始執行 startRegionCapture()");

    if (this.captureWindow) {
      return { success: false, error: "截圖視窗已開啟" };
    }

    try {
      // 步驟 1: 實施雙重隱身策略，徹底避免主視窗被擷取
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        console.debug("[區域截圖] 步驟1 - 開始雙重隱身前準備");
        
        // 記錄主視窗原始狀態（供後續還原）
        this.originalMainWindowBounds = this.mainWindow.getBounds();
        const wasMaximized = this.mainWindow.isMaximized();
        const wasMinimized = this.mainWindow.isMinimized();
        
        // 儲存額外狀態資訊
        this.originalMainWindowState = {
          bounds: this.originalMainWindowBounds,
          wasMaximized,
          wasMinimized
        };
        
        console.debug("[區域截圖] 記錄原始位置:", this.originalMainWindowBounds);
        
        // 執行雙重隱身
        console.debug("[區域截圖] 步驟2 - 執行雙重隱身");
        
        // 1) 設定完全透明（不參與 GPU 合成）
        this.mainWindow.setOpacity(0);
        console.debug("[區域截圖] - 設定透明度為 0");
        
        // 2) 最小化（降低被合成機率）
        this.mainWindow.minimize();
        console.debug("[區域截圖] - 最小化視窗");
        
        // 3) 移到螢幕外（保險手段，避免 GPU 合成殘留）
        this.mainWindow.setBounds(HIDE_OFFSCREEN_POS, false);
        console.debug("[區域截圖] - 移至螢幕外座標");
      }
      
      // 步驟 2: 動態等待合成器更新，確保主視窗完全從桌面消失
      await optimizedSleep(COMPOSITOR_WAIT_TIME_2, "區域截圖-合成器等待");
      
      // 步驟 3: 擷取桌面畫面（此時主視窗應已完全消失）
      console.debug("[區域截圖] 步驟4 - 開始擷取桌面畫面");
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: getOptimalThumbnailSize(),
      });

      if (sources.length === 0) {
        throw new Error("無法獲取螢幕源");
      }

      const screenData = sources[0].thumbnail.toDataURL();
      console.debug("[區域截圖] 步驟5 - 桌面畫面擷取完成");

      // 步驟 4: 創建並顯示截圖視窗（主視窗還原將在截圖完成後執行）
      console.debug("[區域截圖] 步驟6 - 創建截圖視窗");
      this.createCaptureWindow(screenData);
      console.debug("[區域截圖] 截圖視窗創建完成");

      return {
        success: true,
        message: "區域截圖界面已開啟",
        type: "region",
      };
    } catch (error) {
      console.error("Error starting region capture:", error);
      // 發生錯誤時立即還原主視窗
      this.restoreMainWindow();
      return { success: false, error: error.message };
    }
  }

  async startFullScreenCapture() {
    console.log("Starting fullscreen capture...");

    try {
      // 獲取主螢幕
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: getOptimalThumbnailSize(),
      });

      if (sources.length === 0) {
        throw new Error("無法找到螢幕源");
      }

      // 使用第一個螢幕源並直接保存
      const primaryScreen = sources[0];

      // 獲取更高解析度的縮圖作為截圖
      const highResSources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: getOptimalThumbnailSize(),
      });

      const imageData = highResSources[0].thumbnail.toDataURL();

      // 直接保存截圖
      const saveResult = await this.saveScreenshotDirect(imageData, "png");

      console.log("Fullscreen capture completed successfully");
      return {
        success: saveResult.success,
        data: imageData,
        type: "fullscreen",
        source: primaryScreen.name,
        saved: saveResult.success,
        path: saveResult.path,
      };
    } catch (error) {
      console.error("Error in fullscreen capture:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async startActiveWindowCapture() {
    console.log("Starting active window capture...");

    try {
      // 獲取視窗源
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: getOptimalThumbnailSize(),
      });

      if (sources.length === 0) {
        throw new Error("無法找到視窗源");
      }

      // 過濾掉我們自己的應用視窗和系統視窗
      const filteredSources = sources.filter(
        (source) =>
          !source.name.includes("Dukshot") &&
          !source.name.includes("Electron") &&
          !source.name.includes("DevTools") &&
          !source.name.includes("Task Manager") &&
          !source.name.includes("System Settings") &&
          source.name.trim().length > 0 &&
          source.name !== "Desktop" &&
          source.name !== "Screen" &&
          !source.name.includes("Windows PowerShell") &&
          !source.name.includes("Command Prompt")
      );

      if (filteredSources.length === 0) {
        // 如果沒有其他視窗，就用主螢幕
        console.log("No suitable windows found, using screen capture instead");
        return await this.startFullScreenCapture();
      }

      // 使用第一個可用的視窗
      const targetWindow = filteredSources[0];
      const imageData = targetWindow.thumbnail.toDataURL();

      // 直接保存截圖
      const saveResult = await this.saveScreenshotDirect(imageData, "png");

      console.log(`Window capture completed: ${targetWindow.name}`);
      return {
        success: saveResult.success,
        data: imageData,
        type: "window",
        source: targetWindow.name,
        saved: saveResult.success,
        path: saveResult.path,
      };
    } catch (error) {
      console.error("Error in window capture:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 直接保存截圖的輔助方法
  async saveScreenshotDirect(imageData, format = "png") {
    try {
      console.log("Saving screenshot directly...");

      const targetDir = this.getDefaultSaveDir();
      await fs.mkdir(targetDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `Dukshot-${timestamp}.${format}`;
      const filePath = path.join(targetDir, filename);

      // 確保 imageData 是正確的 base64 格式
      const base64Data = imageData.includes(",")
        ? imageData.split(",")[1]
        : imageData;

      if (!base64Data) {
        throw new Error("No base64 data found");
      }

      // 儲存檔案
      const buffer = Buffer.from(base64Data, "base64");
      await fs.writeFile(filePath, buffer);

      console.log(`Screenshot saved to: ${filePath}`);
      return { success: true, path: filePath };
    } catch (error) {
      console.error("Error saving screenshot:", error);
      return { success: false, error: error.message };
    }
  }

  // 取得預設截圖儲存資料夾
  getDefaultSaveDir() {
    const configured = store.get("saveDirectory");
    if (
      configured &&
      typeof configured === "string" &&
      configured.trim().length > 0
    ) {
      return configured;
    }
    // 預設使用桌面
    return path.join(os.homedir(), "Desktop");
  }

  createCaptureWindow(screenData = null) {
    console.debug("[區域截圖] createCaptureWindow() 開始執行");
    
    // 建立截圖視窗但先不顯示
    this.captureWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      show: false, // 先不顯示，等載入完成後再顯示
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
      skipTaskbar: true,
      focusable: true, // 確保可以獲得焦點
    });

    console.debug("[區域截圖] 載入 capture.html");
    // 載入截圖界面
    this.captureWindow.loadFile(
      path.join(__dirname, "../renderer/capture.html")
    );

    // 如果有螢幕數據，傳遞給截圖界面並在載入完成後顯示視窗
    if (screenData) {
      this.captureWindow.webContents.once("did-finish-load", () => {
        console.debug("[區域截圖] capture.html 載入完成，傳送螢幕資料");
        
        // 步驟 5: 發送螢幕資料給渲染進程
        this.captureWindow.webContents.send("screen-data", screenData);
        
        // 步驟 6: 設定視窗層級為最上層
        // 使用 setImmediate 確保在下一個事件循環執行
        setImmediate(() => {
          // 設定最高層級並顯示
          this.captureWindow.setAlwaysOnTop(true, 'screen-saver', 1);
          this.captureWindow.setVisibleOnAllWorkspaces(true); // 在所有工作區可見
          
          // 步驟 7: 顯示截圖視窗
          console.debug("[區域截圖] 顯示截圖視窗");
          this.captureWindow.show();
          this.captureWindow.focus(); // 獲取焦點
          console.debug("[區域截圖] 截圖視窗已顯示並聚焦");
        });
      });
    } else {
      // 如果沒有螢幕數據，直接顯示（通常不會發生）
      this.captureWindow.webContents.once("did-finish-load", () => {
        this.captureWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        this.captureWindow.show();
        this.captureWindow.focus();
      });
    }

    // 截圖視窗關閉事件 - 在此還原主視窗
    this.captureWindow.on("closed", () => {
      console.debug("[區域截圖] 截圖視窗已關閉，開始還原主視窗");
      this.captureWindow = null;
      // 完整還原主視窗狀態
      this.restoreMainWindow();
    });

    // 開發模式且設定允許時才開啟開發者工具
    if (this.isDebug && store.get("openDevTools") === true) {
      this.captureWindow.webContents.openDevTools();
    }
  }

  // 新增主視窗還原方法
  restoreMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.debug("[區域截圖] 開始還原主視窗");
      
      // 還原透明度
      this.mainWindow.setOpacity(1);
      console.debug("[區域截圖] - 還原透明度為 1");
      
      // 還原位置（如果有記錄）
      if (this.originalMainWindowBounds) {
        this.mainWindow.setBounds(this.originalMainWindowBounds, false);
        console.debug("[區域截圖] - 還原視窗位置:", this.originalMainWindowBounds);
      }
      
      // 根據原始狀態還原視窗
      if (this.originalMainWindowState) {
        if (this.originalMainWindowState.wasMaximized) {
          this.mainWindow.maximize();
          console.debug("[區域截圖] - 還原最大化狀態");
        } else if (this.originalMainWindowState.wasMinimized) {
          // 如果原本就是最小化，保持最小化
          console.debug("[區域截圖] - 保持最小化狀態");
        } else {
          // 正常狀態，還原顯示
          this.mainWindow.restore();
          console.debug("[區域截圖] - 還原正常狀態");
        }
      } else {
        // 沒有狀態記錄時，預設還原
        this.mainWindow.restore();
      }
      
      // 顯示視窗
      this.mainWindow.show();
      console.debug("[區域截圖] 主視窗還原完成");
      
      // 清理狀態記錄
      this.originalMainWindowBounds = null;
      this.originalMainWindowState = null;
    }
  }
}

// 創建應用實例並初始化
const captureApp = new DukshotApp();
captureApp.initialize().catch(console.error);

// 匯出應用實例供測試使用
module.exports = captureApp;