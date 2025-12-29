// src/utils/youtube.util.js

const axios = require('axios');

const API_KEY = process.env.YT_API_KEY;

// =========================
// CHECK LIVESTREAM
// =========================
async function checkYouTubeLive(videoId) {
    if (!API_KEY) return null;
    if (!isValidYouTubeId(videoId)) return null;

    try {
        const { data } = await axios.get(
            'https://www.googleapis.com/youtube/v3/videos',
            {
                params: {
                    part: 'snippet,liveStreamingDetails,statistics',
                    id: videoId,
                    key: API_KEY
                }
            }
        );

        if (!data.items || !data.items.length) return null;

        const item = data.items[0];
        const liveStatus = item.snippet?.liveBroadcastContent;

        return {
            exists: true,
            isLive: liveStatus === 'live',
            wasLive:
                liveStatus === 'none' &&
                !!item.liveStreamingDetails?.actualEndTime,
            views: Number(item.statistics?.viewCount || 0),
            likes: Number(item.statistics?.likeCount || 0),
            comments: Number(item.statistics?.commentCount || 0),
            publishedAt: item.snippet?.publishedAt || null,
            concurrentViewers: Number(
                item.liveStreamingDetails?.concurrentViewers || 0
            )
        };
    } catch (err) {
        console.warn('[YT] checkLive skipped:', videoId, err.response?.status);
        return null;
    }
}

// =========================
// VIDEO STATS (AMAN)
// =========================
async function getYouTubeVideoStats(videoId) {
    if (!API_KEY) return null;
    if (!isValidYouTubeId(videoId)) return null;

    try {
        const { data } = await axios.get(
            'https://www.googleapis.com/youtube/v3/videos',
            {
                params: {
                    part: 'statistics,contentDetails,snippet',
                    id: videoId,
                    key: API_KEY
                }
            }
        );

        if (!data.items || !data.items.length) return null;

        const item = data.items[0];

        return {
            views: Number(item.statistics?.viewCount || 0),
            likes: Number(item.statistics?.likeCount || 0),
            comments: Number(item.statistics?.commentCount || 0),
            duration: parseISO8601Duration(item.contentDetails?.duration),
            publishedAt: item.snippet?.publishedAt || null
        };
    } catch (err) {
        console.warn('[YT] stats skipped:', videoId, err.response?.status);
        return null; // ⛔ PENTING
    }
}

// =========================
// HELPERS
// =========================
function isValidYouTubeId(id) {
    return typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

// ISO 8601 → menit
function parseISO8601Duration(iso) {
    if (!iso) return 0;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = Number(m?.[1] || 0);
    const min = Number(m?.[2] || 0);
    const s = Number(m?.[3] || 0);
    return Math.round(h * 60 + min + s / 60);
}

module.exports = {
    checkYouTubeLive,
    getYouTubeVideoStats
};
