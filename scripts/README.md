# Seed script (Part B of Step 4)

Fills `sensihi_documents` with content and embeddings so the copilot can answer from your site.

## Quick start

```bash
cp scripts/seed-content.example.json scripts/seed-content.json
# Edit seed-content.json: add "chunks" and/or "urls"
npm run seed
```

## JSON format

- **chunks** — Array of `{ "content": "text...", "metadata": { "url": "/page", "title": "..." } }`. Use this for hand-written or pre-extracted text.
- **urls** — Array of full URLs. The script fetches each URL, strips HTML, splits into ~800-character chunks, then embeds and inserts. Use for live pages (e.g. `https://sensihi.com/solutions`).

You can use one or both. Requires `.env` with `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

## Commands

| Command | Description |
|--------|-------------|
| `npm run seed` | Run with `scripts/seed-content.json` |
| `npm run seed path/to/file.json` | Run with a custom JSON file |
| `npm run seed:example` | Run with the example file (for testing) |
