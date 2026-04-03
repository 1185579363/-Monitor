const BASE_URL = "https://www.jinse.com.cn";
const LIVES_URL = `${BASE_URL}/lives`;
const SHANGHAI_TZ = "Asia/Shanghai";

function absoluteUrl(url) {
  if (!url) {
    return LIVES_URL;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(".cn.cn/", ".cn/");
  }
  return `${BASE_URL}${url}`.replace(".cn.cn/", ".cn/");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getDateParts(timestamp) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

function splitTopLevel(input) {
  const parts = [];
  let current = "";
  let depthBrace = 0;
  let depthBracket = 0;
  let depthParen = 0;
  let inString = false;
  let quoteChar = "";
  let escaped = false;

  for (const ch of String(input || "")) {
    current += ch;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
        quoteChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      continue;
    }
    if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === "," && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
      parts.push(current.slice(0, -1));
      current = "";
    }
  }

  if (current.trim()) {
    parts.push(current);
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

function decodeJsString(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw.slice(1, -1);
  }
}

function buildAliasMap(html) {
  const pageHtml = String(html || "");
  const start = pageHtml.indexOf("__NUXT__=(function(");
  const end = pageHtml.indexOf("</script>", start);
  if (start === -1 || end === -1) {
    return new Map();
  }
  const chunk = pageHtml.slice(start, end);
  const match = chunk.match(
    /__NUXT__=\(function\(([^)]*)\)\{return[\s\S]*?\}\(([\s\S]*)\)\);?$/,
  );
  if (!match) {
    return new Map();
  }

  const params = match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const args = splitTopLevel(match[2]);
  const aliases = new Map();

  params.forEach((name, index) => {
    const raw = (args[index] || "").trim();
    if (!raw) {
      return;
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      aliases.set(name, decodeJsString(raw));
      return;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      aliases.set(name, Number(raw));
      return;
    }
    if (raw === "null") {
      aliases.set(name, null);
      return;
    }
    if (raw === "!0") {
      aliases.set(name, true);
      return;
    }
    if (raw === "!1") {
      aliases.set(name, false);
    }
  });

  return aliases;
}

function extractArrayBlock(html, label, nextLabel) {
  const match = String(html || "").match(
    new RegExp(`${label}:\\[(.*?)\\],${nextLabel}:`, "s"),
  );
  return match ? match[1] : "";
}

function splitObjectItems(block) {
  const objects = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let quoteChar = "";
  let escaped = false;

  for (const ch of String(block || "")) {
    if (inString) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
        quoteChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      current += ch;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      current += ch;
      if (depth === 0 && current.trim()) {
        objects.push(current.trim());
        current = "";
      }
      continue;
    }
    if (depth > 0) {
      current += ch;
    }
  }

  return objects;
}

function splitKeyValue(segment) {
  let inString = false;
  let quoteChar = "";
  let escaped = false;
  let depthBrace = 0;
  let depthBracket = 0;
  let depthParen = 0;

  for (let index = 0; index < segment.length; index += 1) {
    const ch = segment[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
        quoteChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      continue;
    }
    if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === ":" && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
      return [segment.slice(0, index).trim(), segment.slice(index + 1).trim()];
    }
  }

  return [segment.trim(), ""];
}

function parseObject(objectLiteral, aliases) {
  const inner = objectLiteral.replace(/^\{/, "").replace(/\}$/, "");
  const data = {};

  for (const part of splitTopLevel(inner)) {
    const [key, rawValue] = splitKeyValue(part);
    data[key] = resolveToken(rawValue, aliases);
  }

  return data;
}

function resolveToken(token, aliases) {
  const raw = String(token || "").trim();
  if (!raw) {
    return "";
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return decodeJsString(raw);
  }
  if (aliases.has(raw)) {
    return aliases.get(raw);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  if (raw === "null") return null;
  if (raw === "!0") return true;
  if (raw === "!1") return false;
  return raw;
}

function normalizeSupplementItem(raw, prefix) {
  const timestamp = Number(raw.published_at || 0) * 1000;
  if (!timestamp) {
    return null;
  }
  const title = stripTags(raw.title || raw.short_title || "");
  const summary = stripTags(raw.short_title || raw.title || "");
  const url = absoluteUrl(String(raw.jump_url || "").replace(/\\u002F/g, "/"));
  if (title.length <= 2 || summary.length <= 2 || !/^https?:\/\//.test(url)) {
    return null;
  }
  const parts = getDateParts(timestamp);
  return {
    id: `${prefix}-${raw.id || raw.jump_url || raw.title}`,
    title,
    summary,
    timeLabel: `${parts.hour}:${parts.minute}`,
    source: "金色财经",
    url,
    timestamp,
  };
}

function extractSupplementItems(html) {
  const aliases = buildAliasMap(html);
  const blocks = [
    extractArrayBlock(html, "breakingNewsList", "searchHotsData"),
    extractArrayBlock(html, "recommendationData", "FilteredTagData"),
  ];
  const items = [];
  const seen = new Set();

  for (const [index, block] of blocks.entries()) {
    for (const objectLiteral of splitObjectItems(block)) {
      const raw = parseObject(objectLiteral, aliases);
      const item = normalizeSupplementItem(raw, `extra${index + 1}`);
      if (!item || seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      items.push(item);
    }
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

function extractVisibleItems(html) {
  const blocks = html.match(/<div class="js-lives js-lives__item">[\s\S]*?<\/div>\s*<\/div>/g) || [];
  const items = [];

  for (const block of blocks) {
    const titleMatch = block.match(
      /<a[^>]*class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<a[^>]*href="([^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/,
    );
    const summaryMatches = [...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const timeMatch = block.match(/<div class="time">\s*([\d:]+)\s*<\/div>/);
    if (!titleMatch || !summaryMatches.length) {
      continue;
    }

    const summaryMatch = summaryMatches.length > 1 ? summaryMatches[1] : summaryMatches[0];
    const href = titleMatch[1] || titleMatch[3];
    const title = stripTags(titleMatch[2] || titleMatch[4]);
    const summary = stripTags(summaryMatch[2]);
    const timeLabel = timeMatch ? timeMatch[1] : "";
    const idMatch = href.match(/(\d+)\.html/);
    const timestamp = timeLabel ? Date.now() : 0;

    items.push({
      id: idMatch ? idMatch[1] : href,
      title,
      summary,
      timeLabel,
      source: "金色财经",
      url: absoluteUrl(href),
      timestamp,
    });
  }

  return items;
}

async function fetchHtmlWithRetry(url, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 30000);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          Referer: LIVES_URL,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function mergeItems(visibleItems, supplementItems, limit) {
  const items = [];
  const seenUrls = new Set();

  for (const item of [...visibleItems, ...supplementItems]) {
    if (!item || seenUrls.has(item.url)) {
      continue;
    }
    seenUrls.add(item.url);
    items.push(item);
    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const limit = Math.max(
    1,
    Math.min(80, Number.parseInt(requestUrl.searchParams.get("limit") || "50", 10) || 50),
  );

  try {
    const html = await fetchHtmlWithRetry(LIVES_URL, 2);
    const visibleItems = extractVisibleItems(html);
    const supplementItems = extractSupplementItems(html);
    const items = mergeItems(visibleItems, supplementItems, limit);
    return jsonResponse(
      {
        siteTitle: "金色财经快讯",
        sourceUrl: LIVES_URL,
        articleCount: items.length,
        items,
        isLive: true,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        state: 0,
        msg: `Failed to fetch Jinse news: ${String(error)}`,
        items: [],
      },
      502,
    );
  }
}
