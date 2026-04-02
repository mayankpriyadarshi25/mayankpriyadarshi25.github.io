const cron = require('node-cron');
const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser({
    customFields: {
        item: [
            ['content:encoded', 'contentEncoded'],
            ['media:content', 'mediaContent']
        ]
    }
});

// Cybersecurity & IT News RSS Feeds
const RSS_FEEDS = [
    { url: 'https://feeds.feedburner.com/TheHackersNews', tag: 'Cybersecurity' },
    { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', tag: 'Advisory' },
    { url: 'https://www.bleepingcomputer.com/feed/', tag: 'Threat Intel' },
    { url: 'https://krebsonsecurity.com/feed/', tag: 'Infosec' }
];

// Keywords for scoring
const KEYWORD_WEIGHTS = {
    'cve': 10,
    'vulnerability': 5,
    'zero-day': 8,
    '0day': 8,
    'ransomware': 6,
    'breach': 5,
    'rce': 7,
    'malware': 4,
    'exploit': 5,
    'hacked': 4,
    'patch': 3,
    'critical': 5
};

/**
 * Strips HTML tags and gets a clean snippet.
 */
function cleanText(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>?/gm, '').substring(0, 300) + '...';
}

/**
 * Calculate the score for an article based on recency and keywords.
 */
function calculateScore(item) {
    let score = 0;
    
    // Recency (newer = higher score, roughly decays per day)
    const pubDate = new Date(item.pubDate);
    const now = new Date();
    const hoursOld = Math.max(0, (now - pubDate) / (1000 * 60 * 60));
    score += Math.max(0, 50 - hoursOld); // up to 50 points for recency (within 0 hours)

    // Keywords
    const contentToSearch = (item.title + ' ' + (item.contentEncoded || item.contentSnippet || '')).toLowerCase();
    
    for (const [keyword, weight] of Object.entries(KEYWORD_WEIGHTS)) {
        if (contentToSearch.includes(keyword)) {
            score += weight;
        }
    }

    return score;
}

/**
 * Extract CVE IDs like CVE-2025-1234.
 */
function extractCVE(text) {
    const cveRegex = /(CVE-\d{4}-\d{4,7})/gi;
    const matches = text.match(cveRegex);
    return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : [];
}

/**
 * Fetch and process news.
 */
async function fetchNews(NewsItemModel) {
    console.log('[News Automator] Fetching latest cyber news...');
    let allArticles = [];

    for (const feed of RSS_FEEDS) {
        try {
            const parsedFeed = await parser.parseURL(feed.url);
            for (const item of parsedFeed.items) {
                
                // Content for identifying CVEs
                const fullText = (item.title || '') + ' ' + (item.contentEncoded || item.contentSnippet || '');
                const cves = extractCVE(fullText);
                const score = calculateScore(item);

                // Build a unified layout
                const article = {
                    title: item.title,
                    tag: cves.length > 0 ? 'Vulnerability' : feed.tag,
                    date: new Date(item.pubDate).toISOString(),
                    body: cleanText(item.contentEncoded || item.contentSnippet),
                    link: item.link,
                    score: score,
                    cve: cves,
                    isTrending: score > 60 // Simple threshold for 🔥 Trending
                };

                // Add to aggregate list
                allArticles.push(article);
            }
        } catch (error) {
            console.error(`[News Automator] Error fetching feed ${feed.url}:`, error.message);
        }
    }

    // Deduplicate by title
    const uniqueArticles = [];
    const titles = new Set();
    
    allArticles.sort((a, b) => b.score - a.score); // Highest score first

    for (const article of allArticles) {
        // Prevent exact duplicates
        if (!titles.has(article.title) && uniqueArticles.length < 15) {
            titles.add(article.title);
            uniqueArticles.push(article);
        }
    }

    // Re-assign IDs sequentially for frontend compatibility (1 to N)
    const finalized = uniqueArticles.map((n, i) => {
        return {
            newsId: i + 1,
            title: n.title,
            tag: n.tag,
            date: n.date,
            body: n.body,
            link: n.link,
            cve: n.cve,
            isTrending: n.isTrending
        };
    });

    console.log(`[News Automator] Processed and ranked ${finalized.length} top articles.`);

    // Update database
    try {
        await NewsItemModel.deleteMany({}); // replace all old auto-fetched
        await NewsItemModel.insertMany(finalized);
        console.log('[News Automator] Database updated successfully.');
    } catch (dbErr) {
        console.error('[News Automator] DB update failed:', dbErr.message);
    }
}

/**
 * Initialize Cron Job
 */
function initNewsCron(NewsItemModel) {
    // Run immediately on startup once
    fetchNews(NewsItemModel);

    // Schedule to run every 4 hours
    cron.schedule('0 */4 * * *', () => {
        console.log('[News Automator] Running scheduled news update task.');
        fetchNews(NewsItemModel);
    });
}

module.exports = {
    initNewsCron
};
