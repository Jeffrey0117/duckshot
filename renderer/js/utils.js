/* ===========================================
   工具函數集合
   =========================================== */

class Utils {
  // 格式化檔案大小
  static formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // 格式化日期
  static formatDate(date) {
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  }

  // 生成唯一 ID
  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 防抖函數
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 節流函數
  static throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // 深度複製
  static deepClone(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map((item) => Utils.deepClone(item));
    if (typeof obj === "object") {
      const cloned = {};
      Object.keys(obj).forEach((key) => {
        cloned[key] = Utils.deepClone(obj[key]);
      });
      return cloned;
    }
  }

  // 檢查是否為有效的圖片檔案
  static isImageFile(filename) {
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".webp",
      ".svg",
    ];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
    return imageExtensions.includes(ext);
  }

  // 取得檔案副檔名
  static getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf(".") + 1);
  }

  // 檢查元素是否在視窗範圍內
  static isElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // 平滑滾動到元素
  static scrollToElement(element, offset = 0) {
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
  }

  // 複製文字到剪貼簿
  static async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // 降級方案
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        return true;
      } catch (err) {
        return false;
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }

  // 下載檔案
  static downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 讀取檔案為 Data URL
  static readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 壓縮圖片
  static compressImage(file, quality = 0.8, maxWidth = 1920, maxHeight = 1080) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // 計算新的尺寸
        let { width, height } = img;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        // 繪製圖片
        ctx.drawImage(img, 0, 0, width, height);

        // 轉換為 Blob
        canvas.toBlob(resolve, "image/jpeg", quality);
      };

      img.src = URL.createObjectURL(file);
    });
  }

  // 取得圖片尺寸
  static getImageDimensions(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // 格式化快捷鍵文字
  static formatShortcut(shortcut) {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    return shortcut
      .replace(/CommandOrControl/g, isMac ? "⌘" : "Ctrl")
      .replace(/Alt/g, isMac ? "⌥" : "Alt")
      .replace(/Shift/g, isMac ? "⇧" : "Shift")
      .replace(/PrintScreen/g, isMac ? "F13" : "PrtScn");
  }

  // 檢查是否為 macOS
  static isMac() {
    return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  }

  // 檢查是否為 Windows
  static isWindows() {
    return navigator.platform.toUpperCase().indexOf("WIN") >= 0;
  }

  // 檢查是否為 Linux
  static isLinux() {
    return navigator.platform.toUpperCase().indexOf("LINUX") >= 0;
  }

  // 安全的 JSON 解析
  static safeJsonParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }

  // 創建延遲 Promise
  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 重試函數
  static async retry(fn, maxAttempts = 3, delay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await Utils.delay(delay * attempt);
        }
      }
    }

    throw lastError;
  }

  // 創建可取消的 Promise
  static createCancelablePromise(promise) {
    let isCanceled = false;

    const wrappedPromise = new Promise((resolve, reject) => {
      promise
        .then((result) => {
          if (!isCanceled) {
            resolve(result);
          }
        })
        .catch((error) => {
          if (!isCanceled) {
            reject(error);
          }
        });
    });

    return {
      promise: wrappedPromise,
      cancel: () => {
        isCanceled = true;
      },
    };
  }

  // 事件發射器
  static createEventEmitter() {
    const events = {};

    return {
      on(event, callback) {
        if (!events[event]) {
          events[event] = [];
        }
        events[event].push(callback);
      },

      off(event, callback) {
        if (events[event]) {
          events[event] = events[event].filter((cb) => cb !== callback);
        }
      },

      emit(event, ...args) {
        if (events[event]) {
          events[event].forEach((callback) => callback(...args));
        }
      },

      once(event, callback) {
        const onceCallback = (...args) => {
          callback(...args);
          this.off(event, onceCallback);
        };
        this.on(event, onceCallback);
      },
    };
  }
}

// 全域可用
window.Utils = Utils;
