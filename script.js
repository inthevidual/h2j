/* ──────────────────────────────────────────────
   HEIC2JPG  –  local HEIC → JPG converter
   All processing happens in the browser.
   ────────────────────────────────────────────── */

class HEIC2JPG {
    constructor() {
        this.files = [];          // { file, name, status, blob }
        this.maxFiles = 50;
        this.quality = 0.92;
        this.isConverting = false;

        // DOM refs
        this.dropZone       = document.getElementById('dropZone');
        this.fileInput      = document.getElementById('fileInput');
        this.fileList        = document.getElementById('fileList');
        this.fileListSection = document.getElementById('fileListSection');
        this.fileCount       = document.getElementById('fileCount');
        this.clearBtn        = document.getElementById('clearBtn');
        this.convertBtn      = document.getElementById('convertBtn');
        this.convertSection  = document.getElementById('convertSection');
        this.qualitySection  = document.getElementById('qualitySection');
        this.qualitySlider   = document.getElementById('qualitySlider');
        this.qualityValue    = document.getElementById('qualityValue');
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

        // Convert
        this.convertBtn.addEventListener('click', () => {
            if (!this.isConverting) this.convertAll();
        });

        // Quality slider
        this.qualitySlider.addEventListener('input', (e) => {
            this.quality = parseInt(e.target.value, 10) / 100;
            this.qualityValue.textContent = e.target.value + '%';
        });
    }

    /* ── Add files ── */
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
        this.convertSection.hidden  = !hasFiles;
        this.qualitySection.hidden  = !hasFiles;

        // Count label
        const pending = this.files.filter(f => f.status === 'pending').length;
        const done    = this.files.filter(f => f.status === 'done').length;
        const total   = this.files.length;

        if (done === total && total > 0) {
            this.fileCount.textContent = `${total} bilder – klara!`;
        } else {
            this.fileCount.textContent = `${total} bild${total !== 1 ? 'er' : ''}`;
        }

        // Convert button state
        this.convertBtn.disabled = pending === 0 || this.isConverting;
        if (done === total && total > 0) {
            this.convertBtn.textContent = 'Alla klara!';
            this.convertBtn.disabled = true;
        } else {
            this.convertBtn.textContent = `Konvertera ${pending} bild${pending !== 1 ? 'er' : ''} till JPG`;
        }

        // Build list
        this.fileList.innerHTML = '';
        for (let i = 0; i < this.files.length; i++) {
            const f = this.files[i];
            const el = document.createElement('div');
            el.className = 'file-item' + (f.status === 'converting' ? ' converting' : '') + (f.status === 'done' ? ' done' : '') + (f.status === 'error' ? ' error' : '');

            const jpgName = f.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');

            let statusHTML = '';
            if (f.status === 'pending') {
                statusHTML = '<span class="badge badge-ghost badge-sm">Väntar</span>';
            } else if (f.status === 'converting') {
                statusHTML = '<span class="spinner"></span>';
            } else if (f.status === 'done') {
                statusHTML = `<button class="btn btn-primary btn-sm" data-download="${i}">Ladda ner</button>`;
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
                    ${f.status !== 'converting' ? `<button class="btn btn-ghost btn-sm btn-square" data-remove="${i}" title="Ta bort">✕</button>` : ''}
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

        // Bind remove buttons
        this.fileList.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.isConverting) return;
                const idx = parseInt(e.currentTarget.dataset.remove, 10);
                this.files.splice(idx, 1);
                this.render();
            });
        });
    }

    /* ── Convert all files ── */
    async convertAll() {
        this.isConverting = true;
        this.progressSection.hidden = false;

        const pending = this.files.filter(f => f.status === 'pending');
        let completed = 0;

        this.updateProgress(0, pending.length);
        this.render();

        for (const entry of this.files) {
            if (entry.status !== 'pending') {
                completed++;
                continue;
            }

            entry.status = 'converting';
            this.render();

            try {
                const blob = await heic2any({
                    blob: entry.file,
                    toType: 'image/jpeg',
                    quality: this.quality
                });

                // heic2any may return an array for multi-frame HEIC
                entry.blob = Array.isArray(blob) ? blob[0] : blob;
                entry.status = 'done';
            } catch (err) {
                entry.status = 'error';
                entry.errorMsg = err.message || 'Konvertering misslyckades';
                console.error(`Error converting ${entry.name}:`, err);
            }

            completed++;
            this.updateProgress(completed, this.files.length);
            this.render();
        }

        this.isConverting = false;

        // Auto-download if all succeeded
        const allDone = this.files.every(f => f.status === 'done');
        const doneFiles = this.files.filter(f => f.status === 'done');

        if (doneFiles.length === 1) {
            this.downloadFile(this.files.indexOf(doneFiles[0]));
        } else if (doneFiles.length > 1 && allDone) {
            this.downloadAllAsZip();
        }

        this.render();

        // Hide progress after a moment
        setTimeout(() => {
            this.progressSection.hidden = true;
        }, 1500);
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
        URL.revokeObjectURL(url);
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
        URL.revokeObjectURL(url);
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
