# Keeping keys encrypted and secure

## ⚠️ If you ever shared a key in chat or in a repo

1. **Rotate it immediately**: revoke the old key and create a new one in the provider dashboard.
2. **Do not** paste real keys into any file that gets committed to Git.

## How we keep keys secure

- **`.env` is in `.gitignore`** — it never gets committed. Only you have it on your machine.
- **Production** — add the same variable **names** (and new secret **values**) in the Vercel dashboard under **Project → Settings → Environment Variables**. Vercel stores them encrypted.
- **This repo** — contains only `.env.example` with placeholders (e.g. `sk-xxxx`). No real keys in the codebase.

## Variable names (values stay secret)

| Variable | Where to get it | Used for |
|----------|-----------------|----------|
| `OPENAI_API_KEY` | [OpenAI API keys](https://platform.openai.com/api-keys) | Embeddings + chat |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Backend only |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → **service_role** (secret) | Backend only; not the anon/publishable key |

**Note:** The backend uses **Supabase service_role key**, not the publishable/anon key. Use the **service_role** value from Supabase Dashboard → Project Settings → API for `SUPABASE_SERVICE_KEY`.

## One-time setup

1. Copy: `cp .env.example .env`
2. Edit `.env` on your machine and paste the **values** (or new rotated values). Do not commit `.env`.
3. In Vercel: add the three variables with **new/rotated** production values. Never paste production keys into chat or docs.
