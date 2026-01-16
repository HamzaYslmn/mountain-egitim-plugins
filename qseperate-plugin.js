export default {
    name: "Soru Ayrıştırma",
    description: "PDF ve görsellerden soru ayrıştırma aracı",
    version: "1.0.0",
    author: "MountainAI",
    icon: "✂️",

    render: ({ onClose }) => {
        const React = window.React;

        return React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" },
            React.createElement("div", { className: "bg-surface-primary w-full h-[90vh] max-w-6xl rounded-xl flex flex-col overflow-hidden relative" },
                // Header
                React.createElement("div", { className: "p-4 border-b border-outline flex justify-between items-center bg-surface-secondary" },
                    React.createElement("h3", { className: "font-bold text-lg text-content-primary" }, "Soru Ayrıştırma Aracı"),
                    React.createElement("button", {
                        onClick: onClose,
                        className: "p-2 hover:bg-surface-tertiary rounded-lg text-content-secondary transition-colors"
                    }, "✕")
                ),
                // Iframe Container
                React.createElement("div", { className: "flex-1 w-full bg-white" },
                    React.createElement("iframe", {
                        src: "https://mountain-egitim.onrender.com/api/qseperate/upload",
                        className: "w-full h-full border-none",
                        title: "QSeperate Tool"
                    })
                )
            )
        );
    }
};
