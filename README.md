# SVG Bulk Generater

High-throughput SVG animation generator for stock marketplaces using multi-topic, multi-instruction, multi-key parallel execution.

## Run

```bash
npm install
npm start
```

Open <http://localhost:3000>.

## Upgraded workflow

- **Topics (CSV):** multiple topics at once.
- **SVG Count Per Topic:** 1 to 50 generated per topic+instruction combination.
- **Instructions (CSV):** multiple style directions.
- **Gemini API Keys:** up to 50 keys (newline-separated).

Generation matrix:

- For each topic
- For each instruction
- Generate N SVGs

All jobs run in parallel with key-shuffled round-robin assignment and retry on different keys (up to 2 retries).
If Gemini returns `Please retry in ...s`, the key is temporarily cooled down and workers switch to other keys until cooldown expires.
The server also tries multiple Gemini model candidates (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`) to reduce model-not-found failures.

## Output behavior

- Each successful SVG downloads immediately.
- Optional ZIP is automatically downloaded after completion.
- Filenames follow:
  - `6-to-9-word-title.keyword1,...keyword25.svg`
- Live status tracks:
  - Running tasks
  - Completed / Total
  - Failed / Retried
  - API keys active + used
  - Recent API error messages for debugging
