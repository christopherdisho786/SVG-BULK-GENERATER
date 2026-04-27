const form = document.getElementById('generator-form');
const topicsInput = document.getElementById('topics');
const countInput = document.getElementById('count');
const instructionsInput = document.getElementById('instructions');
const keysInput = document.getElementById('keys');
const startBtn = document.getElementById('start-btn');
const progress = document.getElementById('progress');
const previewGrid = document.getElementById('preview-grid');

const runningEl = document.getElementById('running');
const completedEl = document.getElementById('completed');
const failedEl = document.getElementById('failed');
const retriedEl = document.getElementById('retried');
const keyUsageEl = document.getElementById('key-usage');
const errorsEl = document.getElementById('errors');

const generatedFiles = [];

function parseCsv(text) {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseKeys(text) {
  return text
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hashCode(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildTitle(topic, instruction, seed) {
  const base = `${topic} ${instruction}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = base.split(/\s+/).filter(Boolean);
  const concepts = ['loop', 'motion', 'vector', 'background', 'corporate', 'modern', 'animated', 'abstract', 'design'];

  while (words.length < 6) {
    words.push(concepts[(seed + words.length) % concepts.length]);
  }

  return words.slice(0, 9).join('-').replace(/-+/g, '-');
}

function buildKeywords(topic, instruction) {
  const source = `${topic} ${instruction}`.toLowerCase();
  const seedWords = source.split(/[^a-z0-9]+/).filter(Boolean);
  const defaults = [
    'animation', 'loop', 'vector', 'svg', 'business', 'tech', 'corporate', 'design', 'minimal',
    'modern', 'background', 'ui', 'interface', 'visual', 'digital', 'professional', 'branding',
    'creative', 'clean', 'abstract', 'motion', 'template', 'market', 'stock', 'presentation'
  ];
  const unique = [...new Set([...seedWords, ...defaults])].filter((w) => /^[a-z0-9]+$/.test(w));
  return unique.slice(0, 25);
}

function buildFilename({ topic, instruction, sequence }) {
  const seed = hashCode(`${topic}|${instruction}|${sequence}`);
  const title = buildTitle(topic, instruction, seed);
  const keywords = buildKeywords(topic, instruction);

  while (keywords.length < 23) {
    keywords.push(`tag${keywords.length}`);
  }

  return `${title}.${keywords.slice(0, 25).join(',')}.svg`;
}

function forceSvgDownload(filename, svgText) {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return blob;
}

function addPreview(filename, svgText) {
  const card = document.createElement('article');
  card.className = 'card';

  const wrapper = document.createElement('div');
  wrapper.innerHTML = svgText;

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = filename;

  card.appendChild(wrapper);
  card.appendChild(name);
  previewGrid.prepend(card);
}

async function downloadZip() {
  if (!window.JSZip || generatedFiles.length === 0) return;

  const zip = new window.JSZip();
  generatedFiles.forEach(({ filename, blob }) => zip.file(filename, blob));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `svg-batch-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildJobs(topics, instructions, countPerTopic, keys) {
  const jobs = [];
  let id = 1;

  for (const topic of topics) {
    for (const instruction of instructions) {
      for (let i = 0; i < countPerTopic; i += 1) {
        jobs.push({
          id: id += 1,
          sequence: i + 1,
          topic,
          instruction,
          primaryKeyIndex: (id - 1) % keys.length
        });
      }
    }
  }

  return jobs;
}

async function requestSvg(job, key) {
  const response = await fetch('/api/generate-one', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: key,
      topic: job.topic,
      instruction: job.instruction,
      jobSeed: `${job.topic}-${job.instruction}-${job.sequence}-${Date.now()}`
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Failed job ${job.id}`);
  }

  return payload.svg;
}

function pickRetryKey(keys, usedSet) {
  const candidates = keys.filter((k) => !usedSet.has(k));
  if (candidates.length === 0) {
    return keys[Math.floor(Math.random() * keys.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const topics = parseCsv(topicsInput.value);
  const instructions = parseCsv(instructionsInput.value);
  const keys = shuffleArray(parseKeys(keysInput.value));
  const countPerTopic = Number(countInput.value);

  if (topics.length === 0) return alert('Enter at least one topic.');
  if (instructions.length === 0) return alert('Enter at least one instruction.');
  if (!Number.isInteger(countPerTopic) || countPerTopic < 1 || countPerTopic > 50) {
    return alert('SVG Count Per Topic must be an integer between 1 and 50.');
  }
  if (keys.length === 0) return alert('Enter at least one API key.');

  const jobs = buildJobs(topics, instructions, countPerTopic, keys);
  const total = jobs.length;
  const keyStats = new Map(keys.map((k) => [k, { active: 0, completed: 0, failed: 0, retries: 0 }]));
  const keyUsedEver = new Set();
  const recentErrors = [];

  let completed = 0;
  let failed = 0;
  let retried = 0;
  let running = 0;

  generatedFiles.length = 0;
  previewGrid.innerHTML = '';
  errorsEl.textContent = '';
  startBtn.disabled = true;

  const updateStatus = () => {
    const activeKeys = [...keyStats.values()].filter((s) => s.active > 0).length;
    const usedKeys = keyUsedEver.size;
    runningEl.textContent = `Running: ${running} tasks`;
    completedEl.textContent = `Completed: ${completed}/${total}`;
    failedEl.textContent = `Failed: ${failed}`;
    retriedEl.textContent = `Retried: ${retried}`;
    keyUsageEl.textContent = `Active ${activeKeys}/${keys.length} · Used ${usedKeys}/${keys.length} API keys`;
    progress.textContent = `Parallel jobs active. ${completed + failed}/${total} processed.`;
    errorsEl.textContent = recentErrors.length === 0 ? '' : `Recent errors:\n- ${recentErrors.join('\n- ')}`;
  };

  let cursor = 0;

  async function worker(workerId) {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= jobs.length) break;

      const job = jobs[idx];
      const used = new Set();
      let currentKey = keys[job.primaryKeyIndex % keys.length];
      let success = false;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (used.has(currentKey)) {
          currentKey = pickRetryKey(keys, used);
        }

        const attemptKey = currentKey;
        used.add(attemptKey);
        keyUsedEver.add(attemptKey);
        running += 1;
        keyStats.get(attemptKey).active += 1;
        updateStatus();

        try {
          const svg = await requestSvg(job, attemptKey);
          const filename = buildFilename(job);
          const blob = forceSvgDownload(filename, svg);
          generatedFiles.push({ filename, blob });
          addPreview(filename, svg);

          completed += 1;
          keyStats.get(attemptKey).completed += 1;
          success = true;
          break;
        } catch (error) {
          keyStats.get(attemptKey).failed += 1;
          recentErrors.unshift(`${job.topic} / ${job.instruction}: ${error.message}`);
          if (recentErrors.length > 8) recentErrors.pop();
          if (attempt < 2) {
            retried += 1;
            keyStats.get(attemptKey).retries += 1;
            currentKey = pickRetryKey(keys, used);
          }
        } finally {
          running -= 1;
          keyStats.get(attemptKey).active = Math.max(0, keyStats.get(attemptKey).active - 1);
          updateStatus();
        }
      }

      if (!success) {
        failed += 1;
        updateStatus();
      }

      if (workerId % 2 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  try {
    const workerCount = Math.min(keys.length, jobs.length);
    await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));

    progress.textContent = `Done. Completed ${completed}, failed ${failed}, total ${total}.`;
    if (failed === total) {
      errorsEl.textContent = `${errorsEl.textContent}\n\nTip: if every task failed, check key validity, Gemini API enablement, and project quota/billing.`;
    }
    await downloadZip();
  } catch (error) {
    progress.textContent = `Stopped: ${error.message}`;
  } finally {
    startBtn.disabled = false;
  }
});
