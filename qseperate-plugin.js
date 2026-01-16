export default {
    name: "Soru Ayrıştırma",
    description: "PDF ve görsellerden soru ayrıştırma aracı",
    version: "1.1.0",
    author: "Anonymous",
    icon: "✂️",

    render: ({ settings }) => {
        const React = window.React;
        const defaultUrl = "https://mountain-egitim.onrender.com/api/qseperate/upload";
        const url = settings.apiUrl || defaultUrl;

        return React.createElement("div", { className: "w-full h-full bg-white" },
            React.createElement("iframe", {
                src: url,
                className: "w-full h-full border-none",
                title: "QSeperate Tool"
            })
        );
    }
};
