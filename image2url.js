// MARK: Image2URL Plugin
// Standalone plugin for uploading images and getting shareable URLs.
// Registers for "image-input" slot to appear in forms.

const API_URL = "https://www.image2url.com/api/upload";

export default {
    name: "Image2URL",
    description: "Görsel yükleyip URL alın",
    version: "1.0.0",
    author: "Anonymous",
    icon: "🖼️",
    slots: ["image-input"],

    // MARK: Render in Slot (inline in forms)
    renderSlot: ({ slotId, onValue }) => {
        const React = window.React;
        const { useState, useCallback } = React;

        const [isDragging, setIsDragging] = useState(false);
        const [isUploading, setIsUploading] = useState(false);
        const [error, setError] = useState(null);

        const uploadFile = useCallback(async (file) => {
            if (!file) return;
            setIsUploading(true);
            setError(null);

            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch(API_URL, {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) throw new Error("Yükleme başarısız");

                const data = await response.json();
                const url = data.url || data.link || data.imageUrl;
                if (url) onValue(url);
                else throw new Error("URL alınamadı");
            } catch (err) {
                setError(err.message);
            } finally {
                setIsUploading(false);
            }
        }, [onValue]);

        const handleDrop = useCallback((e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer?.files?.[0];
            if (file?.type?.startsWith("image/")) uploadFile(file);
        }, [uploadFile]);

        const handleFileChange = useCallback((e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
        }, [uploadFile]);

        // Compact inline UI
        return React.createElement("label", {
            className: `border-2 border-dashed rounded-xl p-4 flex items-center justify-center cursor-pointer transition-all ${isDragging ? "border-accent-admin bg-accent-admin/5" : "border-outline hover:border-accent-admin"
                } ${isUploading ? "opacity-50 pointer-events-none" : ""}`,
            onDragOver: (e) => { e.preventDefault(); setIsDragging(true); },
            onDragLeave: () => setIsDragging(false),
            onDrop: handleDrop,
        },
            React.createElement("input", {
                type: "file",
                accept: "image/*",
                onChange: handleFileChange,
                className: "hidden"
            }),
            React.createElement("div", { className: "text-center" },
                isUploading
                    ? React.createElement("span", { className: "text-sm text-content-muted" }, "⏳ Yükleniyor...")
                    : React.createElement("span", { className: "text-sm text-content-muted" }, "📷 Sürükle veya tıkla"),
                error && React.createElement("p", { className: "text-xs text-red-500 mt-1" }, error)
            )
        );
    },

    // MARK: Render in Modal (standalone)
    render: ({ onClose }) => {
        const React = window.React;
        const { useState } = React;

        const [file, setFile] = useState(null);
        const [preview, setPreview] = useState(null);
        const [isUploading, setIsUploading] = useState(false);
        const [resultUrl, setResultUrl] = useState(null);
        const [error, setError] = useState(null);

        const handleFileChange = (e) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) {
                setFile(selectedFile);
                setPreview(URL.createObjectURL(selectedFile));
                setResultUrl(null);
                setError(null);
            }
        };

        const handleUpload = async () => {
            if (!file) return;
            setIsUploading(true);
            setError(null);

            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch(API_URL, {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) throw new Error("Yükleme başarısız");

                const data = await response.json();
                setResultUrl(data.url || data.link || data.imageUrl || "URL bulunamadı");
            } catch (err) {
                setError(err.message);
            } finally {
                setIsUploading(false);
            }
        };

        return React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement("label", {
                className: "border-2 border-dashed border-outline rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-accent-admin transition-colors"
            },
                React.createElement("input", { type: "file", accept: "image/*", onChange: handleFileChange, className: "hidden" }),
                preview
                    ? React.createElement("img", { src: preview, alt: "Preview", className: "max-h-48 rounded-lg object-contain" })
                    : React.createElement("div", { className: "text-center" },
                        React.createElement("span", { className: "text-4xl mb-2 block" }, "📷"),
                        React.createElement("span", { className: "text-sm text-content-muted" }, "Görsel seçmek için tıklayın")
                    )
            ),
            file && !resultUrl && React.createElement("button", {
                onClick: handleUpload,
                disabled: isUploading,
                className: "w-full py-3 rounded-lg text-sm font-bold text-white cursor-pointer bg-accent-admin hover:brightness-110 disabled:opacity-50 transition-all"
            }, isUploading ? "Yükleniyor..." : "Yükle"),
            error && React.createElement("p", { className: "text-sm text-red-500 text-center" }, error),
            resultUrl && React.createElement("div", { className: "flex flex-col gap-2" },
                React.createElement("input", { type: "text", value: resultUrl, readOnly: true, className: "w-full px-4 py-3 rounded-lg border text-sm bg-surface-primary border-outline text-content-primary" }),
                React.createElement("button", {
                    onClick: () => navigator.clipboard.writeText(resultUrl),
                    className: "w-full py-2 rounded-lg text-sm font-bold cursor-pointer bg-accent-admin/10 text-accent-admin hover:bg-accent-admin/20 transition-all"
                }, "📋 Kopyala")
            )
        );
    }
};
