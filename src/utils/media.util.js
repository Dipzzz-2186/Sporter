// src/utils/media.util.js
exports.parseYouTubeEmbed = (url) => {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_\-]+)/);
    if (m && m[1]) return `https://www.youtube.com/embed/${m[1]}`;
    return null;
};
