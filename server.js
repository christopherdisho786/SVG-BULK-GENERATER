const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const STYLE_FALLBACKS = [
  'minimal corporate blue',
  'clean modern fintech',
  'abstract UI dashboard style',
  'flat geometric tech style',
  'professional business motion graphics'
];

function pickAutoStyle(index) {
  return STYLE_FALLBACKS[index % STYLE_FALLBACKS.length];
}

app.post('/api/generate-one', async (req, res) => {
  try {
    const { topic, extraInstructions, complexity, index, total } = req.body || {};

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Topic is required.' });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'Missing OPENAI_API_KEY on server. Add it to run generation.'
      });
    }

    const style = extraInstructions?.trim() || pickAutoStyle(Number(index || 0));
    const complexityRule = complexity === 'medium'
      ? 'medium detail but still stock-safe and clean.'
      : 'simple, low-node paths, very clean geometry.';

    const systemPrompt = `You create stock-marketplace-ready loopable SVG animations.
Return ONLY minified JSON with keys: title,keywords,prompt,svg.
Rules:
- title: 6-9 words, lowercase, hyphen-separated, SEO-friendly.
- keywords: array with 23-25 unique single-word lowercase entries.
- prompt: concise internal generation prompt.
- svg: valid standalone SVG string sized for 3840x2160, looping animation, no raster, no scripts.
- Keep visuals fully inside frame, no crop, no zoom in/out.
- Smooth seamless loop with animate/animateTransform.
- Avoid overly complex paths/filters and fragile gradients.
- Concept must be distinct for each variation index.
- Stock style: modern, professional, clean.`;

    const userPrompt = `Topic: ${topic}
Variation index: ${index} of ${total}
Style direction: ${style}
Complexity: ${complexityRule}
Build prompt internally and produce final output JSON.`;

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
                keywords: {
                  type: 'array',
                  minItems: 23,
                  maxItems: 25,
                  items: { type: 'string' }
                },
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
      return res.status(500).json({ error: `AI API failure: ${errText}` });
    }

    const data = await response.json();
    const outputText = data.output_text;

    if (!outputText) {
      return res.status(500).json({ error: 'No output_text returned from AI API.' });
    }

    const parsed = JSON.parse(outputText);

    const normalizedKeywords = parsed.keywords
      .map((k) => String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
      .slice(0, 25);

    if (normalizedKeywords.length < 23) {
      return res.status(500).json({ error: 'AI returned fewer than 23 valid keywords.' });
    }

    const safeTitle = String(parsed.title || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const filename = `${safeTitle}.${normalizedKeywords.join(',')}.svg`;

    res.json({
      filename,
      svg: parsed.svg,
      prompt: parsed.prompt,
      style,
      index,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unknown generation error.' });
  }
});

app.listen(PORT, () => {
  console.log(`SVG bulk generator running on http://localhost:${PORT}`);
});
