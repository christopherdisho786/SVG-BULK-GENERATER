# SVG Bulk Generater

Web app for generating stock-marketplace-ready SVG animation batches from a single topic.

## Setup

```bash
npm install
export OPENAI_API_KEY=your_key_here
npm start
```

Open <http://localhost:3000>.

## Features

- Exactly 3 input boxes: Topic, Number of SVGs (1-50), Extra Instructions.
- Fixed output requirements enforced in AI system prompt (16:9, 3840x2160, loopable, no overflow).
- One API request per animation item.
- Auto-download every SVG immediately after generation.
- Strict filename format: `title.keyword1,keyword2,...keywordN.svg`.
- Optional switches:
  - Simple / Medium complexity
  - Preview on/off
  - Bulk ZIP download after completion
