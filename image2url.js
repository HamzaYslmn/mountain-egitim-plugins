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
const MAX_ZOOM = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Exported for the small no-browser self-check beside this plugin.
export const getCropRect = (width, height, zoom = 1, x = 0.5, y = 0.5) => {
    const safeZoom = clamp(Number(zoom) || 1, 1, MAX_ZOOM);
    const cropWidth = Math.min(width, height * CROP_ASPECT) / safeZoom;
    const cropHeight = cropWidth / CROP_ASPECT;
    return {
        x: (width - cropWidth) * clamp(Number(x) || 0, 0, 1),
        y: (height - cropHeight) * clamp(Number(y) || 0, 0, 1),
        width: cropWidth,
        height: cropHeight,
    };
};

// Exported for the self-check beside this plugin: how far a cover-fitted image can travel
// inside the box. Dividing a pointer delta by this is what makes the drag track the finger
// exactly, at any zoom, instead of drifting.
export const panRange = (box, image, zoom = 1) => {
    const cover = Math.max(box.width / image.width, box.height / image.height) * zoom;
    return { x: image.width * cover - box.width, y: image.height * cover - box.height };
};

const cropFile = async (file, zoom, x, y) => {
    const sourceUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const loaded = new Image();
            loaded.onload = () => resolve(loaded);
            loaded.onerror = () => reject(new Error("G\u00f6rsel okunamad\u0131."));
            loaded.src = sourceUrl;
        });
        const crop = getCropRect(image.naturalWidth, image.naturalHeight, zoom, x, y);
        const outputWidth = Math.max(1, Math.min(1600, Math.round(crop.width)));
        const outputHeight = Math.max(1, Math.round(outputWidth / CROP_ASPECT));
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("K\u0131rpma alan\u0131 olu\u015fturulamad\u0131.");
        context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);

        const type = file.type === "image/png" ? "image/png" : "image/jpeg";
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error("G\u00f6rsel k\u0131rp\u0131lamad\u0131.")), type, 0.92);
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
    throw new Error("Y\u00fckleme ba\u015far\u0131s\u0131z \u2014 " + failures.join(" \u00b7 "));
};


function ImageUploader({ onSuccess, showResult = false }) {
    const React = window.React;
    const { useEffect, useRef, useState } = React;
    const h = React.createElement;
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [x, setX] = useState(0.5);
    const [y, setY] = useState(0.5);
    const [size, setSize] = useState(null);   // natural pixels, needed to map a drag to x/y
    const drag = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const clear = () => {
        setFile(null); setPreview(null); setSize(null); setZoom(1); setX(0.5); setY(0.5); setError(null); setResult(null);
    };
    const selectFile = (nextFile) => {
        if (!nextFile) return;
        if (!nextFile.type?.startsWith("image/")) return setError("L\u00fctfen bir g\u00f6rsel dosyas\u0131 se\u00e7in.");
        setFile(nextFile); setPreview(URL.createObjectURL(nextFile)); setSize(null); setZoom(1); setX(0.5); setY(0.5); setError(null); setResult(null);
    };
    const submit = async () => {
        if (!file) return;
        setLoading(true); setError(null);
        try {
            const url = await uploadCropped(await cropFile(file, zoom, x, y));
            onSuccess?.(url);
            if (showResult) setResult(url); else clear();
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Y\u00fckleme ba\u015far\u0131s\u0131z.");
        } finally { setLoading(false); }
    };

    // Drag to move the crop, across the range panRange() works out.
    const startDrag = (event) => {
        if (!size) return;
        const range = panRange(event.currentTarget.getBoundingClientRect(), size, zoom);
        drag.current = { px: event.clientX, py: event.clientY, rangeX: range.x, rangeY: range.y };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const onDrag = (event) => {
        if (!drag.current) return;
        const { px, py, rangeX, rangeY } = drag.current;
        if (rangeX > 0) setX((value) => clamp(value - (event.clientX - px) / rangeX, 0, 1));
        if (rangeY > 0) setY((value) => clamp(value - (event.clientY - py) / rangeY, 0, 1));
        drag.current.px = event.clientX;
        drag.current.py = event.clientY;
    };
    // Arrow keys do the same job for anyone not using a pointer.
    const nudge = (event) => {
        const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[event.key];
        if (!step) return;
        event.preventDefault();
        setX((value) => clamp(value + step[0], 0, 1));
        setY((value) => clamp(value + step[1], 0, 1));
    };

    if (!preview) return h("label", {
        className: "border-2 border-dashed border-outline rounded-xl cursor-pointer transition-colors hover:border-accent-admin/50",
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "20px", textAlign: "center" },
        onDragOver: (event) => event.preventDefault(),
        onDrop: (event) => { event.preventDefault(); selectFile(event.dataTransfer?.files?.[0]); },
    },
    h("input", { type: "file", accept: "image/*", style: { display: "none" }, onChange: (event) => selectFile(event.target.files?.[0]) }),
    h("span", { style: { fontSize: "24px" } }, "Gorsel"),
    h("strong", { className: "text-sm text-content-primary" }, "G\u00f6rsel se\u00e7 veya buraya b\u0131rak"),
    h("span", { className: "text-xs text-content-muted" }, "Y\u00fcklemeden \u00f6nce k\u0131rpabilirsiniz."),
    error && h("p", { className: "text-xs text-red-500", style: { margin: 0 } }, error));

    const position = `${x * 100}% ${y * 100}%`;
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px", width: "100%" } },
        h("div", {
            className: "rounded-xl border border-outline overflow-hidden bg-black/90 cursor-grab active:cursor-grabbing",
            // touchAction none, or the browser takes the drag as a page scroll on mobile.
            style: { width: "100%", maxWidth: "720px", alignSelf: "center", aspectRatio: "16 / 10", position: "relative", touchAction: "none" },
            tabIndex: 0,
            onPointerDown: startDrag,
            onPointerMove: onDrag,
            onPointerUp: () => { drag.current = null; },
            onPointerCancel: () => { drag.current = null; },
            onKeyDown: nudge,
        },
            h("img", {
                src: preview, alt: "K\u0131rpma \u00f6nizlemesi", draggable: false,
                onLoad: (event) => setSize({ width: event.target.naturalWidth, height: event.target.naturalHeight }),
                style: { width: "100%", height: "100%", objectFit: "cover", objectPosition: position, transform: `scale(${zoom})`, transformOrigin: position },
            }),
            // Rule-of-thirds guides, two gradients rather than four divs.
            h("div", { style: {
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: "linear-gradient(rgba(255,255,255,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.28) 1px, transparent 1px)",
                backgroundSize: "100% 33.33%, 33.33% 100%",
            } }),
            h("span", { className: "text-xs text-white", style: { position: "absolute", left: "10px", bottom: "10px", padding: "4px 8px", borderRadius: "999px", background: "rgba(0,0,0,.6)", pointerEvents: "none" } },
                "16:10 \u2014 s\u00fcr\u00fckleyerek konumland\u0131r")),
        h("div", { className: "rounded-xl border border-outline bg-surface-primary", style: { padding: "12px", display: "grid", gap: "8px" } },
            // ponytail: zoom stays a slider. Wheel zoom needs a non-passive listener added
            // by hand, or the page scrolls under the cursor while you use it.
            h("label", { className: "text-xs text-content-primary" }, "Yak\u0131nla\u015ft\u0131rma %" + Math.round(zoom * 100),
                h("input", { type: "range", min: "1", max: String(MAX_ZOOM), step: "0.01", value: zoom, onChange: (event) => setZoom(Number(event.target.value)), style: { width: "100%" } })),
            h("button", { type: "button", onClick: () => { setZoom(1); setX(0.5); setY(0.5); }, className: "text-left text-xs text-content-muted hover:text-content-primary cursor-pointer" }, "K\u0131rpmay\u0131 s\u0131f\u0131rla")),
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" } },
            h("button", { type: "button", onClick: clear, disabled: loading, className: "py-2.5 rounded-lg text-sm font-semibold border border-outline text-content-secondary hover:bg-surface-tertiary disabled:opacity-50 cursor-pointer" }, "Ba\u015fka g\u00f6rsel se\u00e7"),
            h("button", { type: "button", onClick: submit, disabled: loading, className: "py-2.5 rounded-lg text-sm font-semibold text-white bg-accent-admin hover:brightness-110 disabled:opacity-50 cursor-pointer" }, loading ? "Y\u00fckleniyor..." : "K\u0131rp ve y\u00fckle")),
        error && h("p", { className: "text-xs text-red-500" }, error),
        result && h("div", { style: { display: "flex", gap: "8px" } },
            h("input", { type: "text", value: result, readOnly: true, className: "flex-1 px-3 py-2 rounded-lg border border-outline bg-surface-primary text-sm" }),
            h("button", { type: "button", onClick: () => navigator.clipboard.writeText(result), className: "px-4 py-2 rounded-lg text-sm font-medium bg-accent-admin/10 text-accent-admin cursor-pointer" }, "Kopyala")));
}
export default {
    name: "Image2URL",
    description: "G\u00f6rseli k\u0131rp\u0131p \u00fccretsiz CDN URL'i al",
    version: "4.2.0",
    author: "Anonymous",
    icon: "\ud83d\uddbc\ufe0f",
    slots: ["image-input"],
    renderSlot: ({ onValue }) => window.React.createElement(ImageUploader, { onSuccess: onValue }),
    render: () => window.React.createElement(ImageUploader, { showResult: true }),
};
