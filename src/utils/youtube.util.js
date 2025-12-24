// src/utils/youtube.util.js

const axios = require('axios');

const API_KEY = process.env.YT_API_KEY;

async function checkYouTubeLive(videoId) {
    if (!API_KEY) throw new Error('YT_API_KEY belum diset');

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

    if (!data.items || data.items.length === 0) {
        return { exists: false, isLive: false, wasLive: false };
    }

    const item = data.items[0];

    const liveStatus = item.snippet.liveBroadcastContent;
    // 'live' | 'none' | 'upcoming'

    const isLive = liveStatus === 'live';
    const wasLive =
        liveStatus === 'none' &&
        !!item.liveStreamingDetails?.actualEndTime;

    return {
        exists: true,
        isLive,
        wasLive,
        views: Number(item.statistics?.viewCount || 0),
        likes: Number(item.statistics?.likeCount || 0),
        comments: Number(item.statistics?.commentCount || 0),
        concurrentViewers: Number(
            item.liveStreamingDetails?.concurrentViewers || 0
        )
    };
}

async function getYouTubeVideoStats(videoId) {
    if (!API_KEY) throw new Error('YT_API_KEY belum diset');

    const { data } = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos',
        {
            params: {
                part: 'statistics,contentDetails',
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
        duration: parseISO8601Duration(item.contentDetails?.duration)
    };
}

// ISO 8601 (PT1H23M45S) → menit
function parseISO8601Duration(iso) {
    if (!iso) return 0;

    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = Number(match?.[1] || 0);
    const m = Number(match?.[2] || 0);
    const s = Number(match?.[3] || 0);

    return Math.round(h * 60 + m + s / 60);
}

module.exports = {
    checkYouTubeLive,
    getYouTubeVideoStats
};