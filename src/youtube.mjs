// Reads channel + latest-video numbers and comments from the YouTube Data API v3.
// Needs an API key (free, read-only): https://console.cloud.google.com/apis/credentials
const API = 'https://www.googleapis.com/youtube/v3/';

async function get(path, params, key) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries({ ...params, key })) if (v != null && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouTube API ${path}: ${res.status} ${body?.error?.message ?? res.statusText}`);
  return body;
}

export async function fetchInput(cfg, key) {
  if (!key) throw new Error('Set YOUTUBE_API_KEY (or put "apiKey" in config.json).');
  if (!cfg.channel) throw new Error('Set "channel" in config.json to your channel ID (UC…) or @handle.');
  const who = cfg.channel.startsWith('@') ? { forHandle: cfg.channel } : { id: cfg.channel };
  const ch = (await get('channels', { part: 'statistics,contentDetails,snippet', ...who }, key)).items?.[0];
  if (!ch) throw new Error(`Channel not found: ${cfg.channel}`);

  let videoId = cfg.videoId;
  if (!videoId) {
    const uploads = ch.contentDetails.relatedPlaylists.uploads;
    const pl = await get('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 1 }, key);
    videoId = pl.items?.[0]?.contentDetails?.videoId;
  }

  let video = null; const comments = [];
  if (videoId) {
    const v = (await get('videos', { part: 'statistics,snippet', id: videoId }, key)).items?.[0];
    if (v) video = { id: videoId, title: v.snippet.title, likes: +v.statistics.likeCount || 0, commentCount: +v.statistics.commentCount || 0 };
    let pageToken;
    for (let page = 0; page < (cfg.commentPages ?? 3); page++) {
      let r;
      try { r = await get('commentThreads', { part: 'snippet', videoId, order: 'relevance', maxResults: 100, textFormat: 'plainText', pageToken }, key); }
      catch (e) { console.warn('Could not read comments:', e.message); break; } // e.g. comments disabled
      for (const it of r.items ?? []) {
        const c = it.snippet.topLevelComment.snippet;
        comments.push({ author: c.authorDisplayName, text: c.textOriginal ?? c.textDisplay, likes: c.likeCount ?? 0 });
      }
      if (!(pageToken = r.nextPageToken)) break;
    }
  }
  return {
    fetchedAt: new Date().toISOString(),
    channel: { id: ch.id, title: ch.snippet.title },
    subscribers: +ch.statistics.subscriberCount || 0,
    video, comments,
  };
}
