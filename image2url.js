// MARK: Image2URL Plugin - crop locally, then upload to a free host
//
// Four hosts, tried in order, same list and same order as the backend's
// BackEnd/src/modules/freecdn/freecdn.py. Free hosts throttle, break and disappear, so
// one being down should not cost the user their upload.
//   1. imgcdn.dev     - Chevereto API, key published on its ShareX page
//   2. catbox.moe     - no key at all, plain-text reply
//   3. pic.in.th      - Chevereto with no API page: scrape auth_token, POST to /json
//   4. freeimage.host - Chevereto again, but it serves from iili.io, which Turkish ISPs
//                       block: the upload works and the link then loads for nobody
//
// imgbox.com used to be third and is gone from both lists - it rejects WebP and its
// /upload/process answers 502, so it was an arm that could never fire.
//
// Cropping stays local: a free host's size limit stops mattering once we send 16:10 at
// 1600px rather than whatever came off the phone. Replaces
// https://www.image2url.com/api/upload, which now answers 401 for anonymous callers.

// Published openly on the pages named below, so these are not secrets to leak. They are
// shared with everyone though, and they throttle (error code 103), so an arm re-reads its
// page after a failure - paste your own account key here if that starts biting.
const IMGCDN_KEY = "5386e05a3562c7a8f984e73401540836";
const FREEIMAGE_KEY = "6d207e02198a847aa98d0a2a901485a5";
const PICINTH = "https://pic.in.th";

// Every host takes a multipart POST; only the field names differ. A filename is only
// legal on a Blob, so plain string fields go in without one.
const post = (url, fields, init) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields))
        value instanceof Blob ? body.append(key, value, value.name) : body.append(key, value);
    return fetch(url, { method: "POST", body, ...init });
};

// Chevereto answers with JSON either way: failures come back as a body with a 400 or 500,
// so response.ok proves nothing. Three of the four hosts here run it.
const cheveretoUrl = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (data.image?.url) return data.image.url;
    throw new Error(data.error?.message || `HTTP ${response.status}`);
};

// freeimage prints its key in an <input value>, imgcdn in a <strong>. Both pages also
// carry 32-hex cache-busting hashes, but only ever inside href/src.
const KEY_IN_PAGE = /(?:value="|<strong>)([0-9a-f]{32})/;

// Same software, same endpoint, same shared guest key on a public page - so one builder
// covers imgcdn and freeimage. The key is what changes; the protocol does not.
const chevereto = (name, base, keyPage, key) => ({
    name,
    async upload(file) {
        const send = () => post(`${base}/api/1/upload`,
            { key, action: "upload", format: "json", source: file }).then(cheveretoUrl);
        try {
            return await send();
        } catch (error) {
            // Re-read the key only once an upload has failed: checking up front would
            // spend a request every time, guarding a value that changes once a year.
            const fresh = (await (await fetch(keyPage)).text()).match(KEY_IN_PAGE)?.[1];
            if (!fresh || fresh === key) throw error;
            key = fresh;
            return await send();
        }
    },
});

const HOSTS = [
    chevereto("imgcdn.dev", "https://imgcdn.dev", "https://imgcdn.dev/page/sharex", IMGCDN_KEY),
    {
        name: "catbox.moe",
        // Errors are HTTP 200 with a sentence where the URL should be, so check the shape.
        async upload(file) {
            const response = await post("https://catbox.moe/user/api.php",
                { reqtype: "fileupload", fileToUpload: file });
            const text = (await response.text()).trim();
            if (text.startsWith("https://")) return text;
            throw new Error(text.slice(0, 120) || `HTTP ${response.status}`);
        },
    },
    {
        name: "pic.in.th",
        // Chevereto with no API page, so drive the site's own endpoint: the CSRF token is
        // in an inline script on the homepage, and /json answers 401 without both it and
        // the PHPSESSID handed out with it - hence credentials on both calls.
        async upload(file) {
            const home = await (await fetch(`${PICINTH}/`, { credentials: "include" })).text();
            const token = home.match(/auth_token = "([0-9a-f]+)"/)?.[1];
            if (!token) throw new Error("auth_token not found");
            return cheveretoUrl(await post(`${PICINTH}/json`,
                { type: "file", action: "upload", auth_token: token, source: file },
                { credentials: "include" }));
        },
    },
    chevereto("freeimage.host", "https://freeimage.host", "https://freeimage.host/page/api", FREEIMAGE_KEY),
];

const CROP_ASPECT = 16 / 10;
const MIN_CROP = 0.15;                       // of the image width, so the frame stays grabbable
const HANDLES = ["nw", "ne", "sw", "se"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// The crop lives as fractions of the image, so it survives any preview size and becomes
// source pixels with one multiply. Locking 16:10 in *pixels* is why the height fraction
// has to carry the image's own aspect ratio.
// Exported, with applyDrag, for the small no-browser self-check beside this plugin.
export const fitCrop = ({ x, y, w }, imageAspect) => {
    const width = clamp(w, MIN_CROP, Math.min(1, CROP_ASPECT / imageAspect));
    const height = (width * imageAspect) / CROP_ASPECT;
    return { x: clamp(x, 0, 1 - width), y: clamp(y, 0, 1 - height), w: width, h: height };
};

// One drag step. No corner means the whole frame moves; a corner resizes and pins the one
// opposite. The horizontal delta drives the size and the aspect lock supplies the height,
// so a corner never has to reconcile two directions that disagree with each other.
export const applyDrag = (start, corner, dx, dy, imageAspect) => {
    if (!corner) return fitCrop({ x: start.x + dx, y: start.y + dy, w: start.w }, imageAspect);
    const east = corner.endsWith("e");
    const sized = fitCrop({ ...start, w: start.w + (east ? dx : -dx) }, imageAspect);
    return fitCrop({
        w: sized.w,
        x: east ? start.x : start.x + start.w - sized.w,
        y: corner.startsWith("n") ? start.y + start.h - sized.h : start.y,
    }, imageAspect);
};

// The biggest 16:10 frame the image can hold, centred - what you get before touching it.
const centeredCrop = (imageAspect) => {
    const { w, h } = fitCrop({ x: 0, y: 0, w: 1 }, imageAspect);
    return fitCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w }, imageAspect);
};

const cropFile = async (file, crop) => {
    const sourceUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const loaded = new Image();
            loaded.onload = () => resolve(loaded);
            loaded.onerror = () => reject(new Error("Görsel okunamadı."));
            loaded.src = sourceUrl;
        });
        const sourceWidth = crop.w * image.naturalWidth;
        const sourceHeight = crop.h * image.naturalHeight;
        const outputWidth = Math.max(1, Math.min(1600, Math.round(sourceWidth)));
        const outputHeight = Math.max(1, Math.round(outputWidth / CROP_ASPECT));
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Kırpma alanı oluşturulamadı.");
        context.drawImage(image, crop.x * image.naturalWidth, crop.y * image.naturalHeight,
            sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

        const type = file.type === "image/png" ? "image/png" : "image/jpeg";
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Görsel kırpılamadı.")), type, 0.92);
        });
        const name = file.name.replace(/\.[^.]+$/, "") || "gorsel";
        return new File([blob], `${name}.${type === "image/png" ? "png" : "jpg"}`, { type });
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
};

const uploadCropped = async (file) => {
    const failures = [];
    for (const host of HOSTS) {
        try {
            return await host.upload(file);
        } catch (error) {
            failures.push(`${host.name}: ${error.message}`);
        }
    }
    throw new Error("Yükleme başarısız — " + failures.join(" · "));
};


function ImageUploader({ onSuccess, showResult = false }) {
    const React = window.React;
    const { useEffect, useRef, useState } = React;
    const h = React.createElement;
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [size, setSize] = useState(null);   // natural pixels, known once the image loads
    const [crop, setCrop] = useState(null);   // fractions of the image, null until then
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const boxRef = useRef(null);
    const drag = useRef(null);

    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const aspect = size ? size.width / size.height : CROP_ASPECT;
    const clear = () => {
        setFile(null); setPreview(null); setSize(null); setCrop(null); setError(null); setResult(null);
    };
    const selectFile = (nextFile) => {
        if (!nextFile) return;
        if (!nextFile.type?.startsWith("image/")) return setError("Lütfen bir görsel dosyası seçin.");
        setFile(nextFile); setPreview(URL.createObjectURL(nextFile));
        setSize(null); setCrop(null); setError(null); setResult(null);
    };
    const submit = async () => {
        if (!file || !crop) return;
        setLoading(true); setError(null);
        try {
            const url = await uploadCropped(await cropFile(file, crop));
            onSuccess?.(url);
            if (showResult) setResult(url); else clear();
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Yükleme başarısız.");
        } finally { setLoading(false); }
    };

    // Drag the frame to move it, a corner to resize it. Deltas are divided by the box, so
    // they arrive as fractions of the image - the only unit the crop is ever stored in.
    const startDrag = (corner) => (event) => {
        event.stopPropagation();
        drag.current = {
            corner, start: crop, box: boxRef.current.getBoundingClientRect(),
            px: event.clientX, py: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const onDrag = (event) => {
        const held = drag.current;
        if (!held) return;
        setCrop(applyDrag(held.start, held.corner, (event.clientX - held.px) / held.box.width,
            (event.clientY - held.py) / held.box.height, aspect));
    };
    // Arrow keys move the frame and +/- resize it, for anyone not using a pointer.
    const nudge = (event) => {
        const step = {
            ArrowLeft: [-0.02, 0, 0], ArrowRight: [0.02, 0, 0], ArrowUp: [0, -0.02, 0],
            ArrowDown: [0, 0.02, 0], "+": [0, 0, 0.05], "-": [0, 0, -0.05],
        }[event.key];
        if (!step || !crop) return;
        event.preventDefault();
        setCrop(fitCrop({ x: crop.x + step[0], y: crop.y + step[1], w: crop.w + step[2] }, aspect));
    };

    if (!preview) return h("label", {
        className: "border-2 border-dashed border-outline rounded-xl cursor-pointer transition-colors hover:border-accent-admin/50",
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "20px", textAlign: "center" },
        onDragOver: (event) => event.preventDefault(),
        onDrop: (event) => { event.preventDefault(); selectFile(event.dataTransfer?.files?.[0]); },
    },
    h("input", { type: "file", accept: "image/*", style: { display: "none" }, onChange: (event) => selectFile(event.target.files?.[0]) }),
    h("span", { style: { fontSize: "24px" } }, "Gorsel"),
    h("strong", { className: "text-sm text-content-primary" }, "Görsel seç veya buraya bırak"),
    h("span", { className: "text-xs text-content-muted" }, "Seçtikten sonra kırpma çerçevesini sürükleyin."),
    error && h("p", { className: "text-xs text-red-500", style: { margin: 0 } }, error));

    const caption = (text, edge) => h("span", {
        className: "text-xs text-white",
        style: { position: "absolute", [edge]: "6px", left: 0, right: 0, textAlign: "center", pointerEvents: "none", textShadow: "0 1px 3px #000" },
    }, text);

    return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px", width: "100%" } },
        h("div", {
            ref: boxRef,
            className: "rounded-xl border border-outline overflow-hidden bg-black/90",
            // touchAction none, or a drag on mobile scrolls the page instead of the frame.
            style: {
                position: "relative", width: "100%", maxWidth: "720px", alignSelf: "center", touchAction: "none",
                aspectRatio: size ? `${size.width} / ${size.height}` : "16 / 10",
            },
            onPointerMove: onDrag,
            onPointerUp: () => { drag.current = null; },
            onPointerCancel: () => { drag.current = null; },
        },
            h("img", {
                src: preview, alt: "Kırpma önizlemesi", draggable: false,
                onLoad: (event) => {
                    const loaded = { width: event.target.naturalWidth, height: event.target.naturalHeight };
                    setSize(loaded);
                    setCrop(centeredCrop(loaded.width / loaded.height));
                },
                style: { display: "block", width: "100%", height: "100%" },
            }),
            crop && h("div", {
                tabIndex: 0,
                onPointerDown: startDrag(null),
                onKeyDown: nudge,
                style: {
                    position: "absolute", cursor: "move",
                    left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
                    outline: "1px solid rgba(255,255,255,.9)",
                    // One shadow instead of four mask elements: everything outside darkens.
                    boxShadow: "0 0 0 9999px rgba(0,0,0,.5)",
                    // Rule-of-thirds guides, two gradients rather than four more elements.
                    backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)",
                    backgroundSize: "100% 33.33%, 33.33% 100%",
                },
            },
                caption("16 : 10", "top"),
                caption(size ? `${Math.round(crop.w * size.width)} x ${Math.round(crop.h * size.height)}` : "", "bottom"),
                HANDLES.map((corner) => h("span", {
                    key: corner,
                    onPointerDown: startDrag(corner),
                    style: {
                        position: "absolute", width: "18px", height: "18px", borderRadius: "4px",
                        background: "#fff", cursor: `${corner}-resize`, touchAction: "none",
                        [corner.startsWith("n") ? "top" : "bottom"]: "-1px",
                        [corner.endsWith("w") ? "left" : "right"]: "-1px",
                    },
                })))),
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" } },
            h("button", { type: "button", onClick: clear, disabled: loading, className: "py-2.5 rounded-lg text-sm font-semibold border border-outline text-content-secondary hover:bg-surface-tertiary disabled:opacity-50 cursor-pointer" }, "Başka görsel seç"),
            h("button", { type: "button", onClick: submit, disabled: loading || !crop, className: "py-2.5 rounded-lg text-sm font-semibold text-white bg-accent-admin hover:brightness-110 disabled:opacity-50 cursor-pointer" }, loading ? "Yükleniyor..." : "Kırp ve yükle")),
        error && h("p", { className: "text-xs text-red-500" }, error),
        result && h("div", { style: { display: "flex", gap: "8px" } },
            h("input", { type: "text", value: result, readOnly: true, className: "flex-1 px-3 py-2 rounded-lg border border-outline bg-surface-primary text-sm" }),
            h("button", { type: "button", onClick: () => navigator.clipboard.writeText(result), className: "px-4 py-2 rounded-lg text-sm font-medium bg-accent-admin/10 text-accent-admin cursor-pointer" }, "Kopyala")));
}
export default {
    name: "Image2URL",
    description: "Görseli kırpıp ücretsiz CDN URL'i al",
    version: "5.0.0",
    author: "Anonymous",
    icon: "🖼️",
    slots: ["image-input"],
    renderSlot: ({ onValue }) => window.React.createElement(ImageUploader, { onSuccess: onValue }),
    render: () => window.React.createElement(ImageUploader, { showResult: true }),
};
