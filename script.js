/* ──────────────────────────────────────────────
   HEIC2JPG  –  local HEIC → JPG converter
   All processing happens in the browser.
   Native Canvas on Safari, libheif asm.js fallback elsewhere.
   No external dependencies at runtime.
   ────────────────────────────────────────────── */

class HEIC2JPG {
    constructor() {
        this.files = [];
        this.maxFiles = 50;
        this.quality = 0.92;
        this.isConverting = false;
        this._libheifModule = null;

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
        this.dropZone.addEventListener('click', () => {
            if (!this.isConverting) this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            this.addFiles(e.target.files);
            this.fileInput.value = '';
        });

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
            const ext = file.name.toLowerCase().split('.').pop();
            if (ext !== 'heic' && ext !== 'heif') continue;

            this.files.push({
                file,
                name: file.name,
                status: 'pending',
                blob: null,
                errorMsg: ''
            });
        }

        this.render();

        if (!this.isConverting && this.files.some(f => f.status === 'pending')) {
            this.convertAll();
        }
    }

    /* ── Clear all ── */
    clear() {
        this.files = [];
        this.isConverting = false;
        this.progressSection.hidden = true;
        this.render();
    }

    /* ── Render file list ── */
    render() {
        const hasFiles = this.files.length > 0;
        this.fileListSection.hidden = !hasFiles;

        const done  = this.files.filter(f => f.status === 'done').length;
        const total = this.files.length;

        if (done === total && total > 0) {
            this.fileCount.textContent = `${total} bild${total !== 1 ? 'er' : ''} – klara!`;
        } else {
            this.fileCount.textContent = `${total} bild${total !== 1 ? 'er' : ''}`;
        }

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
                statusHTML = `<span class="badge badge-sm" style="background:rgba(220,50,50,0.2);color:#f87171;border-color:rgba(220,50,50,0.4)" title="${this.escapeHtml(f.errorMsg)}">Fel</span>`;
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

        this.fileList.querySelectorAll('[data-download]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.download, 10);
                this.downloadFile(idx);
            });
        });
    }

    /* ───────────────────────────────────────────
       Conversion strategies
       1. Native: img + canvas (Safari / HEIC-capable browsers)
       2. libheif: local asm.js decoder (all browsers)
       ─────────────────────────────────────────── */

    async convertOne(file) {
        // Strategy 1: Native canvas (works on iOS Safari which decodes HEIC natively)
        try {
            const blob = await this.convertNative(file);
            if (blob && blob.size > 0) return blob;
        } catch (_) { /* native failed, try libheif */ }

        // Strategy 2: libheif asm.js decoder (works everywhere, no WASM file needed)
        return await this.convertWithLibheif(file);
    }

    /* ── Native: load in <img>, draw to canvas, export JPEG ── */
    convertNative(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            const timeout = setTimeout(() => {
                URL.revokeObjectURL(url);
                reject(new Error('Native decode timeout'));
            }, 10000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(
                        (blob) => {
                            URL.revokeObjectURL(url);
                            if (blob && blob.size > 0) resolve(blob);
                            else reject(new Error('Canvas export empty'));
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
                clearTimeout(timeout);
                URL.revokeObjectURL(url);
                reject(new Error('Native decode failed'));
            };

            img.src = url;
        });
    }

    /* ── libheif: load local asm.js decoder, use HeifDecoder API ── */
    async convertWithLibheif(file) {
        // Lazy-load libheif.js on first use
        if (!this._libheifModule) {
            if (typeof libheif === 'undefined') {
                await this.loadScript('libheif.js');
            }
            this._libheifModule = libheif();
            if (this._libheifModule.ready) {
                await this._libheifModule.ready;
            }
        }

        const mod = this._libheifModule;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const decoder = new mod.HeifDecoder();
        const images = decoder.decode(buffer);

        if (!images || images.length === 0) {
            throw new Error('Kunde inte avkoda HEIC-filen');
        }

        const image = images[0];
        const w = image.get_width();
        const h = image.get_height();

        // Use display() to get RGBA pixel data
        const imageData = new ImageData(w, h);
        const displayData = await new Promise((resolve, reject) => {
            image.display(imageData, (result) => {
                if (result) resolve(result);
                else reject(new Error('HEIF display callback failed'));
            });
        });

        // Draw to canvas and export as JPEG
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(displayData, 0, 0);

        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob && blob.size > 0) resolve(blob);
                    else reject(new Error('Canvas export failed'));
                },
                'image/jpeg',
                this.quality
            );
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
        if (typeof JSZip === 'undefined') {
            await this.loadScript('jszip.min.js');
        }

        const zip = new JSZip();
        const usedNames = new Set();

        for (const entry of this.files) {
            if (entry.status !== 'done' || !entry.blob) continue;
            let jpgName = entry.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');

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
            s.onerror = () => reject(new Error('Kunde inte ladda ' + src));
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
