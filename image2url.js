// MARK: Image2URL Plugin - Minimalist Design
const API_URL = "https://www.image2url.com/api/upload";

const upload = async (file, onValue, setLoading, setError) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(API_URL, { method: "POST", body: fd });
        if (!res.ok) throw new Error("Yükleme başarısız");
        const data = await res.json();
        const url = data.url || data.link || data.imageUrl;
        if (url) onValue(url);
        else throw new Error("URL alınamadı");
    } catch (e) {
        setError(e.message);
    } finally {
        setLoading(false);
    }
};

export default {
    name: "Image2URL",
    description: "Görsel yükleyip URL alın",
    version: "2.0.0",
    author: "Anonymous",
    icon: "🖼️",
    slots: ["image-input"],

    // MARK: Slot Render (Form Inline)
    renderSlot: ({ onValue }) => {
        const { useState, useCallback } = window.React;
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);
        const [drag, setDrag] = useState(false);

        const onFile = useCallback(f => upload(f, onValue, setLoading, setError), [onValue]);

        return window.React.createElement("div", { className: "space-y-3" },
            // Label
            window.React.createElement("span", { className: "text-sm font-medium text-content-secondary" }, "Soru Görseli"),

            // Drop Zone
            window.React.createElement("label", {
                className: `flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all
                    ${drag ? "border-accent-admin bg-accent-admin/5" : "border-outline hover:border-accent-admin/50"}
                    ${loading ? "opacity-50 pointer-events-none" : ""}`,
                onDragOver: e => { e.preventDefault(); setDrag(true); },
                onDragLeave: () => setDrag(false),
                onDrop: e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer?.files?.[0]; if (f?.type?.startsWith("image/")) onFile(f); }
            },
                window.React.createElement("input", { type: "file", accept: "image/*", className: "hidden", onChange: e => onFile(e.target.files?.[0]) }),
                window.React.createElement("span", { className: "text-3xl" }, loading ? "⏳" : "📷"),
                window.React.createElement("span", { className: "text-sm text-content-muted" }, loading ? "Yükleniyor..." : "Sürükle veya tıkla")
            ),

            // URL Input
            window.React.createElement("input", {
                type: "url",
                placeholder: "veya URL yapıştır",
                onChange: e => onValue(e.target.value),
                className: "w-full px-4 py-2.5 rounded-lg border border-outline bg-surface-primary text-sm text-content-primary focus:border-accent-admin outline-none transition-colors"
            }),

            // Error
            error && window.React.createElement("p", { className: "text-xs text-red-500" }, error)
        );
    },

    // MARK: Modal Render (Standalone)
    render: ({ onClose }) => {
        const { useState } = window.React;
        const [file, setFile] = useState(null);
        const [preview, setPreview] = useState(null);
        const [loading, setLoading] = useState(false);
        const [result, setResult] = useState(null);
        const [error, setError] = useState(null);

        const pick = e => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setError(null); }
        };

        return window.React.createElement("div", { className: "flex flex-col gap-4" },
            // Upload Area
            window.React.createElement("label", { className: "flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed border-outline hover:border-accent-admin cursor-pointer transition-colors" },
                window.React.createElement("input", { type: "file", accept: "image/*", className: "hidden", onChange: pick }),
                preview
                    ? window.React.createElement("img", { src: preview, className: "max-h-40 rounded-lg object-contain" })
                    : window.React.createElement("div", { className: "text-center" },
                        window.React.createElement("span", { className: "text-4xl block mb-2" }, "📷"),
                        window.React.createElement("span", { className: "text-sm text-content-muted" }, "Görsel seç")
                    )
            ),

            // Upload Button
            file && !result && window.React.createElement("button", {
                onClick: () => upload(file, setResult, setLoading, setError),
                disabled: loading,
                className: "w-full py-3 rounded-lg text-sm font-semibold text-white bg-accent-admin hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
            }, loading ? "⏳ Yükleniyor..." : "Yükle"),

            // Error
            error && window.React.createElement("p", { className: "text-sm text-red-500 text-center" }, error),

            // Result
            result && window.React.createElement("div", { className: "flex gap-2" },
                window.React.createElement("input", { type: "text", value: result, readOnly: true, className: "flex-1 px-3 py-2 rounded-lg border border-outline bg-surface-primary text-sm" }),
                window.React.createElement("button", {
                    onClick: () => navigator.clipboard.writeText(result),
                    className: "px-4 py-2 rounded-lg text-sm font-medium bg-accent-admin/10 text-accent-admin hover:bg-accent-admin/20 transition-colors cursor-pointer"
                }, "📋")
            )
        );
    }
};
