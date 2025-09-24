/* ===========================================
   檔案管理器 - 負責圖片檔案的管理和操作
   =========================================== */

class FileManager {
  constructor() {
    this.eventEmitter = Utils.createEventEmitter();
    this.currentFolder = "今日";
    this.files = new Map();
    this.searchQuery = "";
    this.isLoading = false;
    this.lastDirectory = null; // 記錄實際儲存目錄供「開啟資料夾」使用
  }

  async loadFolder(folderName) {
    if (this.isLoading) return;

    this.isLoading = true;
    this.currentFolder = folderName;

    try {
      // 實際實作中會從檔案系統讀取
      const files = await this.getFilesFromFolder(folderName);

      this.files.clear();
      files.forEach((file) => {
        this.files.set(file.id, file);
      });

      this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());
    } catch (error) {
      console.error("Failed to load folder:", error);
      this.eventEmitter.emit("loadError", error);
    } finally {
      this.isLoading = false;
    }
  }

  async getFilesFromFolder(folderName) {
    // 優先從主進程列出真實截圖檔案
    try {
      if (window?.electronAPI?.files?.listScreenshots) {
        const res = await window.electronAPI.files.listScreenshots();
        if (res?.success && Array.isArray(res.files)) {
          // 記錄實際儲存目錄供「開啟資料夾」使用
          this.lastDirectory = res.directory || this.lastDirectory;

          // 推導分頁顯示名稱：Desktop -> 桌面，否則使用資料夾名稱或傳入的 folderName
          const dirName = (res.directory || "").split(/[\\/]/).pop() || "";
          const folderLabel =
            dirName.toLowerCase() === "desktop" ? "桌面" : (dirName || folderName);

          // 對齊系統內部檔案結構，讓 UI 可以直接顯示
          const realFiles = res.files.map((f) => {
            // 若無縮圖，將本機路徑轉成 file:/// URL 以供 <img> 使用
            const fileUrl =
              typeof f.path === "string"
                ? (f.path.startsWith("file://")
                    ? f.path
                    : "file:///" + f.path.replace(/\\/g, "/"))
                : "";

            return {
              id: f.id || Utils.generateId(),
              name: f.name,
              path: fileUrl || f.path || "",
              thumbnail: f.thumbnail || fileUrl,
              size: f.size || 0,
              createdAt: f.createdAt || new Date().toISOString(),
              modifiedAt: f.modifiedAt || new Date().toISOString(),
              type: f.type || "image/png",
              folder: folderLabel,
              dimensions: f.dimensions || { width: 0, height: 0 },
            };
          });

          return realFiles;
        }
      }
    } catch (e) {
      console.warn("listScreenshots failed, fallback to mock:", e);
    }

    // Fallback：模擬檔案資料 (保留原本的行為)
    const mockFiles = [];

    // 根據資料夾名稱生成不同的模擬檔案
    const fileCount = Math.floor(Math.random() * 10) + 5;

    for (let i = 0; i < fileCount; i++) {
      const now = new Date();
      const createdAt = new Date(
        now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000
      );

      mockFiles.push({
        id: Utils.generateId(),
        name: `${folderName}_截圖_${i + 1}.png`,
        path: `./mock/images/${folderName}_${i + 1}.png`,
        thumbnail: `data:image/svg+xml,${encodeURIComponent(
          this.generatePlaceholderSVG(200, 150, `${folderName} ${i + 1}`)
        )}`,
        size: Math.floor(Math.random() * 1000000) + 100000, // 100KB - 1MB
        createdAt: createdAt.toISOString(),
        modifiedAt: createdAt.toISOString(),
        type: "image/png",
        folder: folderName,
        dimensions: {
          width: 1920,
          height: 1080,
        },
      });
    }

    return mockFiles;
  }

  generatePlaceholderSVG(width, height, text) {
    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <rect x="10" y="10" width="${width - 20}" height="${
      height - 20
    }" fill="none" stroke="#ddd" stroke-width="2"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial, sans-serif" font-size="14" fill="#999">
          ${text}
        </text>
      </svg>
    `;
  }

  getFilteredFiles() {
    let files = Array.from(this.files.values());

    // 搜尋過濾
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      files = files.filter((file) => file.name.toLowerCase().includes(query));
    }

    // 排序 (按建立時間倒序)
    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return files;
  }

  search(query) {
    this.searchQuery = query.trim();
    this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());
  }

  refresh() {
    this.loadFolder(this.currentFolder);
  }

  getCurrentFolderPath() {
    // 儲存目錄（來自主進程）優先，其次回退到示意目錄
    if (this.lastDirectory) {
      return this.lastDirectory;
    }
    return `./screenshots/${this.currentFolder}`;
  }

  selectFile(fileId) {
    const file = this.files.get(fileId);
    if (file) {
      this.eventEmitter.emit("fileSelected", file);
    }
  }

  deselectFile(fileId) {
    const file = this.files.get(fileId);
    if (file) {
      this.eventEmitter.emit("fileDeselected", file);
    }
  }

  async deleteFiles(fileIds) {
    try {
      // 實際實作中會刪除檔案
      const deletedFiles = [];

      for (const fileId of fileIds) {
        const file = this.files.get(fileId);
        if (file) {
          deletedFiles.push(file);
          this.files.delete(fileId);
        }
      }

      this.eventEmitter.emit("filesDeleted", deletedFiles);
      this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());

      return true;
    } catch (error) {
      console.error("Failed to delete files:", error);
      throw error;
    }
  }

  async renameFile(fileId, newName) {
    try {
      const file = this.files.get(fileId);
      if (!file) {
        throw new Error("File not found");
      }

      // 驗證檔名
      if (!this.validateFileName(newName)) {
        throw new Error("Invalid file name");
      }

      // 實際實作中會重新命名檔案
      const oldName = file.name;
      file.name = newName;
      file.modifiedAt = new Date().toISOString();

      this.eventEmitter.emit("fileRenamed", file, oldName);
      this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());

      return true;
    } catch (error) {
      console.error("Failed to rename file:", error);
      throw error;
    }
  }

  validateFileName(name) {
    // 檢查檔名是否有效
    if (!name || typeof name !== "string") return false;
    if (name.length === 0 || name.length > 255) return false;

    // 檢查非法字元
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) return false;

    // 檢查保留名稱 (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const nameWithoutExtension = name.split(".")[0];
    if (reservedNames.test(nameWithoutExtension)) return false;

    return true;
  }

  async copyFiles(fileIds, targetFolder) {
    try {
      const copiedFiles = [];

      for (const fileId of fileIds) {
        const file = this.files.get(fileId);
        if (file) {
          // 實際實作中會複製檔案
          const copiedFile = {
            ...Utils.deepClone(file),
            id: Utils.generateId(),
            folder: targetFolder,
            name: this.generateCopyName(file.name),
          };

          copiedFiles.push(copiedFile);
        }
      }

      this.eventEmitter.emit("filesCopied", copiedFiles, targetFolder);

      return copiedFiles;
    } catch (error) {
      console.error("Failed to copy files:", error);
      throw error;
    }
  }

  generateCopyName(originalName) {
    const parts = originalName.split(".");
    const extension = parts.pop();
    const baseName = parts.join(".");

    let counter = 1;
    let newName = `${baseName}_副本${extension ? "." + extension : ""}`;

    // 檢查是否已存在相同名稱
    while (this.isFileNameExists(newName)) {
      counter++;
      newName = `${baseName}_副本${counter}${extension ? "." + extension : ""}`;
    }

    return newName;
  }

  isFileNameExists(name) {
    return Array.from(this.files.values()).some((file) => file.name === name);
  }

  async moveFiles(fileIds, targetFolder) {
    try {
      const movedFiles = [];

      for (const fileId of fileIds) {
        const file = this.files.get(fileId);
        if (file) {
          // 實際實作中會移動檔案
          const oldFolder = file.folder;
          file.folder = targetFolder;
          file.modifiedAt = new Date().toISOString();

          movedFiles.push({ file, oldFolder });
        }
      }

      this.eventEmitter.emit("filesMoved", movedFiles, targetFolder);

      // 如果移動的檔案不在當前資料夾，從當前列表中移除
      if (targetFolder !== this.currentFolder) {
        fileIds.forEach((id) => this.files.delete(id));
        this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());
      }

      return movedFiles;
    } catch (error) {
      console.error("Failed to move files:", error);
      throw error;
    }
  }

  async importImages(imageFiles, targetFolder) {
    try {
      const importedFiles = [];

      for (const file of imageFiles) {
        // 驗證檔案類型
        if (!Utils.isImageFile(file.name)) {
          console.warn(`Skipping non-image file: ${file.name}`);
          continue;
        }

        // 實際實作中會複製檔案到目標資料夾
        const importedFile = {
          id: Utils.generateId(),
          name: file.name,
          path: `./screenshots/${targetFolder}/${file.name}`,
          thumbnail: await this.createThumbnail(file),
          size: file.size,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          type: file.type,
          folder: targetFolder,
          dimensions: await Utils.getImageDimensions(file),
        };

        // 檢查檔名衝突
        if (this.isFileNameExists(importedFile.name)) {
          importedFile.name = this.generateCopyName(importedFile.name);
        }

        importedFiles.push(importedFile);

        // 如果是當前資料夾，加入到列表中
        if (targetFolder === this.currentFolder) {
          this.files.set(importedFile.id, importedFile);
        }
      }

      this.eventEmitter.emit("filesImported", importedFiles, targetFolder);

      if (targetFolder === this.currentFolder) {
        this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());
      }

      return importedFiles;
    } catch (error) {
      console.error("Failed to import images:", error);
      throw error;
    }
  }

  async createThumbnail(file, maxWidth = 300, maxHeight = 200) {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      return new Promise((resolve) => {
        img.onload = () => {
          // 計算縮圖尺寸
          let { width, height } = img;
          const ratio = Math.min(maxWidth / width, maxHeight / height);

          width *= ratio;
          height *= ratio;

          canvas.width = width;
          canvas.height = height;

          // 繪製縮圖
          ctx.drawImage(img, 0, 0, width, height);

          // 轉換為 Data URL
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };

        img.onerror = () => {
          // 如果載入失敗，使用佔位圖
          resolve(this.generatePlaceholderSVG(maxWidth, maxHeight, "圖片"));
        };

        img.src = URL.createObjectURL(file);
      });
    } catch (error) {
      console.error("Failed to create thumbnail:", error);
      return this.generatePlaceholderSVG(maxWidth, maxHeight, "圖片");
    }
  }

  async addScreenshot(imageData, filename, folder = null, filePath = null) {
    try {
      const targetFolder = folder || this.currentFolder;

      // 決定顯示與路徑
      // - 優先使用主程序回傳的實際檔案路徑（轉為 file:/// URL 供 <img> 使用）
      // - 若沒有檔案路徑，則使用 DataURL 立即顯示
      let resolvedPath = filePath || `./screenshots/${targetFolder}/${filename}`;
      let displaySrc = imageData;

      if (!displaySrc && resolvedPath) {
        const isFileUrl =
          typeof resolvedPath === "string" && resolvedPath.startsWith("file://");
        displaySrc = isFileUrl
          ? resolvedPath
          : "file:///" + String(resolvedPath).replace(/\\/g, "/");
      }

      const file = {
        id: Utils.generateId(),
        name: filename,
        path: resolvedPath,
        thumbnail: displaySrc, // 讓 <img> 可以立即顯示（DataURL 或 file:///）
        size: imageData ? this.estimateImageSize(imageData) : 0,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        type: "image/png",
        folder: targetFolder,
        dimensions: this.extractImageDimensions(imageData),
      };

      if (targetFolder === this.currentFolder) {
        this.files.set(file.id, file);
        this.eventEmitter.emit("filesLoaded", this.getFilteredFiles());
      }

      this.eventEmitter.emit("screenshotAdded", file);

      return file;
    } catch (error) {
      console.error("Failed to add screenshot:", error);
      throw error;
    }
  }

  estimateImageSize(dataUrl) {
    // 估算 Data URL 的檔案大小
    const base64 = dataUrl.split(",")[1] || "";
    return Math.floor(base64.length * 0.75); // Base64 解碼後大約是原大小的 75%
  }

  extractImageDimensions(dataUrl) {
    // 從 Data URL 提取圖片尺寸 (實際實作中可能需要更複雜的方法)
    return {
      width: 1920,
      height: 1080,
    };
  }

  getFileById(fileId) {
    return this.files.get(fileId);
  }

  getFilesByFolder(folderName) {
    return Array.from(this.files.values()).filter(
      (file) => file.folder === folderName
    );
  }

  getAllFiles() {
    return Array.from(this.files.values());
  }

  getFileCount() {
    return this.files.size;
  }

  getTotalSize() {
    return Array.from(this.files.values()).reduce(
      (total, file) => total + (file.size || 0),
      0
    );
  }

  // 事件監聽
  on(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  off(event, callback) {
    this.eventEmitter.off(event, callback);
  }

  emit(event, ...args) {
    this.eventEmitter.emit(event, ...args);
  }
}

// 全域可用
window.FileManager = FileManager;