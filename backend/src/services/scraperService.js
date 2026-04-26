// src/services/scraperService.js
// Adapted from Reference/InternshipAI/utils/scraper.js — ESM version
import axios from 'axios';

const INVALID_DOMAINS = [
  'youtube.com','pinterest.com','instagram.com','facebook.com',
  'twitter.com','tiktok.com','amazon.com/vdp','linkedin.com/posts','google.com/search',
];

export async function validateApifyKey(apiKey) {
  try {
    const r = await axios.get('https://api.apify.com/v2/users/me', { params: { token: apiKey } });
    return r.status === 200;
  } catch {
    return false;
  }
}

export async function runUserScrape(apiKey, prefs = {}) {
  let roles     = toArray(prefs.roles     || prefs.role);
  let locations = toArray(prefs.locations || prefs.location);
  let workTypes = toArray(prefs.workTypes || prefs.workType);

  if (!roles.length)     roles     = ['Software Engineer Intern'];
  if (!locations.length) locations = ['Remote'];
  if (!workTypes.length) workTypes = ['Full-time'];

  const lookback = prefs.lookback || '24h';
  const { timeRange, hoursThreshold } = parseLookback(lookback);

  const roleStr     = roles.join(' or ');
  const locStr      = locations.join(' or ');
  const wtStr       = workTypes.join(' or ');
  const resumeCtx   = prefs.resumeText ? `matching skills: ${prefs.resumeText.substring(0, 100)}` : '';
  const richPrompt  = `find ${roleStr} internships in ${locStr}. ${resumeCtx}. I prefer ${wtStr}. 2025.`.trim();

  const queries = [];
  roles.forEach(role => {
    locations.forEach(loc => {
      const ls = loc === 'Global' ? '' : ` in ${loc}`;
      // Broad search excluding strictly monitored sites
      queries.push(`"${role}" internship${ls} -site:linkedin.com -site:indeed.com`);
      // Targeting specific ATS platforms that are easier for bots to navigate
      queries.push(`"${role}" internship${ls} site:boards.greenhouse.io`);
      queries.push(`"${role}" internship${ls} site:jobs.lever.co`);
      queries.push(`"${role}" internship${ls} inurl:internship site:internshala.com`);
    });
  });
  if (queries.length > 20) queries.length = 20;

  console.log(`[Scraper] ${queries.length} queries, timeRange=${timeRange}`);

  const runRes = await axios.post(
    `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${apiKey}`,
    {
      queries: queries.join('\n'),
      maxPagesPerQuery: 1,
      resultsPerPage: 5, // Lowered to avoid overwhelming
      mobileResults: false,
      timeRange,
      includeUnfilteredResults: false,
      saveHtml: false,
    }
  );

  const runId = runRes.data.data.id;
  console.log(`[Scraper] Apify run started: ${runId}`);

  // Poll up to 3 minutes
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(8000);
    const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
    const status = statusRes.data.data.status;
    console.log(`[Scraper] Poll status: ${status}`);

    if (status === 'SUCCEEDED') {
      const datasetId = statusRes.data.data.defaultDatasetId;
      const dataRes = await axios.get(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}`);
      return processResults(dataRes.data, prefs.resumeText, hoursThreshold);
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${status}`);
    }
  }

  throw new Error('Apify run timed out after 3 minutes');
}

function processResults(items, resumeText, maxAgeHours) {
  const seen = new Set();
  const resumeKws = resumeText
    ? resumeText.toLowerCase().split(/[\W_]+/).filter(w => w.length > 3)
    : [];

  const JOB_TERMS = [
    'intern','internship','co-op','coop','trainee','junior','entry','graduate',
    'fresh','scholar','role','position','opportunity','apply','hiring','software',
    'engineer','developer','analyst','designer','fellowship','2025',
  ];

  const results = [];
  items.forEach(item => {
    if (!item.organicResults) return;
    item.organicResults.forEach(res => {
      if (seen.has(res.url)) return;
      if (INVALID_DOMAINS.some(d => res.url.includes(d))) return;

      const title = (res.title || '').toLowerCase();
      const desc  = (res.description || '').toLowerCase();
      const text  = `${title} ${desc}`;

      if (!JOB_TERMS.some(t => text.includes(t))) return;

      // Age filter
      if (maxAgeHours < 720) {
        const m = desc.match(/(\d+)\s+(hour|day|minute)s?\s+ago/i);
        if (m) {
          const val = parseInt(m[1]);
          const unit = m[2].toLowerCase();
          const ageH = unit.includes('day') ? val * 24 : unit.includes('minute') ? val / 60 : val;
          if (ageH > maxAgeHours) return;
        }
      }

      seen.add(res.url);

      let domain = 'web';
      try { domain = new URL(res.url).hostname.replace('www.', ''); } catch {}

      let matchScore = 0;
      if (resumeKws.length > 0) {
        const matches = resumeKws.filter(k => text.includes(k));
        matchScore = Math.round((matches.length / resumeKws.length) * 100);
      }

      results.push({
        title: res.title,
        company: extractCompany(res.title, res.url),
        domain,
        url: res.url,
        description: res.description || '',
        source: res.displayedUrl || 'Web Search',
        scrapedAt: new Date().toISOString(),
        matchScore,
      });
    });
  });

  return results;
}

function extractCompany(title, url) {
  if (!title) return domainToCompany(url);
  const blacklist = ['remote','intern','apply','hiring','jobs','careers','india','usa'];
  const clean = title.split('...')[0].trim();
  const isOk = n => n && n.length > 2 && n.length < 30 && !blacklist.some(b => n.toLowerCase().includes(b));

  const atM = clean.match(/at\s+([^|-]+)/i);
  if (atM && isOk(atM[1].trim())) return atM[1].trim();

  const hirM = clean.match(/([^|-]+)\s+is\s+hiring/i);
  if (hirM && isOk(hirM[1].trim())) return hirM[1].trim();

  const parts = clean.split(/[|-]/);
  for (const p of parts) {
    if (isOk(p.trim())) return p.trim();
  }
  return domainToCompany(url);
}

function domainToCompany(url) {
  try {
    const h = new URL(url).hostname.replace('www.', '').split('.');
    return h[h.length - 2]?.charAt(0).toUpperCase() + h[h.length - 2]?.slice(1) || 'Company';
  } catch { return 'Company'; }
}

function parseLookback(lb) {
  const l = lb.toLowerCase();
  if (l.includes('hr') || l.includes('hour')) {
    const h = parseInt(l) || 24;
    // Apify supports 'h' (last hour) or 'd' (last 24 hours). 
    // We use 'h' if <= 1hr, otherwise 'd' and filter manually.
    return { timeRange: h <= 1 ? 'h' : 'd', hoursThreshold: h };
  }
  if (l.includes('day')) {
    const d = parseInt(l) || 1;
    return { timeRange: 'd', hoursThreshold: d * 24 };
  }
  if (l.includes('week'))                     return { timeRange: 'w', hoursThreshold: 168 };
  if (l.includes('month'))                    return { timeRange: 'm', hoursThreshold: 720 };
  return { timeRange: 'd', hoursThreshold: 24 };
}

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
