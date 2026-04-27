const http = require('http');
const fsp = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const STYLE_FALLBACKS = [
  'minimal corporate blue',
  'clean modern fintech',
  'abstract ui dashboard',
  'flat geometric tech',
  'professional business motion graphics'
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function pickAutoStyle(index) {
  return STYLE_FALLBACKS[(Number(index) - 1) % STYLE_FALLBACKS.length] || STYLE_FALLBACKS[0];
}

function enforceTitle(rawTitle, topic, index) {
  const fallback = `${topic} animated stock vector loop variation ${index}`;
  const source = String(rawTitle || fallback).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = source.split(/\s+/).filter(Boolean).slice(0, 9);

  while (words.length < 6) {
    words.push('design');
  }

  return words.slice(0, 9).join('-').replace(/-+/g, '-');
}

function normalizeKeywords(rawKeywords, topic) {
  const topicWords = String(topic)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const stockDefaults = [
    'animation', 'loop', 'vector', 'svg', 'modern', 'clean', 'minimal', 'design', 'business',
    'digital', 'corporate', 'abstract', 'motion', 'background', 'template', 'icon', 'ui', 'tech',
    'professional', 'visual', 'creative', 'market', 'branding', 'presentation', 'seamless'
  ];

  const queue = [
    ...(Array.isArray(rawKeywords) ? rawKeywords : []),
    ...topicWords,
    ...stockDefaults
  ];

  const unique = [];
  const seen = new Set();

  for (const item of queue) {
    const normalized = String(item).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
    if (unique.length === 25) break;
  }

  while (unique.length < 23) {
    unique.push(`stock${unique.length}`);
  }

  return unique.slice(0, 25);
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

function ensureSvg(svgText) {
  const trimmed = String(svgText || '').trim();
  if (!trimmed.startsWith('<svg')) {
    throw new Error('AI returned invalid SVG payload.');
  }
  return trimmed;
}

async function handleGenerate(req, res) {
  let rawBody = '';

  req.on('data', (chunk) => {
    rawBody += chunk;
    if (rawBody.length > 1024 * 1024) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const { topic, extraInstructions, complexity, index, total } = JSON.parse(rawBody || '{}');

      if (!topic || typeof topic !== 'string') {
        return sendJson(res, 400, { error: 'Topic is required.' });
      }

      if (!OPENAI_API_KEY) {
        return sendJson(res, 500, {
          error: 'Missing OPENAI_API_KEY on server. Add it before generating.'
        });
      }

      const style = extraInstructions?.trim() || pickAutoStyle(index);
      const complexityRule = complexity === 'medium'
        ? 'medium complexity, still clean and stock-safe.'
        : 'simple complexity, low-node vector geometry.';

      const systemPrompt = `You create stock-marketplace-ready loopable SVG animations.
Return only strict JSON: {title,keywords,prompt,svg}.
Hard requirements:
- 16:9 composition using width=3840 height=2160
- all visuals contained in frame, no crop and no zoom animation
- seamless loop animation suitable for commercial stock uploads
- clean vector only (no raster), minimal and professional style
- distinct concept for each variation index
- title must be 6-9 words
- keywords must be 23-25 single words.`;

      const userPrompt = `Topic: ${topic}
Variation: ${index} of ${total}
Style direction: ${style}
Complexity: ${complexityRule}
Create a clearly different concept from other variations.`;

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'svg_generation',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'keywords', 'prompt', 'svg'],
                properties: {
                  title: { type: 'string' },
                  keywords: { type: 'array', minItems: 23, maxItems: 25, items: { type: 'string' } },
                  prompt: { type: 'string' },
                  svg: { type: 'string' }
                }
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return sendJson(res, 500, { error: `AI API failure: ${errText}` });
      }

      const data = await response.json();
      const outputText = extractOutputText(data);
      if (!outputText) {
        return sendJson(res, 500, { error: 'AI API returned no parsable output.' });
      }

      const parsed = JSON.parse(outputText);
      const title = enforceTitle(parsed.title, topic, index);
      const keywords = normalizeKeywords(parsed.keywords, topic);
      const svg = ensureSvg(parsed.svg);

      return sendJson(res, 200, {
        filename: `${title}.${keywords.join(',')}.svg`,
        svg,
        prompt: String(parsed.prompt || '').trim(),
        style,
        index,
        total
      });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'Unknown generation error.' });
    }
  });
}

async function serveStatic(req, res) {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate-one') {
    await handleGenerate(req, res);
    return;
  }

  if (req.method === 'GET') {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`SVG bulk generator running on http://localhost:${PORT}`);
});
