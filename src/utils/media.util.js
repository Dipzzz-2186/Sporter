// src/utils/media.util.js
'use strict';

// returns embed URL (https://www.youtube.com/embed/ID) or null
function parseYouTubeEmbed(input) {
    if (!input) return null;

    // If pasted iframe html, extract src
    try {
        const iframeMatch = input.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch && iframeMatch[1]) input = iframeMatch[1];
    } catch (e) { }

    input = input.trim();

    // Ensure we can use URL parser
    if (!/^[a-zA-Z]+:\/\//.test(input)) {
        input = 'https://' + input;
    }

    try {
        const u = new URL(input);
        const host = u.hostname.toLowerCase();
        const path = u.pathname || '';

        // youtu.be short link: https://youtu.be/ID
        if (host.includes('youtu.be')) {
            const id = path.replace(/^\//, '').split('/')[0];
            if (id) return `https://www.youtube.com/embed/${id}`;
            return null;
        }

        // youtube.com variants
        if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
            // support /live/VIDEO_ID
            if (path.startsWith('/live/')) {
                const id = path.split('/')[2];
                if (id) return `https://www.youtube.com/embed/${id}`;
            }

            // support embed path
            if (path.startsWith('/embed/')) {
                const id = path.split('/')[2];
                if (id) return `https://www.youtube.com/embed/${id}`;
            }

            // support watch?v=ID
            const v = u.searchParams.get('v');
            if (v) return `https://www.youtube.com/embed/${v}`;

            // older /v/ID
            const parts = path.split('/').filter(Boolean);
            const vIdx = parts.indexOf('v');
            if (vIdx !== -1 && parts[vIdx + 1]) return `https://www.youtube.com/embed/${parts[vIdx + 1]}`;
        }
    } catch (e) {
        // fallback regex extraction
        const re = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
        const m = input.match(re);
        if (m && m[1]) return `https://www.youtube.com/embed/${m[1]}`;
    }

    return null;
}

module.exports = { parseYouTubeEmbed };
