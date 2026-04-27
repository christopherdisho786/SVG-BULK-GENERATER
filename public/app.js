const form = document.getElementById('generator-form');
const topicInput = document.getElementById('topic');
const countInput = document.getElementById('count');
const extraInput = document.getElementById('extra');
const complexityInput = document.getElementById('complexity');
const previewToggle = document.getElementById('preview-toggle');
const zipToggle = document.getElementById('zip-toggle');
const progress = document.getElementById('progress');
const previewGrid = document.getElementById('preview-grid');
const startBtn = document.getElementById('start-btn');

const generatedFiles = [];

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
  previewGrid.appendChild(card);
}

async function downloadZipIfEnabled() {
  if (!zipToggle.checked || !window.JSZip || generatedFiles.length === 0) {
    return;
  }

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

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const topic = topicInput.value.trim();
  const count = Number(countInput.value);
  const extraInstructions = extraInput.value.trim();
  const complexity = complexityInput.value;

  if (!topic) {
    alert('Topic is required.');
    return;
  }

  if (!Number.isInteger(count) || count < 1 || count > 50) {
    alert('Number of SVGs must be an integer between 1 and 50.');
    return;
  }

  generatedFiles.length = 0;
  previewGrid.innerHTML = '';
  startBtn.disabled = true;

  try {
    for (let i = 1; i <= count; i += 1) {
      progress.textContent = `Generating ${i} of ${count}...`;

      const response = await fetch('/api/generate-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          extraInstructions,
          complexity,
          index: i,
          total: count
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed at item ${i}`);
      }

      const blob = forceSvgDownload(result.filename, result.svg);
      generatedFiles.push({ filename: result.filename, blob });

      if (previewToggle.checked) {
        addPreview(result.filename, result.svg);
      }
    }

    await downloadZipIfEnabled();
    progress.textContent = `Done. Generated ${count} SVG animations.`;
  } catch (error) {
    progress.textContent = `Stopped: ${error.message}`;
  } finally {
    startBtn.disabled = false;
  }
});
