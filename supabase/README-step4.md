# Step 4: Enable vector search and RPC (manual)

## What this step does

Your copilot answers questions using **sensihi.com content**. To do that it needs:

1. **Vector search** — A way to find “which stored text is most similar to the user’s question?”
2. **RPC** — A Supabase function our API calls: `match_sensihi_documents`. That function runs the search and returns the best-matching text chunks.

You do two things: (A) create the table and function in Supabase, (B) fill the table with your content (and its embeddings).

---

## Part A: Run the SQL in Supabase (one time)

1. Go to [supabase.com](https://supabase.com) and open your project (e.g. the one with URL `https://eyfnfadqqswertysxfsf.supabase.co`).

2. In the left sidebar, click **“SQL Editor”**.

3. Click **“New query”**.

4. Open the file `vector-setup.sql` from this repo (in the `supabase/` folder). Copy **all** of its contents.

5. Paste into the Supabase SQL Editor.

6. Click **“Run”** (or press Cmd/Ctrl + Enter).

7. You should see a success message. That’s it for Part A.

Result:

- Extension `vector` is enabled.
- Table `sensihi_documents` exists (columns: `id`, `content`, `embedding`, `metadata`, `created_at`).
- Function `match_sensihi_documents` exists and is what `mcp/vector.ts` calls.

---

## Part B: Put your content into the table

The table starts **empty**. The copilot can only answer from content that’s in `sensihi_documents`.

For each “chunk” of text you want the copilot to use (e.g. a paragraph or a section from a page):

1. You need the **text** in the `content` column.
2. You need an **embedding** for that text (list of 1536 numbers from OpenAI `text-embedding-3-small`).

So you must either:

- **Option 1** — Run a one-time script that:
  - Takes your content (e.g. from a list of URLs or from copied text),
  - Calls OpenAI to get embeddings,
  - Inserts rows into `sensihi_documents` (content + embedding).

- **Option 2** — Use Supabase Dashboard → **Table Editor** → `sensihi_documents` and add rows by hand. You’d still need something to generate the embeddings (e.g. a small script) and paste the embedding array into the `embedding` column (not practical for many rows).

Recommended: **Option 1** — use the seed script in this repo.

### Using the seed script

1. **Create your content file** (use the example as a template):
   ```bash
   cp scripts/seed-content.example.json scripts/seed-content.json
   ```
2. **Edit `scripts/seed-content.json`**:
   - **chunks** — array of `{ "content": "text...", "metadata": { "url": "/page", "title": "..." } }`. Add as many as you like.
   - **urls** — optional array of full URLs (e.g. `https://sensihi.com/solutions`). The script will fetch each page, extract text, split into chunks, and embed them.
3. **Run the seed** (requires `.env` with `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`):
   ```bash
   npm run seed
   ```
   Or with a custom path:
   ```bash
   npm run seed path/to/your-content.json
   ```
4. The script inserts into `sensihi_documents` with `content`, `embedding`, and `metadata`. After it finishes, the copilot can answer from that content.

---

## Summary

| Part | What you do |
|------|-------------|
| **A** | In Supabase: SQL Editor → paste `supabase/vector-setup.sql` → Run. |
| **B** | Fill `sensihi_documents` with your sensihi.com content + embeddings (e.g. via the seed script). |

After A + B, the copilot’s vector search will return real content and it can answer from your site.
