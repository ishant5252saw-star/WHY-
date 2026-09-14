# experiments

A collection of small, strange, playable internet experiments.

## Games

- **WHY?** (`/why`) — Find a reason the AI can't argue against. Tell it what you should be doing. It tries to convince you not to. You try to win.

## How it works

- Frontend: React + Vite + Tailwind CSS
- Backend: Supabase Edge Functions (Deno)
- Database: Supabase PostgreSQL
- AI: OpenAI API (configurable via `AI_MODEL` env var)

The AI is the opponent. It argues against whatever you should be doing. It moves goalposts, exploits loopholes, shifts tactics. You win only when it genuinely can't produce a defensible counterargument.

When you win, your winning argument is stored. The AI learns from past defeats and gets harder to beat over time.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

The Supabase URL and anon key are pre-configured in `.env`.

You need to add an OpenAI API key as a Supabase Edge Function secret:

1. Go to your Supabase project dashboard
2. Navigate to Edge Functions > Secrets
3. Add a secret named `OPENAI_API_KEY` with your OpenAI API key
4. Optionally add `AI_MODEL` (defaults to `gpt-4o-mini`)

### 3. Run

```bash
npm run dev
```

### 4. Build

```bash
npm run build
```

## Testing

```bash
npm test          # unit tests (Vitest)
npx playwright test  # browser tests (Playwright)
```

## Architecture

```
src/
  App.tsx              # Router (home / :gameSlug)
  pages/
    Home.tsx           # Game library
  games/
    registry.ts       # Game registry (add new games here)
    why/
      WhyGame.tsx     # WHY? game UI
  lib/
    api.ts            # Backend API client

supabase/
  config.toml         # Edge function config
  functions/
    why-game/
      index.ts        # Backend: API routes, AI, memory, validation
  migrations/
    *.sql             # Database schema
```

## Adding a new game

1. Create `src/games/your-game/YourGame.tsx`
2. Add an entry to `src/games/registry.ts`
3. The home page and routing update automatically.
