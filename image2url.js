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
        const [uploadProgress, setUploadProgress] = useState(0);

        const uploadFile = useCallback(async (file) => {
            if (!file) return;
            setIsUploading(true);
            setError(null);
            setUploadProgress(0);

            // Simulate progress for better UX
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, 90));
            }, 150);

            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch(API_URL, {
                    method: "POST",
                    body: formData,
                });

                clearInterval(progressInterval);
                setUploadProgress(100);

                if (!response.ok) throw new Error("Yükleme başarısız");

                const data = await response.json();
                const url = data.url || data.link || data.imageUrl;
                if (url) {
                    setTimeout(() => onValue(url), 300);
                }
                else throw new Error("URL alınamadı");
            } catch (err) {
                clearInterval(progressInterval);
                setError(err.message);
                setUploadProgress(0);
            } finally {
                setTimeout(() => {
                    setIsUploading(false);
                    setUploadProgress(0);
                }, 500);
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

        // MARK: Modern Premium UI
        return React.createElement("div", { className: "space-y-3" },
            // Section Label
            React.createElement("label", {
                className: "text-sm font-semibold block text-content-secondary flex items-center gap-2"
            },
                React.createElement("span", { className: "text-base" }, "🖼️"),
                "Soru Görseli"
            ),

            // Upload Area - Modern Glassmorphism Style
            React.createElement("label", {
                style: {
                    background: isDragging
                        ? "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%)"
                        : "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                    backdropFilter: "blur(8px)",
                    border: isDragging ? "2px solid rgba(139, 92, 246, 0.6)" : "2px dashed rgba(255,255,255,0.15)",
                    borderRadius: "16px",
                    padding: "28px 20px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: isUploading ? "wait" : "pointer",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    position: "relative",
                    overflow: "hidden",
                    opacity: isUploading ? 0.7 : 1
                },
                onDragOver: (e) => { e.preventDefault(); setIsDragging(true); },
                onDragLeave: () => setIsDragging(false),
                onDrop: handleDrop,
            },
                // Progress Bar Overlay
                isUploading && React.createElement("div", {
                    style: {
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        height: "4px",
                        width: `${uploadProgress}%`,
                        background: "linear-gradient(90deg, #8B5CF6 0%, #3B82F6 100%)",
                        borderRadius: "0 2px 2px 0",
                        transition: "width 0.2s ease"
                    }
                }),

                // Hidden File Input
                React.createElement("input", {
                    type: "file",
                    accept: "image/*",
                    onChange: handleFileChange,
                    style: { display: "none" }
                }),

                // Content
                React.createElement("div", {
                    style: {
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px"
                    }
                },
                    isUploading
                        ? React.createElement(React.Fragment, null,
                            // Animated Spinner
                            React.createElement("div", {
                                style: {
                                    width: "40px",
                                    height: "40px",
                                    border: "3px solid rgba(139, 92, 246, 0.2)",
                                    borderTopColor: "#8B5CF6",
                                    borderRadius: "50%",
                                    animation: "spin 0.8s linear infinite"
                                }
                            }),
                            React.createElement("span", {
                                style: {
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "rgba(255,255,255,0.7)",
                                    marginTop: "4px"
                                }
                            }, `Yükleniyor... ${uploadProgress}%`)
                        )
                        : React.createElement(React.Fragment, null,
                            // Upload Icon with gradient background
                            React.createElement("div", {
                                style: {
                                    width: "56px",
                                    height: "56px",
                                    borderRadius: "14px",
                                    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginBottom: "4px"
                                }
                            },
                                React.createElement("span", { style: { fontSize: "24px" } }, "�")
                            ),
                            React.createElement("span", {
                                style: {
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: "rgba(255,255,255,0.9)"
                                }
                            }, "Görsel Yükle"),
                            React.createElement("span", {
                                style: {
                                    fontSize: "12px",
                                    color: "rgba(255,255,255,0.5)"
                                }
                            }, "Tıklayın veya sürükleyip bırakın")
                        ),

                    // Error Message
                    error && React.createElement("div", {
                        style: {
                            marginTop: "8px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid rgba(239, 68, 68, 0.3)"
                        }
                    },
                        React.createElement("span", {
                            style: { fontSize: "12px", color: "#EF4444" }
                        }, `❌ ${error}`)
                    )
                )
            ),

            // Manual URL Input - Sleek Design
            React.createElement("div", {
                style: {
                    position: "relative",
                    display: "flex",
                    alignItems: "center"
                }
            },
                React.createElement("div", {
                    style: {
                        position: "absolute",
                        left: "14px",
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "14px",
                        pointerEvents: "none"
                    }
                }, "🔗"),
                React.createElement("input", {
                    type: "url",
                    placeholder: "veya görsel URL'si yapıştırın",
                    onChange: (e) => onValue(e.target.value),
                    style: {
                        width: "100%",
                        padding: "14px 14px 14px 40px",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.9)",
                        fontSize: "13px",
                        outline: "none",
                        transition: "all 0.2s ease"
                    }
                })
            ),

            // CSS Keyframes for spinner animation
            React.createElement("style", null, `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `)
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
