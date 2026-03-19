/* ──────────────────────────────────────────────
   HEIC2JPG  –  local HEIC → JPG converter
   All processing happens in the browser.
   Uses native Canvas on iOS Safari, heic2any fallback elsewhere.
   ────────────────────────────────────────────── */

class HEIC2JPG {
    constructor() {
        this.files = [];          // { file, name, status, blob }
        this.maxFiles = 50;
        this.quality = 0.92;
        this.isConverting = false;

        // DOM refs
        this.dropZone        = document.getElementById('dropZone');
        this.fileInput       = document.getElementById('fileInput');
        this.fileList        = document.getElementById('fileList');
        this.fileListSection = document.getElementById('fileListSection');
        this.fileCount       = document.getElementById('fileCount');
        this.clearBtn        = document.getElementById('clearBtn');
        this.progressSection = document.getElementById('progressSection');
        this.progressText    = document.getElementById('progressText');
        this.overallFill     = document.getElementById('overallProgressFill');

        this.bindEvents();
    }

    /* ── Events ── */
    bindEvents() {
        // Click to upload
        this.dropZone.addEventListener('click', () => {
            if (!this.isConverting) this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            this.addFiles(e.target.files);
            this.fileInput.value = '';
        });

        // Drag and drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            if (!this.isConverting) this.addFiles(e.dataTransfer.files);
        });

        // Clear
        this.clearBtn.addEventListener('click', () => {
            if (!this.isConverting) this.clear();
        });
    }

    /* ── Add files & auto-convert ── */
    addFiles(fileList) {
        const incoming = Array.from(fileList);
        const remaining = this.maxFiles - this.files.length;
        const toAdd = incoming.slice(0, remaining);

        for (const file of toAdd) {
            // Accept .heic / .heif by extension (mime types are unreliable on iOS)
            const ext = file.name.toLowerCase().split('.').pop();
            if (ext !== 'heic' && ext !== 'heif') continue;

            this.files.push({
                file,
                name: file.name,
                status: 'pending',  // pending | converting | done | error
                blob: null,
                errorMsg: ''
            });
        }

        this.render();

        // Auto-start conversion immediately
        if (!this.isConverting && this.files.some(f => f.status === 'pending')) {
            this.convertAll();
        }
    }

    /* ── Clear all ── */
    clear() {
        this.files = [];
        this.isConverting = false;
        this.render();
    }

    /* ── Render file list ── */
    render() {
        const hasFiles = this.files.length > 0;
        this.fileListSection.hidden = !hasFiles;

        // Count label
        const done  = this.files.filter(f => f.status === 'done').length;
        const total = this.files.length;

        if (done === total && total > 0) {
            this.fileCount.textContent = `${total} bild${total !== 1 ? 'er' : ''} – klara!`;
        } else {
            this.fileCount.textContent = `${total} bild${total !== 1 ? 'er' : ''}`;
        }

        // Build list
        this.fileList.innerHTML = '';
        for (let i = 0; i < this.files.length; i++) {
            const f = this.files[i];
            const el = document.createElement('div');
            el.className = 'file-item' +
                (f.status === 'converting' ? ' converting' : '') +
                (f.status === 'done' ? ' done' : '') +
                (f.status === 'error' ? ' error' : '');

            const jpgName = f.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');

            let statusHTML = '';
            if (f.status === 'pending') {
                statusHTML = '<span class="badge badge-ghost badge-sm">Väntar</span>';
            } else if (f.status === 'converting') {
                statusHTML = '<span class="spinner"></span>';
            } else if (f.status === 'done') {
                statusHTML = `<button class="btn btn-primary btn-sm" data-download="${i}">Spara</button>`;
            } else if (f.status === 'error') {
                statusHTML = `<span class="badge badge-error badge-sm" title="${this.escapeHtml(f.errorMsg)}">Fel</span>`;
            }

            el.innerHTML = `
                <div class="min-w-0">
                    <div class="file-name">${this.escapeHtml(jpgName)}</div>
                    ${f.status === 'converting' ? '<div class="progress-track"><div class="progress-fill" style="width:50%"></div></div>' : ''}
                    ${f.status === 'done' ? '<div class="progress-track"><div class="progress-fill done" style="width:100%"></div></div>' : ''}
                </div>
                <div class="flex items-center gap-2">
                    ${statusHTML}
                </div>
            `;

            this.fileList.appendChild(el);
        }

        // Bind download buttons
        this.fileList.querySelectorAll('[data-download]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.download, 10);
                this.downloadFile(idx);
            });
        });
    }

    /* ── Convert a single HEIC to JPG blob ── */
    async convertOne(file) {
        // Strategy 1: Try native Canvas (works on iOS Safari which supports HEIC natively)
        try {
            const blob = await this.convertNative(file);
            if (blob && blob.size > 0) return blob;
        } catch (_) {
            // Native failed, try heic2any
        }

        // Strategy 2: Use heic2any library
        if (typeof heic2any !== 'undefined') {
            const result = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: this.quality
            });
            return Array.isArray(result) ? result[0] : result;
        }

        throw new Error('Konvertering stöds inte i denna webbläsare');
    }

    /* ── Native Canvas conversion (iOS Safari) ── */
    convertNative(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(
                        (blob) => {
                            URL.revokeObjectURL(url);
                            if (blob && blob.size > 0) {
                                resolve(blob);
                            } else {
                                reject(new Error('Canvas export failed'));
                            }
                        },
                        'image/jpeg',
                        this.quality
                    );
                } catch (err) {
                    URL.revokeObjectURL(url);
                    reject(err);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Native decode failed'));
            };

            img.src = url;
        });
    }

    /* ── Convert all files ── */
    async convertAll() {
        this.isConverting = true;
        this.progressSection.hidden = false;

        let completed = 0;
        const total = this.files.length;

        this.updateProgress(0, total);
        this.render();

        for (const entry of this.files) {
            if (entry.status !== 'pending') {
                completed++;
                this.updateProgress(completed, total);
                continue;
            }

            entry.status = 'converting';
            this.render();

            try {
                entry.blob = await this.convertOne(entry.file);
                entry.status = 'done';
            } catch (err) {
                entry.status = 'error';
                entry.errorMsg = err.message || 'Konvertering misslyckades';
                console.error(`Error converting ${entry.name}:`, err);
            }

            completed++;
            this.updateProgress(completed, total);
            this.render();
        }

        this.isConverting = false;

        // Auto-download
        const doneFiles = this.files.filter(f => f.status === 'done');
        if (doneFiles.length === 1) {
            this.downloadFile(this.files.indexOf(doneFiles[0]));
        } else if (doneFiles.length > 1) {
            await this.downloadAllAsZip();
        }

        this.render();

        // Hide progress after a moment
        setTimeout(() => {
            this.progressSection.hidden = true;
        }, 2000);
    }

    /* ── Progress ── */
    updateProgress(done, total) {
        this.progressText.textContent = `${done} / ${total}`;
        const pct = total > 0 ? (done / total * 100) : 0;
        this.overallFill.style.width = pct + '%';
    }

    /* ── Download single file ── */
    downloadFile(idx) {
        const entry = this.files[idx];
        if (!entry || !entry.blob) return;

        const jpgName = entry.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
        const url = URL.createObjectURL(entry.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = jpgName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ── Download all as zip ── */
    async downloadAllAsZip() {
        // Dynamically load JSZip if not available
        if (typeof JSZip === 'undefined') {
            await this.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        }

        const zip = new JSZip();
        const usedNames = new Set();

        for (const entry of this.files) {
            if (entry.status !== 'done' || !entry.blob) continue;
            let jpgName = entry.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');

            // Avoid duplicate names
            let finalName = jpgName;
            let counter = 1;
            while (usedNames.has(finalName)) {
                const dot = jpgName.lastIndexOf('.');
                finalName = jpgName.slice(0, dot) + `_${counter}` + jpgName.slice(dot);
                counter++;
            }
            usedNames.add(finalName);

            zip.file(finalName, entry.blob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heic2jpg_${this.timestamp()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ── Helpers ── */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    timestamp() {
        const d = new Date();
        return d.getFullYear().toString() +
            String(d.getMonth() + 1).padStart(2, '0') +
            String(d.getDate()).padStart(2, '0') + '-' +
            String(d.getHours()).padStart(2, '0') +
            String(d.getMinutes()).padStart(2, '0') +
            String(d.getSeconds()).padStart(2, '0');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    window.h2j = new HEIC2JPG();
});
