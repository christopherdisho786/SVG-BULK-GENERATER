const http = require('http');
const fsp = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function extractSvg(text) {
  const raw = String(text || '').trim();
  const cleaned = raw
    .replace(/^```svg\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const svgStart = cleaned.indexOf('<svg');
  const svgEnd = cleaned.lastIndexOf('</svg>');

  if (svgStart < 0 || svgEnd < 0) {
    throw new Error('Model did not return valid SVG content.');
  }

  return cleaned.slice(svgStart, svgEnd + 6).trim();
}

async function callGemini({ apiKey, topic, instruction, jobSeed }) {
  const prompt = `Create a unique animated SVG for stock marketplaces.
Topic: ${topic}
Style: ${instruction}
Variation seed: ${jobSeed}
Hard requirements:
- Output ONLY SVG code.
- Use <svg viewBox="0 0 1920 1080" width="1920" height="1080">.
- Composition fully inside frame.
- No zoom in/out camera behavior.
- Seamless smooth loop.
- Minimal, professional, not overly complex.
- Pure vector SVG animation only (no raster images, no script tags).
- Keep path count moderate and lightweight.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        maxOutputTokens: 4096
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API failure (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';

  return extractSvg(text);
}

async function handleGenerate(req, res) {
  let rawBody = '';

  req.on('data', (chunk) => {
    rawBody += chunk;
    if (rawBody.length > 1024 * 1024) req.destroy();
  });

  req.on('end', async () => {
    try {
      const { apiKey, topic, instruction, jobSeed } = JSON.parse(rawBody || '{}');

      if (!apiKey || typeof apiKey !== 'string') {
        return sendJson(res, 400, { error: 'apiKey is required.' });
      }

      if (!topic || typeof topic !== 'string') {
        return sendJson(res, 400, { error: 'topic is required.' });
      }

      if (!instruction || typeof instruction !== 'string') {
        return sendJson(res, 400, { error: 'instruction is required.' });
      }

      const svg = await callGemini({
        apiKey: apiKey.trim(),
        topic: topic.trim(),
        instruction: instruction.trim(),
        jobSeed: String(jobSeed || Date.now())
      });

      return sendJson(res, 200, { svg });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'Unknown generation error.' });
    }
  });
}

async function serveStatic(req, res) {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
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
