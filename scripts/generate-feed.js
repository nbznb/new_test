#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(SCRIPT_DIR, '..', 'state-feed.json');
const SOURCES_PATH = join(SCRIPT_DIR, '..', 'config', 'default-sources.json');
const DEFAULT_LOOKBACK_HOURS = 168;
const USER_AGENT = 'FollowUSTC/1.0 (digest aggregator)';

async function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { seenItems: {} };
  }
  try {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf-8'));
    return { seenItems: state.seenItems || {} };
  } catch {
    return { seenItems: {} };
  }
}

async function saveState(state) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [id, ts] of Object.entries(state.seenItems)) {
    if (ts < cutoff) delete state.seenItems[id];
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function loadSources() {
  return JSON.parse(await readFile(SOURCES_PATH, 'utf-8'));
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .trim();
}

function stripTags(html) {
  return decodeHtml(String(html || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200b\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssFeed(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    const title = titleMatch ? decodeHtml(titleMatch[1]) : 'Untitled';
    const url = linkMatch ? decodeHtml(linkMatch[1]) : null;
    const guid = guidMatch ? decodeHtml(guidMatch[1]) : url || title;
    const publishedAt = pubDateMatch ? new Date(decodeHtml(pubDateMatch[1])).toISOString() : null;
    const summary = descMatch ? stripTags(descMatch[1]) : '';
    if (url || guid) {
      items.push({ title, url, guid, publishedAt, summary });
    }
  }
  return items;
}

function parseAtomFeed(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const block = entryMatch[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const idMatch = block.match(/<id>([\s\S]*?)<\/id>/i);
    const updatedMatch = block.match(/<updated>([\s\S]*?)<\/updated>/i);
    const summaryMatch = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || block.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?/i);
    const title = titleMatch ? decodeHtml(titleMatch[1]) : 'Untitled';
    const url = linkMatch ? decodeHtml(linkMatch[1]) : null;
    const guid = idMatch ? decodeHtml(idMatch[1]) : url || title;
    const publishedAt = updatedMatch ? new Date(decodeHtml(updatedMatch[1])).toISOString() : null;
    const summary = summaryMatch ? stripTags(summaryMatch[1]) : '';
    if (url || guid) {
      entries.push({ title, url, guid, publishedAt, summary });
    }
  }
  return entries;
}

function withinLookback(item, hours) {
  if (!item.publishedAt) return true;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return new Date(item.publishedAt).getTime() >= cutoff;
}

function shouldApplyLookback(source) {
  return !source.academyKey;
}

function shouldSkipSeenItems(source) {
  return !source.academyKey;
}

function buildOutputItem(source, item) {
  return {
    source: source.category,
    sourceName: source.name,
    sourceSubtype: source.academyKey ? 'academy' : 'general',
    academyKey: source.academyKey,
    academyName: source.academyName,
    title: cleanTitle(item.title),
    url: item.url,
    publishedAt: item.publishedAt,
    summary: item.summary
  };
}

async function fetchFeedItems(source, state) {
  const res = await fetch(source.feedUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = source.type === 'atom' ? parseAtomFeed(xml) : parseRssFeed(xml);
  const lookbackHours = source.lookbackHours || DEFAULT_LOOKBACK_HOURS;
  const maxItems = source.maxItems || 5;

  const selected = [];
  for (const item of items) {
    const uniqueId = item.guid || item.url || item.title;
    if (!uniqueId || (shouldSkipSeenItems(source) && state.seenItems[uniqueId])) continue;
    if (shouldApplyLookback(source) && !withinLookback(item, lookbackHours)) continue;
    selected.push(buildOutputItem(source, item));
    if (shouldSkipSeenItems(source)) {
      state.seenItems[uniqueId] = Date.now();
    }
    if (selected.length >= maxItems) break;
  }
  return selected;
}

function absolutizeUrl(baseUrl, maybeRelative) {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

function compilePattern(pattern) {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function cleanTitle(title) {
  return stripTags(title)
    .replace(/\s*[:：|-]\s*中国科学技术大学教务处$/i, '')
    .replace(/\s*[-|—]\s*中国科大新闻网$/i, '')
    .replace(/\s*[-|—]\s*中国科学技术大学新闻网$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDateString(value) {
  if (!value) return null;
  const match = String(value).match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractDate(text) {
  return normalizeDateString(text);
}

function extractPreferredDate(html, regexes) {
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match?.[1]) {
      const normalized = normalizeDateString(match[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

function isLowValueTitle(title) {
  return /联系方式|办公地点|常见问题|工作手册|报修|入口|下载|登录|服务指南|平台说明|系统说明|搜索|首页|上一页|下一页|专题|附件/i.test(title);
}

function isLikelyNoise(content) {
  return /搜索热点|友情链接|版权所有|上一篇|下一篇|微信扫一扫|投稿|English|主站|通知新闻|服务指南/.test(content);
}

function passesSourceFilters(item, source) {
  const allowPattern = compilePattern(source.urlAllowPattern);
  const denyPattern = compilePattern(source.urlDenyPattern);
  const url = item.url || '';
  const title = cleanTitle(item.title || '');
  if (!url || !title) return false;
  if (allowPattern && !allowPattern.test(url)) return false;
  if (denyPattern && denyPattern.test(url)) return false;
  if (title.length < 6) return false;
  if (isLowValueTitle(title)) return false;
  return true;
}

function scoreCandidate(item) {
  let score = 0;
  const title = cleanTitle(item.title || '');
  if (title) score += Math.min(title.length, 120) / 10;
  if (item.publishedAt) score += 20;
  if (/[\u4e00-\u9fffA-Za-z0-9]{6,}/.test(title)) score += 10;
  if (/>|全文|more/i.test(title)) score -= 30;
  return score;
}

function dedupeCandidates(items) {
  const bestByKey = new Map();
  for (const item of items) {
    const key = item.url || item.guid || item.title;
    if (!key) continue;
    const previous = bestByKey.get(key);
    const currentScore = scoreCandidate(item);
    const previousScore = previous ? scoreCandidate(previous) : -1;
    if (!previous || currentScore > previousScore) {
      bestByKey.set(key, item);
    }
  }
  return [...bestByKey.values()];
}

function parseTeachNoticeLinks(html, source) {
  const items = [];
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = absolutizeUrl(source.siteUrl || source.indexUrl, decodeHtml(match[1]));
    const title = cleanTitle(match[2]);
    const nearby = html.slice(Math.max(0, match.index - 240), Math.min(html.length, match.index + 240));
    const publishedAt = extractDate(stripTags(nearby));
    items.push({ title, url, guid: url, publishedAt, summary: '' });
  }
  return dedupeCandidates(items).filter(item => passesSourceFilters(item, source)).slice(0, (source.maxItems || 8) * 5);
}

function parseMarxNewsLinks(html, source) {
  const items = [];
  const regex = /<li[^>]+class="[^"]*news[^"]*"[\s\S]*?<span class="news_time">([\s\S]*?)<\/span>[\s\S]*?<span class="news_title">([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const publishedAt = extractDate(stripTags(match[1]));
    const titleBlock = match[2];
    const linkMatch = titleBlock.match(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = absolutizeUrl(source.siteUrl || source.indexUrl, decodeHtml(linkMatch[1]));
    const title = cleanTitle(linkMatch[2]);
    items.push({ title, url, guid: url, publishedAt, summary: '' });
  }
  return dedupeCandidates(items).filter(item => passesSourceFilters(item, source)).slice(0, (source.maxItems || 8) * 5);
}

function parseEarthEssNewsLinks(html, source) {
  const items = [];
  const regex = /<li>[\s\S]*?<time>([\s\S]*?)<\/time>[\s\S]*?<h4>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h4>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const publishedAt = extractDate(stripTags(match[1]));
    const url = absolutizeUrl(source.siteUrl || source.indexUrl, decodeHtml(match[2]));
    const title = cleanTitle(match[3]);
    items.push({ title, url, guid: url, publishedAt, summary: '' });
  }
  return dedupeCandidates(items).filter(item => passesSourceFilters(item, source)).slice(0, (source.maxItems || 8) * 5);
}

function parsePhysicsNewsLinks(html, source) {
  const items = [];
  const regex = /<div class="accordion-heading">\s*<a[^>]*href="#collapse\d+"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*align="right"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>查看全文>>>?<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const title = cleanTitle(match[1]);
    const url = absolutizeUrl(source.siteUrl || source.indexUrl, decodeHtml(match[2]));
    items.push({ title, url, guid: url, publishedAt: null, summary: '' });
  }
  return dedupeCandidates(items).filter(item => passesSourceFilters(item, source)).slice(0, (source.maxItems || 8) * 5);
}

function parseNuclearNewsLinks(html, source) {
  const items = [];
  const regex = /<li[^>]+class="[^"]*views_list_item[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<div[^>]+class="[^"]*views_list_date[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = absolutizeUrl(source.siteUrl || source.indexUrl, decodeHtml(match[1]));
    const publishedAt = extractDate(`${stripTags(match[3])}/${stripTags(match[2])}`);
    const title = cleanTitle(match[4]);
    items.push({ title, url, guid: url, publishedAt, summary: '' });
  }
  return dedupeCandidates(items).filter(item => passesSourceFilters(item, source)).slice(0, (source.maxItems || 8) * 5);
}

function parseUstcNewsLinks(html, source) {
  const items = [];
  const regex = /<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawUrl = decodeHtml(match[1]);
    const url = absolutizeUrl(source.siteUrl || source.indexUrl, rawUrl);
    const title = cleanTitle(match[2]);
    const nearby = html.slice(Math.max(0, match.index - 320), Math.min(html.length, match.index + 320));
    const publishedAt = extractDate(stripTags(nearby));
    items.push({ title, url, guid: url, publishedAt, summary: '' });
  }
  const filtered = dedupeCandidates(items)
    .filter(item => passesSourceFilters(item, source));
  const relevant = source.academyKey
    ? filtered
    : filtered.filter(item => /中国科大|中国科学技术大学|实验室|团队|学院|学生|教授|研究|论坛|会议|成果|获|举办|开展|发布/.test(item.title));
  return relevant.slice(0, (source.maxItems || 8) * 5);
}

function extractFirst(html, regexes) {
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match?.[1]) return match[1];
  }
  return '';
}

function extractGenericArticle(html, source) {
  const title = cleanTitle(extractFirst(html, [
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
    /<title>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
  ])) || 'Untitled';

  const publishedAt = source.siteUrl?.includes('teach.ustc.edu.cn')
    ? extractPreferredDate(html, [
      /<div[^>]+class="[^"]*post-meta-print[^"]*"[^>]*>[\s\S]*?(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i,
      /<i[^>]+fa-clock-o[^>]*><\/i>\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i,
      /<time[^>]*>([\s\S]*?)<\/time>/i
    ])
    : source.siteUrl?.includes('news.ustc.edu.cn')
      ? extractPreferredDate(html, [
        /(?:发布时间|日期)[：:\s]*<[^>]*>(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i,
        /(?:发布时间|日期)[：:\s]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i,
        /<time[^>]*>([\s\S]*?)<\/time>/i
      ])
      : source.siteUrl?.includes('physics.ustc.edu.cn')
        ? extractPreferredDate(html, [
          /<h1[^>]*>[\s\S]*?\[(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})\][\s\S]*?<\/h1>/i,
          /<font[^>]*>\[(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})\]<\/font>/i,
          /<time[^>]*>([\s\S]*?)<\/time>/i
        ])
        : source.siteUrl?.includes('sgy.ustc.edu.cn')
          ? extractPreferredDate(html, [
            /发布时间[：:\s]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/i,
            /<span[^>]*>\s*发布时间[：:\s]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})\s*<\/span>/i,
            /<time[^>]*>([\s\S]*?)<\/time>/i
          ])
          : extractPreferredDate(html, [
            /<time[^>]*>([\s\S]*?)<\/time>/i,
            /class="[^"]*(?:date|time|post-meta)[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
            /发布时间[：:\s]*<[^>]*>([\s\S]*?)<\/[^>]+>/i,
            /发布时间[：:\s]*([^<\n]+)/i,
            /(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})/
          ]);

  let contentHtml = source.siteUrl?.includes('physics.ustc.edu.cn')
    ? extractFirst(html, [
      /<div[^>]+class=['"][^'"]*wp_articlecontent[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=['"][^'"]*row-fluid privacy[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i
    ])
    : source.siteUrl?.includes('sgy.ustc.edu.cn')
      ? extractFirst(html, [
        /<div[^>]+class=['"][^'"]*detail_content[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+class=['"][^'"]*wp_articlecontent[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i
      ])
      : extractFirst(html, [
        /<div[^>]+class="[^"]*v_news_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]+class="[^"]*(?:entry-content|post-content|article-content|content-main|news-content|wp_articlecontent|read|detail)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+id="[^"]*(?:content|vsb_content|print-content|print_content|article|zoom)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ]);

  if (!contentHtml) {
    contentHtml = html;
  }

  const content = stripTags(contentHtml)
    .replace(/上一篇.*$/i, ' ')
    .replace(/下一篇.*$/i, ' ')
    .replace(/责任编辑.*$/i, ' ')
    .replace(/打印\s+关闭.*$/i, ' ')
    .replace(/^首页\s+通知公告\s*/i, ' ')
    .trim();

  return { title, publishedAt, content, sourceName: source.name };
}

function isHighValueArticle(article, source) {
  if (!article.title || article.title.length < 6) return false;
  if (isLowValueTitle(article.title)) return false;
  if (source.academyKey) {
    if (article.publishedAt) return true;
    return !!article.content && article.content.length >= 40 && !isLikelyNoise(article.content.slice(0, 200));
  }
  if (!article.content || article.content.length < 80) return false;
  if (isLikelyNoise(article.content.slice(0, 200))) return false;
  if (article.content.replace(/\s+/g, '').startsWith(article.title.replace(/\s+/g, '')) && article.content.length < 120) return false;
  if (source.category === 'official' && !article.publishedAt && article.content.length < 150) return false;
  return true;
}

function scoreArticle(article) {
  let score = 0;
  if (article.publishedAt) score += 5;
  score += Math.min(article.content.length, 1200) / 100;
  if (/通知|公告|报名|答辩|选课|考试|申请|公示|课程|教学/.test(article.title)) score += 3;
  if (/中国科大|中国科学技术大学|教授|学生|团队|学院|研究|成果|论坛|会议|举办|发布/.test(article.title)) score += 2;
  if (/物理学院首届“悟理有术”本科生学术论坛日程安排/.test(article.title)) score -= 20;
  if (/培养方案|工作方案/.test(article.title)) score -= 10;
  return score;
}

function dedupeSelectedArticles(entries, source) {
  const bestByKey = new Map();
  for (const entry of entries) {
    const item = entry.item;
    const summaryKey = (item.summary || '').replace(/\s+/g, ' ').slice(0, 120);
    const key = [
      source.name,
      cleanTitle(item.title || ''),
      item.publishedAt || '',
      summaryKey
    ].join('|');
    const previous = bestByKey.get(key);
    if (!previous) {
      bestByKey.set(key, entry);
      continue;
    }
    const currentUrl = item.url || '';
    const previousUrl = previous.item.url || '';
    if (currentUrl.length < previousUrl.length) {
      bestByKey.set(key, entry);
    }
  }
  return [...bestByKey.values()];
}

async function fetchScrapeItems(source, state) {
  const res = await fetch(source.indexUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  let candidates = [];
  if (source.listParser === 'teach_notice_links') {
    candidates = parseTeachNoticeLinks(html, source);
  } else if (source.listParser === 'earth_ess_news_links') {
    candidates = parseEarthEssNewsLinks(html, source);
  } else if (source.listParser === 'marx_news_links') {
    candidates = parseMarxNewsLinks(html, source);
  } else if (source.listParser === 'physics_news_links') {
    candidates = parsePhysicsNewsLinks(html, source);
  } else if (source.listParser === 'nuclear_news_links') {
    candidates = parseNuclearNewsLinks(html, source);
  } else if (source.listParser === 'ustc_news_links') {
    candidates = parseUstcNewsLinks(html, source);
  }

  const evaluated = [];
  for (const item of candidates) {
    const uniqueId = item.guid || item.url || item.title;
    if (!uniqueId || (shouldSkipSeenItems(source) && state.seenItems[uniqueId])) continue;

    let article = {
      title: cleanTitle(item.title),
      publishedAt: item.publishedAt || null,
      content: item.summary || ''
    };

    if (source.contentMode === 'article' && item.url) {
      try {
        const articleRes = await fetch(item.url, {
          headers: { 'User-Agent': USER_AGENT }
        });
        if (articleRes.ok) {
          const articleHtml = await articleRes.text();
          article = extractGenericArticle(articleHtml, source);
          if (!article.publishedAt) article.publishedAt = item.publishedAt || null;
        }
      } catch {
      }
    }

    if (!isHighValueArticle(article, source)) continue;
    if (shouldApplyLookback(source) && !withinLookback({ publishedAt: article.publishedAt }, source.lookbackHours || DEFAULT_LOOKBACK_HOURS)) continue;

    evaluated.push({
      uniqueId,
      score: scoreArticle(article),
      item: buildOutputItem(source, {
        title: article.title || cleanTitle(item.title),
        url: item.url,
        publishedAt: article.publishedAt,
        summary: article.content
      })
    });
  }

  const dedupedEvaluated = dedupeSelectedArticles(evaluated, source);
  dedupedEvaluated.sort((a, b) => {
    if (source.academyKey) {
      if (a.item.publishedAt && b.item.publishedAt) {
        const dateDiff = new Date(b.item.publishedAt) - new Date(a.item.publishedAt);
        if (dateDiff !== 0) return dateDiff;
      } else if (a.item.publishedAt) {
        return -1;
      } else if (b.item.publishedAt) {
        return 1;
      }
      return b.score - a.score;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.publishedAt && b.item.publishedAt) return new Date(b.item.publishedAt) - new Date(a.item.publishedAt);
    if (a.item.publishedAt) return -1;
    if (b.item.publishedAt) return 1;
    return 0;
  });

  const selected = dedupedEvaluated.slice(0, source.maxItems || 5);
  for (const entry of selected) {
    if (shouldSkipSeenItems(source)) {
      state.seenItems[entry.uniqueId] = Date.now();
    }
  }
  return selected.map(entry => entry.item);
}

async function fetchCategoryContent(sources, state, errors) {
  const results = [];
  for (const source of sources) {
    try {
      let items = [];
      if (source.type === 'rss' || source.type === 'atom') {
        items = await fetchFeedItems(source, state);
      } else if (source.type === 'scrape') {
        items = await fetchScrapeItems(source, state);
      }
      results.push(...items.filter(item => !shouldApplyLookback(source) || withinLookback(item, source.lookbackHours || DEFAULT_LOOKBACK_HOURS)));
    } catch (err) {
      errors.push(`${source.category}: ${source.name}: ${err.message}`);
    }
  }
  return results.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt) - new Date(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return 0;
  });
}

async function main() {
  const sources = await loadSources();
  const state = await loadState();
  const errors = [];

  const official = await fetchCategoryContent(sources.official || [], state, errors);
  const tech = await fetchCategoryContent(sources.tech || [], state, errors);
  const papers = await fetchCategoryContent(sources.papers || [], state, errors);

  await writeFile(join(SCRIPT_DIR, '..', 'feed-official.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    official,
    stats: { officialItems: official.length },
    errors: errors.filter(e => e.startsWith('official:')).length ? errors.filter(e => e.startsWith('official:')) : undefined
  }, null, 2));

  await writeFile(join(SCRIPT_DIR, '..', 'feed-tech.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    tech,
    stats: { techItems: tech.length },
    errors: errors.filter(e => e.startsWith('tech:')).length ? errors.filter(e => e.startsWith('tech:')) : undefined
  }, null, 2));

  await writeFile(join(SCRIPT_DIR, '..', 'feed-papers.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    papers,
    stats: { paperItems: papers.length },
    errors: errors.filter(e => e.startsWith('papers:')).length ? errors.filter(e => e.startsWith('papers:')) : undefined
  }, null, 2));

  await saveState(state);
}

main().catch(err => {
  console.error('Feed generation failed:', err.message);
  process.exit(1);
});
