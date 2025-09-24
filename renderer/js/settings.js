/* ===========================================
   設定管理器 - 負責應用程序設定的載入和儲存
   =========================================== */

class SettingsManager {
  constructor() {
    this.eventEmitter = Utils.createEventEmitter();
    this.settings = this.getDefaultSettings();
    this.isLoaded = false;
  }

  getDefaultSettings() {
    return {
      // 外觀設定
      theme: "light",
      language: "zh-TW",

      // 截圖設定
      shortcuts: {
        regionCapture: "CommandOrControl+PrintScreen",
        fullScreenCapture: "PrintScreen",
        activeWindowCapture: "Alt+PrintScreen",
      },

      // 儲存設定
      autoSaveToClipboard: true,
      customSavePath: false,
      savePath: "",
      singleLayerStorage: false,
      autoCreateFolders: true,

      // 圖片設定
      defaultImageFormat: "png",
      imageQuality: 90,
      autoCompression: false,
      maxImageSize: { width: 1920, height: 1080 },

      // UI 設定
      alwaysOnTop: false,
      minimizeToTray: true,
      startMinimized: false,
      showNotifications: true,

      // 進階設定
      enableHotkeys: true,
      autoUpdate: true,
      telemetry: false,

      // 資料夾設定
      folderOrder: ["今日", "工作", "專案"],
      currentFolder: "今日",
    };
  }

  async load() {
    if (this.isLoaded) return this.settings;

    try {
      const savedSettings = await electronAPI.settings.get();

      // 合併預設設定和已儲存的設定
      this.settings = { ...this.getDefaultSettings(), ...savedSettings };
      this.isLoaded = true;

      console.log("Settings loaded:", this.settings);
      return this.settings;
    } catch (error) {
      console.error("Failed to load settings:", error);
      return this.settings;
    }
  }

  async save() {
    try {
      await electronAPI.settings.save(this.settings);
      console.log("Settings saved successfully");
      this.eventEmitter.emit("settingsSaved", this.settings);
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      return false;
    }
  }

  get(key, defaultValue = null) {
    const keys = key.split(".");
    let value = this.settings;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  set(key, value) {
    const keys = key.split(".");
    const lastKey = keys.pop();
    let target = this.settings;

    // 創建嵌套物件路徑
    for (const k of keys) {
      if (!(k in target) || typeof target[k] !== "object") {
        target[k] = {};
      }
      target = target[k];
    }

    target[lastKey] = value;

    // 觸發變更事件
    this.eventEmitter.emit("settingChanged", key, value);

    // 特殊設定的即時處理
    this.handleSpecialSettings(key, value);
  }

  update(newSettings) {
    Object.keys(newSettings).forEach((key) => {
      this.set(key, newSettings[key]);
    });

    this.eventEmitter.emit("settingsChanged", this.settings);
  }

  handleSpecialSettings(key, value) {
    switch (key) {
      case "theme":
        this.eventEmitter.emit("themeChanged", value);
        break;

      case "language":
        this.eventEmitter.emit("languageChanged", value);
        break;

      case "alwaysOnTop":
        electronAPI.send("set-always-on-top", value);
        break;

      case "shortcuts":
        this.eventEmitter.emit("shortcutsChanged", value);
        break;
    }
  }

  reset() {
    this.settings = this.getDefaultSettings();
    this.eventEmitter.emit("settingsReset", this.settings);
    return this.save();
  }

  export() {
    return JSON.stringify(this.settings, null, 2);
  }

  async import(settingsJson) {
    try {
      const importedSettings = JSON.parse(settingsJson);

      // 驗證設定格式
      if (this.validateSettings(importedSettings)) {
        this.settings = { ...this.getDefaultSettings(), ...importedSettings };
        await this.save();
        this.eventEmitter.emit("settingsImported", this.settings);
        return true;
      } else {
        throw new Error("Invalid settings format");
      }
    } catch (error) {
      console.error("Failed to import settings:", error);
      return false;
    }
  }

  validateSettings(settings) {
    // 基本格式驗證
    if (!settings || typeof settings !== "object") {
      return false;
    }

    // 驗證必要的設定欄位
    const requiredFields = ["theme", "shortcuts"];
    for (const field of requiredFields) {
      if (!(field in settings)) {
        return false;
      }
    }

    return true;
  }

  openDialog() {
    const ui = window.DukshotApp?.ui;
    if (!ui) return;

    const settingsHtml = this.generateSettingsHTML();

    const modal = ui.createModal("設定", settingsHtml, [
      {
        text: "重設",
        class: "btn-ghost",
        action: () => this.resetSettings(),
      },
      {
        text: "取消",
        class: "btn-secondary",
        action: () => ui.closeModal(),
      },
      {
        text: "儲存",
        class: "btn-primary",
        action: () => this.saveSettingsFromDialog(),
      },
    ]);

    // 載入當前設定值
    this.loadSettingsToDialog();

    // 設置事件監聽器
    this.setupDialogEvents();
  }

  generateSettingsHTML() {
    return `
      <div class="settings-container">
        <!-- 分頁導航 -->
        <div class="settings-tabs">
          <button class="settings-tab active" data-tab="general">
            <i data-lucide="settings" class="icon-sm"></i>
            一般
          </button>
          <button class="settings-tab" data-tab="capture">
            <i data-lucide="camera" class="icon-sm"></i>
            截圖
          </button>
          <button class="settings-tab" data-tab="storage">
            <i data-lucide="hard-drive" class="icon-sm"></i>
            儲存
          </button>
          <button class="settings-tab" data-tab="advanced">
            <i data-lucide="cpu" class="icon-sm"></i>
            進階
          </button>
        </div>

        <!-- 設定內容 -->
        <div class="settings-content">
          <!-- 一般設定 -->
          <div class="settings-panel active" data-panel="general">
            <div class="form-group">
              <label class="form-label">外觀主題</label>
              <select class="form-input form-select" id="setting-theme">
                <option value="light">亮色主題</option>
                <option value="dark">暗色主題</option>
                <option value="system">跟隨系統</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">語言</label>
              <select class="form-input form-select" id="setting-language">
                <option value="zh-TW">繁體中文</option>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-always-on-top">
                <span>視窗永遠置頂</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-minimize-to-tray">
                <span>最小化到系統托盤</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-show-notifications">
                <span>顯示通知</span>
              </label>
            </div>
          </div>

          <!-- 截圖設定 -->
          <div class="settings-panel" data-panel="capture">
            <div class="form-group">
              <label class="form-label">區域截圖快捷鍵</label>
              <input type="text" class="form-input" id="setting-shortcut-region" readonly>
              <small style="color: var(--text-secondary); margin-top: 4px; display: block;">
                點擊輸入框並按下新的快捷鍵組合
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">全螢幕截圖快捷鍵</label>
              <input type="text" class="form-input" id="setting-shortcut-fullscreen" readonly>
            </div>

            <div class="form-group">
              <label class="form-label">視窗截圖快捷鍵</label>
              <input type="text" class="form-input" id="setting-shortcut-window" readonly>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-auto-clipboard">
                <span>自動複製截圖到剪貼簿</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-label">預設圖片格式</label>
              <select class="form-input form-select" id="setting-image-format">
                <option value="png">PNG (無損)</option>
                <option value="jpg">JPEG (較小檔案)</option>
                <option value="webp">WebP (現代格式)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">圖片品質 (JPEG/WebP)</label>
              <input type="range" class="form-input" id="setting-image-quality" min="10" max="100" step="10">
              <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-secondary);">
                <span>低品質</span>
                <span id="quality-value">90%</span>
                <span>高品質</span>
              </div>
            </div>
          </div>

          <!-- 儲存設定 -->
          <div class="settings-panel" data-panel="storage">
            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-custom-path">
                <span>使用自訂儲存路徑</span>
              </label>
            </div>

            <div class="form-group" id="custom-path-group" style="display: none;">
              <label class="form-label">自訂儲存路徑</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" class="form-input" id="setting-save-path" readonly>
                <button class="btn btn-secondary" id="browse-path">瀏覽</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-single-layer">
                <span>單層儲存模式 (不建立子資料夾)</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-auto-folders">
                <span>自動建立資料夾</span>
              </label>
            </div>
          </div>

          <!-- 進階設定 -->
          <div class="settings-panel" data-panel="advanced">
            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-enable-hotkeys">
                <span>啟用全域快捷鍵</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-auto-update">
                <span>自動檢查更新</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="setting-telemetry">
                <span>傳送匿名使用統計 (幫助改善產品)</span>
              </label>
            </div>

            <div class="form-group" style="margin-top: 2rem;">
              <label class="form-label">資料管理</label>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-secondary" id="export-settings">匯出設定</button>
                <button class="btn btn-secondary" id="import-settings">匯入設定</button>
                <button class="btn btn-danger" id="clear-data">清除所有資料</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .settings-container {
          display: flex;
          min-height: 400px;
        }

        .settings-tabs {
          width: 120px;
          border-right: 1px solid var(--border-light);
          padding: var(--space-2);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .settings-tab {
          padding: var(--space-2) var(--space-3);
          border: none;
          background: transparent;
          color: var(--text-secondary);
          border-radius: var(--radius-base);
          cursor: pointer;
          transition: all var(--transition-base);
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          text-align: left;
        }

        .settings-tab:hover {
          background: var(--background-secondary);
          color: var(--text-primary);
        }

        .settings-tab.active {
          background: var(--primary-blue);
          color: white;
        }

        .settings-content {
          flex: 1;
          padding: var(--space-4);
        }

        .settings-panel {
          display: none;
        }

        .settings-panel.active {
          display: block;
        }

        .form-group:last-child {
          margin-bottom: 0;
        }
      </style>
    `;
  }

  setupDialogEvents() {
    // 分頁切換
    document.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetPanel = tab.dataset.tab;

        // 更新分頁狀態
        document
          .querySelectorAll(".settings-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        // 更新面板顯示
        document.querySelectorAll(".settings-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.dataset.panel === targetPanel);
        });
      });
    });

    // 自訂路徑切換
    const customPathCheckbox = document.getElementById("setting-custom-path");
    const customPathGroup = document.getElementById("custom-path-group");

    customPathCheckbox?.addEventListener("change", (e) => {
      customPathGroup.style.display = e.target.checked ? "block" : "none";
    });

    // 圖片品質滑桿
    const qualitySlider = document.getElementById("setting-image-quality");
    const qualityValue = document.getElementById("quality-value");

    qualitySlider?.addEventListener("input", (e) => {
      qualityValue.textContent = `${e.target.value}%`;
    });

    // 快捷鍵設定
    this.setupShortcutInputs();

    // 其他按鈕事件
    this.setupButtonEvents();

    // 初始化圖示
    lucide.createIcons();
  }

  setupShortcutInputs() {
    const inputs = [
      "setting-shortcut-region",
      "setting-shortcut-fullscreen",
      "setting-shortcut-window",
    ];

    inputs.forEach((inputId) => {
      const input = document.getElementById(inputId);
      if (!input) return;

      input.addEventListener("focus", () => {
        input.value = "按下新的快捷鍵...";
        input.dataset.recording = "true";
      });

      input.addEventListener("keydown", (e) => {
        if (input.dataset.recording !== "true") return;

        e.preventDefault();

        const keys = [];
        if (e.ctrlKey) keys.push("CommandOrControl");
        if (e.altKey) keys.push("Alt");
        if (e.shiftKey) keys.push("Shift");
        if (e.metaKey) keys.push("Cmd");

        if (
          e.key !== "Control" &&
          e.key !== "Alt" &&
          e.key !== "Shift" &&
          e.key !== "Meta"
        ) {
          keys.push(e.key === " " ? "Space" : e.key);
        }

        if (keys.length > 1) {
          input.value = keys.join("+");
          input.dataset.recording = "false";
          input.blur();
        }
      });

      input.addEventListener("blur", () => {
        if (
          input.dataset.recording === "true" &&
          input.value === "按下新的快捷鍵..."
        ) {
          // 恢復原值
          this.loadSettingsToDialog();
        }
        input.dataset.recording = "false";
      });
    });
  }

  setupButtonEvents() {
    // 瀏覽路徑按鈕
    document
      .getElementById("browse-path")
      ?.addEventListener("click", async () => {
        // 開啟資料夾選擇對話框
        // TODO: 實作資料夾選擇
      });

    // 匯出設定
    document
      .getElementById("export-settings")
      ?.addEventListener("click", () => {
        const settingsJson = this.export();
        Utils.downloadFile(
          new Blob([settingsJson], { type: "application/json" }),
          "dukshot-settings.json"
        );
      });

    // 匯入設定
    document
      .getElementById("import-settings")
      ?.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              this.import(e.target.result);
            };
            reader.readAsText(file);
          }
        };
        input.click();
      });

    // 清除資料
    document
      .getElementById("clear-data")
      ?.addEventListener("click", async () => {
        const ui = window.DukshotApp?.ui;
        if (!ui) return;

        const confirmed = await ui.showConfirmDialog(
          "清除所有資料",
          "這將刪除所有設定和資料，此操作無法復原。確定要繼續嗎？",
          "清除",
          "取消"
        );

        if (confirmed) {
          await this.reset();
          ui.showNotification("所有資料已清除", "success");
          ui.closeModal();
        }
      });
  }

  loadSettingsToDialog() {
    // 載入設定值到對話框
    const elements = {
      "setting-theme": this.get("theme"),
      "setting-language": this.get("language"),
      "setting-always-on-top": this.get("alwaysOnTop"),
      "setting-minimize-to-tray": this.get("minimizeToTray"),
      "setting-show-notifications": this.get("showNotifications"),
      "setting-shortcut-region": this.get("shortcuts.regionCapture"),
      "setting-shortcut-fullscreen": this.get("shortcuts.fullScreenCapture"),
      "setting-shortcut-window": this.get("shortcuts.activeWindowCapture"),
      "setting-auto-clipboard": this.get("autoSaveToClipboard"),
      "setting-image-format": this.get("defaultImageFormat"),
      "setting-image-quality": this.get("imageQuality"),
      "setting-custom-path": this.get("customSavePath"),
      "setting-save-path": this.get("savePath"),
      "setting-single-layer": this.get("singleLayerStorage"),
      "setting-auto-folders": this.get("autoCreateFolders"),
      "setting-enable-hotkeys": this.get("enableHotkeys"),
      "setting-auto-update": this.get("autoUpdate"),
      "setting-telemetry": this.get("telemetry"),
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (!element) return;

      if (element.type === "checkbox") {
        element.checked = value;
      } else {
        element.value = value;
      }
    });

    // 觸發依賴的顯示/隱藏
    const customPathGroup = document.getElementById("custom-path-group");
    if (customPathGroup) {
      customPathGroup.style.display = this.get("customSavePath")
        ? "block"
        : "none";
    }

    // 更新品質顯示
    const qualityValue = document.getElementById("quality-value");
    if (qualityValue) {
      qualityValue.textContent = `${this.get("imageQuality")}%`;
    }
  }

  saveSettingsFromDialog() {
    const ui = window.DukshotApp?.ui;
    if (!ui) return;

    try {
      // 收集所有設定值
      const newSettings = {
        theme: document.getElementById("setting-theme")?.value,
        language: document.getElementById("setting-language")?.value,
        alwaysOnTop: document.getElementById("setting-always-on-top")?.checked,
        minimizeToTray: document.getElementById("setting-minimize-to-tray")
          ?.checked,
        showNotifications: document.getElementById("setting-show-notifications")
          ?.checked,
        shortcuts: {
          regionCapture: document.getElementById("setting-shortcut-region")
            ?.value,
          fullScreenCapture: document.getElementById(
            "setting-shortcut-fullscreen"
          )?.value,
          activeWindowCapture: document.getElementById(
            "setting-shortcut-window"
          )?.value,
        },
        autoSaveToClipboard: document.getElementById("setting-auto-clipboard")
          ?.checked,
        defaultImageFormat: document.getElementById("setting-image-format")
          ?.value,
        imageQuality: parseInt(
          document.getElementById("setting-image-quality")?.value
        ),
        customSavePath: document.getElementById("setting-custom-path")?.checked,
        savePath: document.getElementById("setting-save-path")?.value,
        singleLayerStorage: document.getElementById("setting-single-layer")
          ?.checked,
        autoCreateFolders: document.getElementById("setting-auto-folders")
          ?.checked,
        enableHotkeys: document.getElementById("setting-enable-hotkeys")
          ?.checked,
        autoUpdate: document.getElementById("setting-auto-update")?.checked,
        telemetry: document.getElementById("setting-telemetry")?.checked,
      };

      // 更新設定
      this.update(newSettings);

      // 儲存設定
      this.save().then((success) => {
        if (success) {
          ui.showNotification("設定已儲存", "success");
          ui.closeModal();
        } else {
          ui.showNotification("設定儲存失敗", "error");
        }
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      ui.showNotification("設定儲存失敗", "error");
    }
  }

  resetSettings() {
    const ui = window.DukshotApp?.ui;
    if (!ui) return;

    ui.showConfirmDialog("重設設定", "確定要將所有設定恢復為預設值嗎？").then(
      (confirmed) => {
        if (confirmed) {
          this.reset().then(() => {
            ui.showNotification("設定已重設", "success");
            this.loadSettingsToDialog();
          });
        }
      }
    );
  }

  // 事件監聽
  on(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  off(event, callback) {
    this.eventEmitter.off(event, callback);
  }
}

// 全域可用
window.SettingsManager = SettingsManager;
