// 設定頁面的 JavaScript
const { ipcRenderer } = require('electron');

// 設定管理類
class SettingsManager {
  constructor() {
    this.settings = {};
    this.originalSettings = {};
    this.recordingShortcut = null;
    this.shortcuts = {
      region: { default: 'Ctrl+PrintScreen', current: 'Ctrl+PrintScreen' },
      fullscreen: { default: 'PrintScreen', current: 'PrintScreen' },
      window: { default: 'Alt+PrintScreen', current: 'Alt+PrintScreen' }
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    this.updateUI();
  }

  async loadSettings() {
    try {
      // 從主程序獲取設定
      this.settings = await ipcRenderer.invoke('get-settings');
      this.originalSettings = JSON.parse(JSON.stringify(this.settings));
      
      // 載入快捷鍵設定
      if (this.settings.shortcuts) {
        Object.keys(this.settings.shortcuts).forEach(type => {
          if (this.shortcuts[type]) {
            this.shortcuts[type].current = this.settings.shortcuts[type].key || this.shortcuts[type].default;
          }
        });
      }
    } catch (error) {
      console.error('載入設定失敗:', error);
      this.settings = this.getDefaultSettings();
    }
  }

  getDefaultSettings() {
    return {
      window: {
        startupAlwaysOnTop: false,
        minimizeToTray: false
      },
      shortcuts: {
        enabled: true,
        region: { enabled: true, key: 'Ctrl+PrintScreen' },
        fullscreen: { enabled: true, key: 'PrintScreen' },
        window: { enabled: true, key: 'Alt+PrintScreen' }
      },
      general: {
        autoSave: false,
        screenshotFormat: 'png'
      }
    };
  }

  bindEvents() {
    // 視窗設定
    document.getElementById('startup-always-on-top').addEventListener('change', (e) => {
      this.settings.window = this.settings.window || {};
      this.settings.window.startupAlwaysOnTop = e.target.checked;
    });

    document.getElementById('minimize-to-tray').addEventListener('change', (e) => {
      this.settings.window = this.settings.window || {};
      this.settings.window.minimizeToTray = e.target.checked;
    });

    // 快捷鍵設定
    document.getElementById('enable-global-shortcuts').addEventListener('change', (e) => {
      this.settings.shortcuts = this.settings.shortcuts || {};
      this.settings.shortcuts.enabled = e.target.checked;
      this.toggleShortcutsList(e.target.checked);
    });

    // 各個快捷鍵的啟用/停用
    ['region', 'fullscreen', 'window'].forEach(type => {
      const checkbox = document.getElementById(`shortcut-${type}-enabled`);
      checkbox.addEventListener('change', (e) => {
        this.settings.shortcuts[type] = this.settings.shortcuts[type] || {};
        this.settings.shortcuts[type].enabled = e.target.checked;
      });
    });

    // 編輯快捷鍵按鈕
    document.querySelectorAll('.edit-key-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shortcutType = e.target.dataset.shortcut;
        this.startRecordingShortcut(shortcutType);
      });
    });

    // 重設快捷鍵按鈕
    document.querySelectorAll('.reset-key-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shortcutType = e.target.dataset.shortcut;
        this.resetShortcut(shortcutType);
      });
    });

    // 一般設定
    document.getElementById('auto-save').addEventListener('change', (e) => {
      this.settings.general = this.settings.general || {};
      this.settings.general.autoSave = e.target.checked;
    });

    document.getElementById('screenshot-format').addEventListener('change', (e) => {
      this.settings.general = this.settings.general || {};
      this.settings.general.screenshotFormat = e.target.value;
    });

    // 按鈕事件
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('cancel-settings').addEventListener('click', () => {
      window.close();
    });

    // ESC 鍵取消錄製
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.recordingShortcut) {
        this.cancelRecording();
      }
    });
  }

  updateUI() {
    // 更新視窗設定
    if (this.settings.window) {
      document.getElementById('startup-always-on-top').checked = 
        this.settings.window.startupAlwaysOnTop || false;
      document.getElementById('minimize-to-tray').checked = 
        this.settings.window.minimizeToTray || false;
    }

    // 更新快捷鍵設定
    if (this.settings.shortcuts) {
      document.getElementById('enable-global-shortcuts').checked = 
        this.settings.shortcuts.enabled !== false;
      
      ['region', 'fullscreen', 'window'].forEach(type => {
        const shortcut = this.settings.shortcuts[type];
        if (shortcut) {
          document.getElementById(`shortcut-${type}-enabled`).checked = 
            shortcut.enabled !== false;
          document.getElementById(`shortcut-${type}-key`).value = 
            shortcut.key || this.shortcuts[type].default;
        }
      });

      this.toggleShortcutsList(this.settings.shortcuts.enabled !== false);
    }

    // 更新一般設定
    if (this.settings.general) {
      document.getElementById('auto-save').checked = 
        this.settings.general.autoSave || false;
      document.getElementById('screenshot-format').value = 
        this.settings.general.screenshotFormat || 'png';
    }
  }

  toggleShortcutsList(enabled) {
    const shortcutsList = document.getElementById('shortcuts-list');
    shortcutsList.style.opacity = enabled ? '1' : '0.5';
    shortcutsList.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  startRecordingShortcut(type) {
    if (this.recordingShortcut) {
      this.cancelRecording();
    }

    this.recordingShortcut = type;
    const input = document.getElementById(`shortcut-${type}-key`);
    input.classList.add('recording');
    input.value = '請按下組合鍵...';
    
    // 監聽按鍵
    const keyHandler = (e) => {
      e.preventDefault();
      
      if (e.key === 'Escape') {
        this.cancelRecording();
        return;
      }

      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Meta');

      // 獲取實際按鍵
      let key = e.key;
      if (key === ' ') key = 'Space';
      else if (key.length === 1) key = key.toUpperCase();
      else if (key === 'ArrowUp') key = 'Up';
      else if (key === 'ArrowDown') key = 'Down';
      else if (key === 'ArrowLeft') key = 'Left';
      else if (key === 'ArrowRight') key = 'Right';

      // 組合快捷鍵字串
      const shortcut = [...modifiers, key].join('+');
      
      if (modifiers.length > 0 || ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','PrintScreen','Insert','Delete','Home','End','PageUp','PageDown'].includes(key)) {
        this.setShortcut(type, shortcut);
        document.removeEventListener('keydown', keyHandler);
      }
    };

    document.addEventListener('keydown', keyHandler);
  }

  cancelRecording() {
    if (!this.recordingShortcut) return;

    const input = document.getElementById(`shortcut-${this.recordingShortcut}-key`);
    input.classList.remove('recording');
    input.value = this.shortcuts[this.recordingShortcut].current;
    this.recordingShortcut = null;
  }

  setShortcut(type, shortcut) {
    // 檢查快捷鍵衝突
    for (const [otherType, data] of Object.entries(this.shortcuts)) {
      if (otherType !== type && data.current === shortcut) {
        alert(`快捷鍵 ${shortcut} 已被「${this.getShortcutName(otherType)}」使用`);
        this.cancelRecording();
        return;
      }
    }

    this.shortcuts[type].current = shortcut;
    this.settings.shortcuts[type] = this.settings.shortcuts[type] || {};
    this.settings.shortcuts[type].key = shortcut;
    
    const input = document.getElementById(`shortcut-${type}-key`);
    input.classList.remove('recording');
    input.value = shortcut;
    this.recordingShortcut = null;
  }

  resetShortcut(type) {
    const defaultKey = this.shortcuts[type].default;
    this.shortcuts[type].current = defaultKey;
    this.settings.shortcuts[type] = this.settings.shortcuts[type] || {};
    this.settings.shortcuts[type].key = defaultKey;
    document.getElementById(`shortcut-${type}-key`).value = defaultKey;
  }

  getShortcutName(type) {
    const names = {
      region: '區域截圖',
      fullscreen: '全螢幕截圖',
      window: '視窗截圖'
    };
    return names[type] || type;
  }

  async saveSettings() {
    try {
      // 儲存設定到主程序
      await ipcRenderer.invoke('save-settings', this.settings);
      
      // 更新快捷鍵
      if (this.settings.shortcuts) {
        await ipcRenderer.invoke('update-shortcuts', this.settings.shortcuts);
      }
      
      // 關閉視窗
      window.close();
    } catch (error) {
      console.error('儲存設定失敗:', error);
      alert('儲存設定失敗，請重試');
    }
  }
}

// 初始化設定管理器
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});