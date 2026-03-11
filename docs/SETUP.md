# Agada — Step-by-Step Setup Guide

This guide takes you from zero to a fully running Agada instance in under 30 minutes.

---

## Prerequisites

| Tool | Version | Where to get |
|------|---------|-------------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| npm | 9+ | Comes with Node.js |
| Git | Any | [git-scm.com](https://git-scm.com) |
| Supabase account | Free | [supabase.com](https://supabase.com) |
| Google AI Studio account | Free | [aistudio.google.com](https://aistudio.google.com) |

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/agada-health/agada.git
cd agada
npm install
```

---

## Step 2: Get Your API Keys

### Google Gemini API Key
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Copy the key — it looks like `AIzaSy...`
4. **Recommended:** Set a daily quota limit of 100 requests to prevent abuse

### Supabase Keys
1. Go to [supabase.com](https://supabase.com) → Create new project
2. Choose a region (India / Southeast Asia recommended for latency)
3. Go to **Settings → API**
4. Copy:
   - **Project URL** — looks like `https://xyzabc.supabase.co`
   - **anon / public key** — safe to use in browser

---

## Step 3: Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_GEMINI_API_KEY=AIzaSy_your_key_here
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your_anon_key_here
```

**⚠️ Never commit `.env.local` to Git. It's in `.gitignore`.**

---

## Step 4: Set Up the Database

### 4a. Create Tables

1. Go to your Supabase dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **"New query"**
4. Open `supabase/schema.sql` from this repo
5. Paste the entire contents into the editor
6. Click **Run**

You should see confirmation that tables were created.

### 4b. Seed Test Data (for development)

```bash
# Add your Supabase SERVICE KEY (not anon key) to environment temporarily
export SUPABASE_SERVICE_KEY=your_service_role_key_here

npm run db:seed
```

This inserts sample records for: Crocin, Dolo-650, Augmentin, Metformin, Azithromycin, and one fake medicine for testing.

### 4c. Import Full Government Data (for production)

See [DATA_PIPELINE.md](DATA_PIPELINE.md) for full instructions on downloading and importing real CDSCO, Jan Aushadhi, and NPPA data.

---

## Step 5: Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

Try scanning a Crocin or Dolo-650 strip. You should see all three result cards.

---

## Step 6: Deploy to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel
```

Follow the prompts. When asked about environment variables, add:
- `VITE_GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Option B: Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import your GitHub repo
4. Add environment variables in the dashboard
5. Click **Deploy**

Vercel auto-detects Vite/React and configures everything.

---

## Troubleshooting

### "VITE_GEMINI_API_KEY is not set"
→ Check your `.env.local` file. All variables must start with `VITE_`.

### "Could not connect to database"
→ Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
→ Make sure you ran `supabase/schema.sql` in Supabase SQL Editor.

### "No results for any scan"
→ Database may be empty. Run `npm run db:seed` first.
→ Then test with "Crocin" or "Dolo".

### "AI returned unexpected response"
→ Gemini occasionally returns malformed JSON despite instructions.
→ Try scanning again — the retry will usually work.
→ Check your Gemini API key quota in Google AI Studio.

### Camera not opening on mobile
→ The site must be served over HTTPS for camera API to work.
→ Locally, use `npm run dev` (Vite serves via HTTP on localhost which browsers allow).
→ On production (Vercel), HTTPS is automatic.

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GEMINI_API_KEY` | ✅ Yes | Google Gemini API key |
| `VITE_SUPABASE_URL` | ✅ Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anon key (read-only) |

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at localhost:5173 |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run db:seed` | Insert sample data for testing |

---

*Questions? Open an issue on GitHub.*
