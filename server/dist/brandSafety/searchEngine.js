import axios from 'axios';
const EXCLUSION_FILTERS = '-alias -alis -analysis -aliexpress -analyst -aliases -aliah';
/**
 * Build the three consolidated boolean queries for a creator.
 *  - Consolidated queries drastically cut quota burn because we issue 3 rich searches instead of dozens of small ones.
 *  - Boolean OR groups surface semantically related controversies in one go, increasing recall and contextual variety.
 *  - The trailing negative terms strip out common false positives ("Alias", "analysis", etc.) that previously polluted results.
 */
export function buildOptimisedQueryList(creatorData) {
    const identifiers = Array.from(new Set(creatorData.identifiers.filter(Boolean).map((id) => id.trim())));
    const identifierGroup = identifiers.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(' OR ');
    const creatorIdentifiers = `(${identifierGroup})`;
    const queries = [
        `${creatorIdentifiers} (allegations OR accused OR controversy OR scandal OR drama OR grooming OR harassment OR racist OR lawsuit OR misconduct OR exposed OR apology OR fraud OR complaint OR backlash)`,
        `${creatorIdentifiers} ("sexual misconduct" OR "police investigation" OR "hate speech" OR "grooming allegations" OR "minor-related allegations" OR "cancelled" OR "criminal charges")`,
        `${creatorIdentifiers} (YouTuber OR influencer OR streamer OR creator OR profile OR interview OR biography OR "popular YouTuber")`
    ];
    // Attach exclusion filters to every query to proactively prevent misleading matches for names like "Ali-A".
    return queries.map((q) => `${q} ${EXCLUSION_FILTERS}`);
}
/**
 * Single entry point for Google search.
 *  - Exactly 3 consolidated queries are executed to keep daily quota usage 80–90% lower.
 *  - Each query returns only the top 5 results; this focuses on authoritative pages and avoids pagination churn.
 *  - Results remain compatible with entity disambiguation via title, link, snippet, and optional metatags.
 */
export async function fetchSearchResults(creatorData, googleKey, googleCx) {
    const queries = buildOptimisedQueryList(creatorData);
    const aggregated = [];
    for (const query of queries) {
        const response = await callGoogle(query, googleKey, googleCx);
        const items = response.items || [];
        aggregated.push(...items
            .filter((item) => item?.link)
            .map((item) => ({
            keyword: 'consolidated_query',
            title: item.title || '',
            snippet: item.snippet || '',
            link: item.link,
            displayLink: item.displayLink || '',
            searchQuery: query,
            pagemap: item.pagemap
        })));
    }
    return dedupeResults(aggregated);
}
/**
 * Call Google Custom Search with consistent error handling.
 *  - Quota exceeded errors are raised so the UI can state "Google quota exhausted for today" instead of implying missing data.
 *  - num=5 keeps responses lean while ensuring enough context for semantic validation.
 */
export async function callGoogle(query, key, cx) {
    try {
        const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: { key, cx, q: query, num: 5 }
        });
        return res.data;
    }
    catch (err) {
        const reason = err?.response?.data?.error?.errors?.[0]?.reason || '';
        const message = err?.response?.data?.error?.message || err?.message || 'Google search failed';
        if (message.toLowerCase().includes('exceeded') || reason.includes('rateLimit') || reason.includes('dailyLimit')) {
            const quotaErr = new Error('Google quota exhausted for today');
            quotaErr.status = 429;
            throw quotaErr;
        }
        throw err;
    }
}
/**
 * Remove duplicates across URLs, titles, and highly similar snippets.
 *  - Deduping keeps the LLM prompt concise and avoids double-counting the same allegation.
 */
export function dedupeResults(items) {
    const seenLinks = new Set();
    const seenTitles = new Set();
    const deduped = [];
    for (const item of items) {
        const normalizedLink = item.link?.toLowerCase();
        const normalizedTitle = (item.title || '').toLowerCase();
        if (normalizedLink && seenLinks.has(normalizedLink))
            continue;
        if (normalizedTitle && seenTitles.has(normalizedTitle))
            continue;
        const isSnippetDuplicate = deduped.some((existing) => snippetSimilarity(existing.snippet, item.snippet) >= 0.85);
        if (isSnippetDuplicate)
            continue;
        if (normalizedLink)
            seenLinks.add(normalizedLink);
        if (normalizedTitle)
            seenTitles.add(normalizedTitle);
        deduped.push(item);
    }
    return deduped;
}
function snippetSimilarity(a, b) {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (!tokensA.size || !tokensB.size)
        return 0;
    const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
    const union = new Set([...tokensA, ...tokensB]);
    return intersection.size / union.size;
}
function tokenize(text) {
    return new Set((text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2));
}
