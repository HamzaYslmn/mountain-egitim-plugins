// MARK: Image2URL Plugin - Preview First, Then Upload
const API_URL = "https://www.image2url.com/api/upload";

const upload = async (file, onSuccess, setLoading, setError) => {
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
        if (url) onSuccess(url);
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
    version: "2.2.0",
    author: "Anonymous",
    icon: "🖼️",
    slots: ["image-input"],

    // MARK: Slot Render - Preview first, then upload
    renderSlot: ({ onValue }) => {
        const React = window.React;
        const { useState, useCallback } = React;
        const [file, setFile] = useState(null);
        const [preview, setPreview] = useState(null);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);
        const [drag, setDrag] = useState(false);

        const onSelect = useCallback(f => {
            if (!f) return;
            setFile(f);
            setPreview(URL.createObjectURL(f));
            setError(null);
        }, []);

        const onUpload = useCallback(() => {
            upload(file, (url) => {
                onValue(url);
                setFile(null);
                setPreview(null);
            }, setLoading, setError);
        }, [file, onValue]);

        const onClear = useCallback(() => {
            setFile(null);
            setPreview(null);
            setError(null);
        }, []);

        const dragStyle = drag ? "border-accent-admin bg-accent-admin/5" : "border-outline hover:border-accent-admin/50";

        return React.createElement("div", { style: { marginTop: "12px" } },
            // Preview Mode
            preview ? React.createElement("div", {
                style: { display: "flex", flexDirection: "column", gap: "12px" }
            },
                // Preview Image
                React.createElement("div", {
                    className: "rounded-xl border border-outline overflow-hidden bg-surface-tertiary/30",
                    style: { padding: "8px", position: "relative" }
                },
                    React.createElement("img", {
                        src: preview,
                        style: { width: "100%", height: "120px", objectFit: "contain", borderRadius: "8px" }
                    }),
                    // Clear button
                    !loading && React.createElement("button", {
                        onClick: onClear,
                        className: "text-white hover:bg-red-500 transition-colors",
                        style: { position: "absolute", top: "12px", right: "12px", padding: "4px 8px", borderRadius: "9999px", background: "rgba(0,0,0,0.5)", fontSize: "12px", cursor: "pointer", border: "none" }
                    }, "✕")
                ),
                // Upload Button
                React.createElement("button", {
                    onClick: onUpload,
                    disabled: loading,
                    className: "w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-accent-admin hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
                }, loading ? "⏳ Yükleniyor..." : "📤 Yükle")
            )
                // Drop Zone (no preview)
                : React.createElement("label", {
                    className: `border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragStyle}`,
                    style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "16px" },
                    onDragOver: e => { e.preventDefault(); setDrag(true); },
                    onDragLeave: () => setDrag(false),
                    onDrop: e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer?.files?.[0]; if (f?.type?.startsWith("image/")) onSelect(f); }
                },
                    React.createElement("input", { type: "file", accept: "image/*", style: { display: "none" }, onChange: e => onSelect(e.target.files?.[0]) }),
                    React.createElement("span", { style: { fontSize: "20px" } }, "📷"),
                    React.createElement("span", { className: "text-xs text-content-muted" }, "Görsel seç")
                ),
            // Error
            error && React.createElement("p", { className: "text-xs text-red-500", style: { marginTop: "8px" } }, error)
        );
    },

    // MARK: Modal Render (Standalone) - Same flow
    render: ({ onClose }) => {
        const React = window.React;
        const { useState } = React;
        const [file, setFile] = useState(null);
        const [preview, setPreview] = useState(null);
        const [loading, setLoading] = useState(false);
        const [result, setResult] = useState(null);
        const [error, setError] = useState(null);

        const pick = e => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setError(null); }
        };

        return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } },
            // Upload Area
            React.createElement("label", {
                className: "border-2 border-dashed border-outline rounded-xl hover:border-accent-admin cursor-pointer transition-colors",
                style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px" }
            },
                React.createElement("input", { type: "file", accept: "image/*", style: { display: "none" }, onChange: pick }),
                preview
                    ? React.createElement("img", { src: preview, style: { maxHeight: "160px", borderRadius: "8px", objectFit: "contain" } })
                    : React.createElement("div", { style: { textAlign: "center" } },
                        React.createElement("span", { style: { fontSize: "40px", display: "block", marginBottom: "8px" } }, "📷"),
                        React.createElement("span", { className: "text-sm text-content-muted" }, "Görsel seç")
                    )
            ),
            // Upload Button
            file && !result && React.createElement("button", {
                onClick: () => upload(file, setResult, setLoading, setError),
                disabled: loading,
                className: "w-full py-3 rounded-lg text-sm font-semibold text-white bg-accent-admin hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
            }, loading ? "⏳ Yükleniyor..." : "Yükle"),
            // Error
            error && React.createElement("p", { className: "text-sm text-red-500", style: { textAlign: "center" } }, error),
            // Result
            result && React.createElement("div", { style: { display: "flex", gap: "8px" } },
                React.createElement("input", { type: "text", value: result, readOnly: true, className: "flex-1 px-3 py-2 rounded-lg border border-outline bg-surface-primary text-sm" }),
                React.createElement("button", {
                    onClick: () => navigator.clipboard.writeText(result),
                    className: "px-4 py-2 rounded-lg text-sm font-medium bg-accent-admin/10 text-accent-admin hover:bg-accent-admin/20 transition-colors cursor-pointer"
                }, "📋")
            )
        );
    }
};
