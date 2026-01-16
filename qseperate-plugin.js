// MARK: QSeparator Plugin
// Standalone plugin for extracting questions from PDFs/Images using OpenCV.js
// Runs entirely in the browser.

const OPENCV_URL = "https://docs.opencv.org/4.8.0/opencv.js";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

// MARK: Dependency Loader
const loadScript = (src, id) => {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve();
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
};

const waitForGlobal = (name, timeout = 10000) => {
    return new Promise((resolve, reject) => {
        if (window[name]) return resolve(window[name]);
        const start = Date.now();
        const timer = setInterval(() => {
            if (window[name]) {
                clearInterval(timer);
                resolve(window[name]);
            } else if (Date.now() - start > timeout) {
                clearInterval(timer);
                reject(new Error(`Timeout waiting for ${name}`));
            }
        }, 100);
    });
};

// MARK: Logic Port (Browser)
class QuestionExtractor {
    constructor(o = {}) {
        this.debug = o.debug ?? false;
        this.vGap = o.v_gap ?? 45;
        this.hGap = o.h_gap ?? 150;
        this.exp = o.expansion ?? 10;
        this.minH = o.min_height ?? 50;
        this.minW = o.min_width ?? 100;
        this.cv = window.cv;
    }

    _divider(img) {
        const cv = this.cv;
        const h = img.rows, w = img.cols, rs = Math.floor(w * 0.4);
        const rect = new cv.Rect(rs, 0, Math.floor(w * 0.2), h);
        const strip = img.roi(rect);

        const gray = new cv.Mat(), bin = new cv.Mat(), edge = new cv.Mat(), lines = new cv.Mat();
        let result = { x: w / 2, m: 0 };

        try {
            cv.cvtColor(strip, gray, cv.COLOR_RGBA2GRAY);
            cv.threshold(gray, bin, 200, 255, cv.THRESH_BINARY_INV);
            cv.Canny(bin, edge, 50, 150);
            cv.HoughLinesP(edge, lines, 1, Math.PI / 180, h >> 3, h / 5, 40);

            const pts = [];
            for (let i = 0; i < lines.rows; i++) {
                const x1 = lines.data32S[i * 4];
                const y1 = lines.data32S[i * 4 + 1];
                const x2 = lines.data32S[i * 4 + 2];
                const y2 = lines.data32S[i * 4 + 3];

                if (y2 !== y1) {
                    const m = (x2 - x1) / (y2 - y1);
                    if (Math.abs(m) < 0.2) pts.push({ m, b: x1 + rs - m * y1 });
                }
            }

            if (pts.length) {
                pts.sort((a, b) => a.m - b.m); const mm = pts[Math.floor(pts.length / 2)].m;
                pts.sort((a, b) => a.b - b.b); const bm = pts[Math.floor(pts.length / 2)].b;
                result = { x: Math.max(w * 0.3, Math.min(w * 0.7, bm)), m: mm };
            }
        } finally {
            strip.delete(); gray.delete(); bin.delete(); edge.delete(); lines.delete();
        }
        return result;
    }

    _blocks(img) {
        const cv = this.cv;
        const h = img.rows, w = img.cols, maxW = w * 0.95, maxH = h * 0.95;
        const gray = new cv.Mat();
        const mats = []; // track extra mats to delete
        const blocks = [];

        try {
            cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);

            // Method 1: Gradient
            const gx = new cv.Mat(), gy = new cv.Mat(); mats.push(gx, gy);
            cv.Sobel(gray, gx, cv.CV_16S, 1, 0, 3);
            cv.Sobel(gray, gy, cv.CV_16S, 0, 1, 3);

            const ax = new cv.Mat(), ay = new cv.Mat(); mats.push(ax, ay);
            cv.convertScaleAbs(gx, ax);
            cv.convertScaleAbs(gy, ay);

            const grad = new cv.Mat(); mats.push(grad);
            cv.addWeighted(ax, 0.5, ay, 0.5, 0, grad);

            const th = new cv.Mat(); mats.push(th);
            cv.threshold(grad, th, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

            const k1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 3));
            const dil = new cv.Mat(); mats.push(dil);
            // Note: struct elements generally don't need manual deletion in JS wrapper if not reused heavily, usually let GC handle or delete if strict
            cv.dilate(th, dil, k1, new cv.Point(-1, -1), 2);
            k1.delete();

            const cnt = new cv.MatVector();
            cv.findContours(dil, cnt, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            const add = (c, min) => {
                for (let i = 0; i < c.size(); i++) {
                    const r = cv.boundingRect(c.get(i));
                    if (r.width > min && r.width < maxW && r.height > min && r.height < maxH)
                        blocks.push([r.x, r.y, r.x + r.width, r.y + r.height]);
                }
            };
            add(cnt, 10);
            cnt.delete();

            // Method 2: Adaptive Threshold
            const blur = new cv.Mat(), adap = new cv.Mat(), dil2 = new cv.Mat(); mats.push(blur, adap, dil2);
            cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
            cv.adaptiveThreshold(blur, adap, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 11, 2);

            const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
            cv.dilate(adap, dil2, k2);
            k2.delete();

            const cnt2 = new cv.MatVector();
            cv.findContours(dil2, cnt2, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            add(cnt2, 15);
            cnt2.delete();

        } finally {
            gray.delete();
            mats.forEach(m => m.delete());
        }
        return blocks;
    }

    _merge(blocks) {
        if (!blocks.length) return [];
        const n = blocks.length, adj = Array.from({ length: n }, () => []);
        const { vGap, hGap } = this;

        for (let i = 0; i < n; i++) {
            const [x1, y1, x2, y2] = blocks[i];
            for (let j = i + 1; j < n; j++) {
                const b = blocks[j];
                if (x2 + hGap >= b[0] && x1 - hGap <= b[2] && y2 + vGap >= b[1] && y1 - vGap <= b[3]) {
                    adj[i].push(j); adj[j].push(i);
                }
            }
        }

        const seen = new Uint8Array(n), out = [];
        for (let i = 0; i < n; i++) {
            if (seen[i]) continue;
            seen[i] = 1;
            let [x1, y1, x2, y2] = blocks[i];
            const q = [i];
            while (q.length) {
                const curr = q.shift();
                for (const v of adj[curr]) {
                    if (seen[v]) continue;
                    seen[v] = 1; q.push(v);
                    const b = blocks[v];
                    x1 = Math.min(x1, b[0]); y1 = Math.min(y1, b[1]);
                    x2 = Math.max(x2, b[2]); y2 = Math.max(y2, b[3]);
                }
            }
            out.push([x1, y1, x2, y2]);
        }
        return out;
    }

    processPage(imgMat, pnum = 1) {
        const cv = this.cv;
        const h = imgMat.rows, w = imgMat.cols;
        const div = this._divider(imgMat);

        const masked = imgMat.clone();
        cv.line(masked, new cv.Point(div.x, 0), new cv.Point(div.x + div.m * h, h), new cv.Scalar(0, 0, 0, 255), 20);

        const raw = this._blocks(masked);
        masked.delete();

        const L = [], R = [];
        for (const b of raw) {
            const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
            (mx < div.x + div.m * my ? L : R).push(b);
        }

        const { exp, minH, minW } = this, qs = [];
        const processSide = (side, blks) => {
            const merged = this._merge(blks).sort((a, b) => a[1] - b[1]);
            merged.forEach((b, i) => {
                if (b[3] - b[1] < minH || b[2] - b[0] < minW) return;

                const x = Math.max(0, b[0] - exp);
                const y = Math.max(0, b[1] - exp);
                const wBox = Math.min(w, b[2] + exp) - x;
                const hBox = Math.min(h, b[3] + exp) - y;

                const rect = new cv.Rect(x, y, wBox, hBox);
                const roi = imgMat.roi(rect);

                // Convert ROI to canvas/dataURL
                const canvas = document.createElement('canvas');
                cv.imshow(canvas, roi);
                const dataUrl = canvas.toDataURL('image/png');

                qs.push({
                    id: `p${pnum}_${side}_q${i + 1}`,
                    box: [x, y, x + wBox, y + hBox],
                    dataUrl
                });

                roi.delete();
            });
        };

        processSide('left', L);
        processSide('right', R);
        return qs;
    }
}

// MARK: Plugin Definition
export default {
    name: "Soru Ayıklayıcı",
    description: "PDF ve görsellerden soruları otomatik ayıkla",
    version: "1.0.0",
    author: "Anonymous",
    icon: "✂️",
    slots: [], // Standalone

    render: ({ onClose }) => {
        const React = window.React;
        const { useState, useEffect, useCallback, useRef } = React;

        // States
        const [isReady, setIsReady] = useState(false);
        const [status, setStatus] = useState("Kütüphaneler yükleniyor...");
        const [files, setFiles] = useState([]);
        const [results, setResults] = useState([]);
        const [selectedIds, setSelectedIds] = useState(new Set());
        const [isProcessing, setIsProcessing] = useState(false);

        // Load deps
        useEffect(() => {
            const loadDeps = async () => {
                try {
                    await Promise.all([
                        loadScript(OPENCV_URL, 'opencv-js'),
                        loadScript(PDFJS_URL, 'pdfjs'),
                        loadScript(JSZIP_URL, 'jszip')
                    ]);

                    // Wait for globals
                    await waitForGlobal('cv');
                    await waitForGlobal('pdfjsLib');
                    await waitForGlobal('JSZip');

                    // Init PDF.js worker
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

                    // Wait for cv runtime
                    if (!window.cv.Mat) {
                        await new Promise(resolve => {
                            window.cv.onRuntimeInitialized = resolve;
                        });
                    }

                    setIsReady(true);
                    setStatus("");
                } catch (e) {
                    setStatus(`Hata: ${e.message}`);
                }
            };
            loadDeps();
        }, []);

        // Handlers
        const processFile = async (file) => {
            if (!window.cv) return;
            const ext = new QuestionExtractor();
            const newResults = [];

            try {
                if (file.type === "application/pdf") {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;

                    for (let i = 1; i <= pdf.numPages; i++) {
                        setStatus(`${file.name} - Sayfa ${i}/${pdf.numPages} işleniyor...`);

                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 2 }); // High res
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        const ctx = canvas.getContext('2d');

                        await page.render({ canvasContext: ctx, viewport }).promise;

                        // To Mat
                        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const mat = window.cv.matFromImageData(imgData);

                        const pageQs = ext.processPage(mat, i);
                        newResults.push(...pageQs);
                        mat.delete();
                    }
                } else if (file.type.startsWith("image/")) {
                    setStatus(`${file.name} işleniyor...`);
                    const img = new Image();
                    img.src = URL.createObjectURL(file);
                    await new Promise(r => img.onload = r);

                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const mat = window.cv.matFromImageData(imgData);

                    const qs = ext.processPage(mat, 1);
                    newResults.push(...qs);
                    mat.delete();
                }

                setResults(prev => [...prev, ...newResults]);
                // Select all new by default
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    newResults.forEach(q => next.add(q.id));
                    return next;
                });

            } catch (e) {
                console.error(e);
                alert("İşlem hatası: " + e.message);
            }
        };

        const handleStart = async () => {
            if (!files.length) return;
            setIsProcessing(true);
            setResults([]);

            for (const file of files) {
                await processFile(file);
            }

            setIsProcessing(false);
            setStatus(`Tamamlandı! ${results.length} soru bulundu.`);
        };

        const handleDownload = async () => {
            if (!selectedIds.size || !window.JSZip) return;
            const zip = new window.JSZip();
            const folder = zip.folder("sorular");

            results.filter(r => selectedIds.has(r.id)).forEach(r => {
                const data = r.dataUrl.split(',')[1];
                folder.file(`${r.id}.png`, data, { base64: true });
            });

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "sorular.zip";
            link.click();
        };

        // Renders
        return React.createElement("div", { className: "flex flex-col h-full gap-4" },
            // Helper/Status
            !isReady && React.createElement("div", { className: "p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm" },
                "⚠️ İlk yükleme biraz zaman alabilir (OpenCV ~10MB). " + status
            ),

            // Input Area
            React.createElement("div", { className: "flex gap-2 items-start" },
                React.createElement("input", {
                    type: "file",
                    multiple: true,
                    accept: "application/pdf,image/*",
                    onChange: e => setFiles(Array.from(e.target.files || [])),
                    className: "block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
                }),
                React.createElement("button", {
                    onClick: handleStart,
                    disabled: !files.length || isProcessing || !isReady,
                    className: "px-6 py-2 bg-violet-600 text-white rounded-lg disabled:opacity-50 font-medium hover:bg-violet-700 transition-colors"
                }, isProcessing ? "İşleniyor..." : "Başlat")
            ),

            // Status Bar
            (status || results.length > 0) && React.createElement("div", { className: "flex justify-between items-center text-sm text-gray-600 px-1" },
                React.createElement("span", {}, status || `${results.length} soru bulundu`),
                results.length > 0 && React.createElement("div", { className: "flex gap-2" },
                    React.createElement("button", {
                        onClick: () => setSelectedIds(new Set(results.map(r => r.id))),
                        className: "text-violet-600 hover:underline cursor-pointer"
                    }, "Tümünü Seç"),
                    React.createElement("button", {
                        onClick: () => setSelectedIds(new Set()),
                        className: "text-gray-500 hover:underline cursor-pointer"
                    }, "Seçimi Kaldır")
                )
            ),

            // Grid Results
            React.createElement("div", { className: "flex-1 overflow-y-auto border rounded-xl p-4 bg-gray-50 min-h-[300px]" },
                results.length === 0 && !isProcessing && React.createElement("div", { className: "h-full flex items-center justify-center text-gray-400 opacity-50 flex-col gap-2" },
                    React.createElement("span", { className: "text-4xl" }, "✂️"),
                    React.createElement("span", {}, "Dosya seçin ve Başlat'a basın")
                ),

                React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" },
                    results.map(r => (
                        React.createElement("div", {
                            key: r.id,
                            className: `relative group rounded-lg border-2 overflow-hidden bg-white transition-all cursor-pointer ${selectedIds.has(r.id) ? "border-violet-500 ring-2 ring-violet-200" : "border-transparent shadow-sm hover:shadow-md"
                                }`,
                            onClick: () => {
                                const next = new Set(selectedIds);
                                if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                                setSelectedIds(next);
                            }
                        },
                            React.createElement("img", { src: r.dataUrl, className: "w-full h-auto object-contain bg-white" }),
                            // Selection Indicator
                            React.createElement("div", { className: "absolute top-2 right-2" },
                                React.createElement("div", {
                                    className: `w-5 h-5 rounded-full border flex items-center justify-center text-[10px] text-white transition-colors ${selectedIds.has(r.id) ? "bg-violet-600 border-violet-600" : "bg-white/80 border-gray-300"
                                        }`
                                }, selectedIds.has(r.id) && "✓")
                            )
                        )
                    ))
                )
            ),

            // Footer Actions
            results.length > 0 && React.createElement("div", { className: "pt-2 border-t flex justify-end gap-2" },
                React.createElement("span", { className: "self-center text-sm text-gray-500 mr-auto" },
                    `${selectedIds.size} soru seçildi`
                ),
                React.createElement("button", {
                    onClick: handleDownload,
                    disabled: !selectedIds.size,
                    className: "px-6 py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg shadow-gray-200 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                },
                    React.createElement("span", {}, "⬇️"),
                    React.createElement("span", {}, "İndir (.zip)")
                )
            )
        );
    }
};
