// src/utils/youtube.util.js

const axios = require('axios');

const API_KEY = process.env.YT_API_KEY;

async function checkYouTubeLive(videoId) {
    if (!API_KEY) throw new Error('YT_API_KEY belum diset');

    const url = 'https://www.googleapis.com/youtube/v3/videos';

    const { data } = await axios.get(url, {
        params: {
            part: 'snippet,liveStreamingDetails',
            id: videoId,
            key: API_KEY
        }
    });

    if (!data.items || data.items.length === 0) {
        return { exists: false, isLive: false };
    }

    const item = data.items[0];

    return {
        exists: true,
        isLive: item.snippet.liveBroadcastContent === 'live',
        liveDetails: item.liveStreamingDetails || null
    };
}

module.exports = { checkYouTubeLive };
