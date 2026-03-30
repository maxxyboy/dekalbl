// netlify/functions/news.js
//
// Fetches NYT top stories RSS server-side and returns headlines as JSON.
// No CORS issue — runs on your Netlify domain, browser calls /.netlify/functions/news
//
// Deploy: place this file at netlify/functions/news.js in your repo root.
// Netlify auto-detects it. No extra config needed on the free tier.

exports.handler = async () => {
    const RSS_URL = 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml';

    try {
        const resp = await fetch(RSS_URL, {
            headers: {
                // NYT RSS blocks bot user agents, this mimics a normal browser request
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        });

        if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);

        const xml = await resp.text();

        // Pull titles out of <item> blocks only (skips the channel <title>)
        const itemsXml = xml.split('<item>').slice(1); // first chunk is channel header
        const headlines = itemsXml
            .map(chunk => {
                const match = chunk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
                return match ? match[1].trim() : null;
            })
            .filter(Boolean)
            .slice(0, 12);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300' // cache for 5 min
            },
            body: JSON.stringify({ headlines })
        };

    } catch (err) {
        console.error('news function error:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message, headlines: [] })
        };
    }
};