# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # API on :8787 + Vite on :5173 (proxied), concurrently
npm run typecheck   # tsc -b — both projects, no emit
npm run build       # tsc -b && vite build → dist/
npm start           # production: single origin on :8787, serves dist/
```

There is no test runner and no linter configured. `npm run typecheck` is the
only automated check — run it after any change; the compiler is doing the work
a test suite would otherwise do here.

On Windows, `npm start` will fail in PowerShell: its script uses the POSIX
`NODE_ENV=production node …` prefix. Use `$env:NODE_ENV='production'; node server/index.ts`,
or run it from the Bash tool.

Verifying server behaviour without a browser:

```bash
curl -s localhost:8787/api/meta | head -c 2000     # engine, warnings, per-feed status
curl -s 'localhost:8787/api/news?topic=transfer&limit=3'
curl -s -X POST localhost:8787/api/refresh          # forces a full pipeline run
```

`/api/meta`'s `warnings` array is the pipeline's diagnostic channel — failed
feeds, articles that fell back to their RSS blurb, dropped stubs and summariser
errors all land there rather than throwing.

## No build step for the server

Node 24 strips TypeScript types at runtime, so `server/` runs its `.ts` files
directly and never produces a `dist/`. Two hard constraints follow, both enforced
by `tsconfig.node.json` (and mirrored in `tsconfig.app.json`):

- **Imports carry a literal `.ts` extension** — `./config.ts`, `../shared/types.ts`.
  Node resolves the specifier as written and will not rewrite it. This applies to
  frontend imports too (`allowImportingTsExtensions`).
- **`erasableSyntaxOnly`** — no `enum`, no `namespace`, no constructor parameter
  properties. Type stripping replaces types with whitespace; it cannot emit code.
  Use `as const` object maps or string-literal unions where an enum is tempting.

`tsconfig.json` is a solution file only; the real projects are
`tsconfig.app.json` (browser: `src` + `shared`) and `tsconfig.node.json`
(`server` + `shared` + `vite.config.ts`). Both are `noEmit`.

## Architecture

```
RSS feeds → relevance gate → article extraction → clustering → summarise → rank
```

`server/pipeline.ts` is the orchestrator and the file to read first. Everything
else in `server/` is a stage it calls. The pipeline runs on a timer
(`REFRESH_MINUTES`, default 15), holds results in a module-level `state` object,
and serves stale-while-revalidate: `getStories()` returns the current snapshot
immediately and fires a background refresh if stale, so a page load never waits.
`refresh()` deduplicates concurrent callers onto one in-flight promise — there is
never a second simultaneous scrape.

Stage responsibilities, in call order:

| File | Role |
| --- | --- |
| `feeds.ts` | Fetch/normalise all RSS, drop live blogs, video, galleries, SEO listings |
| `pipeline.ts` `selectFairly` | Round-robin the per-refresh budget across outlets |
| `extract.ts` | Fetch each article once, Readability, strip publisher cruft; in-memory URL cache (6h) |
| `relevance.ts` | Football-or-not gate — run before fetching *and* again with the body |
| `cluster.ts` | Group cross-source duplicates; pick the best member as primary |
| `summarize/index.ts` | Engine selection, then `extractive.ts` or `claude.ts` |
| `pipeline.ts` `rank`/`toPublic` | Order the feed and shape the wire response |

The internal story object **widens at each stage** and the types in
`server/types.ts` encode that as a chain of `extends`:
`FeedStory → ExtractedStory → ClusteredStory → SummarisedStory`. Keep new
per-stage fields on the interface for the stage that produces them, so a
function running after extraction cannot be handed a story that skipped it.

### The wire contract

`shared/types.ts` is compiled into *both* projects and holds every shape that
crosses the network. Change a response field there and the build breaks on
whichever side hasn't caught up — that's the point of the split. It contains
types only, so all imports of it are erased. Client-only types live in
`src/types.ts`; internal pipeline shapes in `server/types.ts`. Don't blur those
three.

`toPublic()` in `pipeline.ts` is the single boundary between the internal
`SummarisedStory` and the client's `Story`. Anything the browser needs must be
added there.

### Summarisation

Two interchangeable engines behind `summariseStories()`, chosen at runtime by
`summarizerEngine()` in `config.ts` (`SUMMARIZER=auto|extractive|claude`; `auto`
picks Claude when `ANTHROPIC_API_KEY` is set). The extractive engine is the
default so the repo works when cloned with no config, and it is also the
per-batch fallback when a Claude request fails — an outage degrades quality, not
availability.

`summarize/claude.ts` is cost-shaped and changes there have a price: batching
(`CLAUDE_BATCH_SIZE`, one request per 8 stories), body truncation
(`CLAUDE_BODY_CHARS`, 2500 — news is inverted-pyramid), structured JSON output
against `SUMMARY_SCHEMA`, and a `cache_control: ephemeral` system prompt. Editing
the system prompt invalidates that cache, so avoid churning it. Fields Claude
alone can produce (`clubs`, `importance`) are optional in `Summary` because the
extractive engine has no way to judge them — keep them optional.

### Frontend

React 19 SPA, Tailwind 4 (tokens in `src/index.css` via `@theme`; dark mode is a
`.dark` class on `<html>`, wired through `@custom-variant`, not `prefers-color-scheme`).

Filtering is **server-side**: `useNews` sends topic/source/q to `/api/news` and
the client never holds the full corpus. Every request is abortable and only the
last wins, since the search box fires per keystroke-batch. In dev, Vite proxies
`/api` to :8787, so the client makes same-origin requests and there is no CORS
handling in `src/`.

## Being a good citizen

This scrapes real publishers. Constraints that are deliberate, not incidental:
only publisher-provided RSS is read; each article page is fetched at most once
per 6 hours; concurrency is capped (`FEED_CONCURRENCY` 6, `ARTICLE_CONCURRENCY` 5);
and `USER_AGENT` identifies the bot honestly — several publishers' bot protection
serves an empty HTTP 202 to a spoofed desktop-Chrome UA while serving a declared
feed reader fine. Don't raise limits or spoof the UA to "fix" a fetch failure.

Every configurable value is optional and lives in `config.ts` with `.env.example`
documenting it; add new settings in both.
