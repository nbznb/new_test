#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const USER_DIR = join(homedir(), '.follow-ustc');
const CONFIG_PATH = join(USER_DIR, 'config.json');

const FEED_OFFICIAL_URL = 'https://raw.githubusercontent.com/your-org/follow-USTC/main/feed-official.json';
const FEED_TECH_URL = 'https://raw.githubusercontent.com/your-org/follow-USTC/main/feed-tech.json';
const FEED_PAPERS_URL = 'https://raw.githubusercontent.com/your-org/follow-USTC/main/feed-papers.json';

const PROMPTS_BASE = 'https://raw.githubusercontent.com/your-org/follow-USTC/main/prompts';
const PROMPT_FILES = [
  'summarize-announcements.md',
  'summarize-tech-news.md',
  'summarize-papers.md',
  'digest-intro.md',
  'translate.md'
];

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function normalizeConfig(config) {
  return {
    language: config.language || 'zh',
    frequency: config.frequency || 'daily',
    delivery: config.delivery || { method: 'stdout' },
    officialFilters: {
      includeAcademies: Array.isArray(config.officialFilters?.includeAcademies)
        ? config.officialFilters.includeAcademies
        : []
    }
  };
}

function filterOfficialItems(items, config) {
  const includeAcademies = new Set(config.officialFilters.includeAcademies || []);
  return (items || []).filter(item => {
    if (item.sourceSubtype !== 'academy') return true;
    return !!item.academyKey && includeAcademies.has(item.academyKey);
  });
}

async function main() {
  const errors = [];

  let config = {
    language: 'zh',
    frequency: 'daily',
    delivery: { method: 'stdout' },
    officialFilters: { includeAcademies: [] }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = normalizeConfig(JSON.parse(await readFile(CONFIG_PATH, 'utf-8')));
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  } else {
    config = normalizeConfig(config);
  }

  const prompts = {};
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const localPromptsDir = join(scriptDir, '..', 'prompts');
  const localFeedsDir = join(scriptDir, '..');
  const userPromptsDir = join(USER_DIR, 'prompts');

  let [feedOfficial, feedTech, feedPapers] = await Promise.all([
    fetchJSON(FEED_OFFICIAL_URL),
    fetchJSON(FEED_TECH_URL),
    fetchJSON(FEED_PAPERS_URL)
  ]);

  if (!feedOfficial && existsSync(join(localFeedsDir, 'feed-official.json'))) {
    feedOfficial = JSON.parse(await readFile(join(localFeedsDir, 'feed-official.json'), 'utf-8'));
  }
  if (!feedTech && existsSync(join(localFeedsDir, 'feed-tech.json'))) {
    feedTech = JSON.parse(await readFile(join(localFeedsDir, 'feed-tech.json'), 'utf-8'));
  }
  if (!feedPapers && existsSync(join(localFeedsDir, 'feed-papers.json'))) {
    feedPapers = JSON.parse(await readFile(join(localFeedsDir, 'feed-papers.json'), 'utf-8'));
  }

  if (!feedOfficial) errors.push('Could not fetch official feed');
  if (!feedTech) errors.push('Could not fetch tech feed');
  if (!feedPapers) errors.push('Could not fetch paper feed');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    const remote = await fetchText(`${PROMPTS_BASE}/${filename}`);
    if (remote) {
      prompts[key] = remote;
      continue;
    }

    if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
    } else {
      errors.push(`Could not load prompt: ${filename}`);
    }
  }

  const official = filterOfficialItems(feedOfficial?.official || [], config);

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    config,
    official,
    tech: feedTech?.tech || [],
    papers: feedPapers?.papers || [],
    stats: {
      officialItems: official.length,
      techItems: feedTech?.tech?.length || 0,
      paperItems: feedPapers?.papers?.length || 0,
      feedGeneratedAt: feedOfficial?.generatedAt || feedTech?.generatedAt || feedPapers?.generatedAt || null
    },
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
