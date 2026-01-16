// MARK: Image2URL Plugin
// This is a standalone plugin that can be loaded via URL into the MountainAI platform.
// Users can upload images and get a shareable URL.

const API_URL = "https://www.image2url.com/api/upload";

// MARK: Plugin Definition
export default {
    name: "Image2URL",
    description: "Görsel yükleyip URL alın",
    version: "1.0.0",
    author: "MountainAI",
    icon: "🖼️",

    // MARK: Render Function
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

                if (!response.ok) {
                    throw new Error(`Yükleme başarısız: ${response.statusText}`);
                }

                const data = await response.json();
                setResultUrl(data.url || data.link || data.imageUrl || "URL bulunamadı");
            } catch (err) {
                setError(err.message || "Bir hata oluştu");
            } finally {
                setIsUploading(false);
            }
        };

        const copyToClipboard = () => {
            if (resultUrl) {
                navigator.clipboard.writeText(resultUrl);
            }
        };

        // MARK: Plugin UI
        return React.createElement("div", { className: "flex flex-col gap-4" },
            // Description
            React.createElement("p", { className: "text-sm text-content-muted" },
                "Bir görsel yükleyin ve paylaşılabilir URL alın."
            ),

            // File Input Area
            React.createElement("label", {
                className: "border-2 border-dashed border-outline rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-accent-admin transition-colors " + (preview ? "border-accent-admin" : "")
            },
                React.createElement("input", {
                    type: "file",
                    accept: "image/*",
                    onChange: handleFileChange,
                    className: "hidden"
                }),
                preview ? (
                    React.createElement("img", {
                        src: preview,
                        alt: "Preview",
                        className: "max-h-48 rounded-lg object-contain"
                    })
                ) : (
                    React.createElement("div", { className: "text-center" },
                        React.createElement("span", { className: "text-4xl mb-2 block" }, "📷"),
                        React.createElement("span", { className: "text-sm text-content-muted" }, "Görsel seçmek için tıklayın")
                    )
                )
            ),

            // Upload Button
            file && !resultUrl && React.createElement("button", {
                onClick: handleUpload,
                disabled: isUploading,
                className: "w-full py-3 rounded-lg text-sm font-bold text-white cursor-pointer bg-accent-admin hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            }, isUploading ? "Yükleniyor..." : "Yükle"),

            // Error
            error && React.createElement("p", { className: "text-sm text-red-500 text-center" }, error),

            // Result
            resultUrl && React.createElement("div", { className: "flex flex-col gap-2" },
                React.createElement("label", { className: "text-xs font-bold text-content-muted uppercase tracking-wider" }, "Görsel URL"),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("input", {
                        type: "text",
                        value: resultUrl,
                        readOnly: true,
                        className: "flex-1 px-4 py-3 rounded-lg border text-sm bg-surface-primary border-outline text-content-primary"
                    }),
                    React.createElement("button", {
                        onClick: copyToClipboard,
                        className: "px-4 py-3 rounded-lg text-sm font-bold cursor-pointer bg-accent-admin text-white hover:brightness-110 transition-all"
                    }, "📋 Kopyala")
                ),
                React.createElement("a", {
                    href: resultUrl,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "text-xs text-accent-admin hover:underline text-center"
                }, "Görseli yeni sekmede aç →")
            ),

            // Reset
            resultUrl && React.createElement("button", {
                onClick: () => { setFile(null); setPreview(null); setResultUrl(null); },
                className: "text-sm text-content-muted hover:text-content-primary transition-colors"
            }, "Başka bir görsel yükle")
        );
    }
};
