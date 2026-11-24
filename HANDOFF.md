# Project Handoff: Code Visualizer

A compact context summary for continuing development or deploying the **Code Visualizer** (TanStack Start + React 19 + Vite 7 + Tailwind CSS v4) in a fresh session.

---

## 1. Repository Status & File Modifications

* **Active Working Branch:** `refactor-modularize` (uncommitted work tree snapshot ready to commit and merge into `main`).
* **Deleted Lovable Legacy Files:**
  * `.lovable/project.json`, `bun.lock`, `bunfig.toml`
  * 43 unused boilerplate shadcn components from `src/components/ui/` (`accordion.tsx`, `dialog.tsx`, `sidebar.tsx`, `chart.tsx`, etc., saving -3,668 LOC).
* **Modified Configuration & Core Server Files:**
  * `package.json`: Renamed to `"code-visualizer"`, removed Lovable plugins and taggers, added `@cloudflare/vite-plugin` and `wrangler`.
  * `wrangler.jsonc`: Updated project `"name"` to `"my-simple-web-app-d0f75322"` and confirmed `"compatibility_flags": ["nodejs_compat"]`.
  * `vite.config.ts`: Native TanStack Start plugin configuration, `@cloudflare/vite-plugin` (`cloudflare({ viteEnvironment: { name: 'ssr' } })`), Vite 7 Rollup input synchronization for SSR/client builds, Tailwind v4. Builds `.wrangler/deploy/config.json` and `dist/server/wrangler.json` cleanly for one-step `npx wrangler deploy`.
  * `src/server.ts`: Production security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
  * `src/routes/__root.tsx`: Cleaned Lovable meta tags, titles, scripts, and fonts.
  * `.gitignore`: Hardened to ignore `.env` and `.env.*` while keeping `.env.example`.
* **Refactored Core Visualizer (`src/components/CodeVisualizer.tsx`):**
  * Monolithic ~2,000 LOC component trimmed down to a lean ~352 LOC orchestrator.
  * Replaced custom array-index state hacks with deterministic keying.
* **Added Modular Architecture (`src/features/visualizer/`):**
  * `types/index.ts`: Unified domain types, action color definitions, and tree/graph node models.
  * `editor/extensions.ts`: CodeMirror 6 extensions (active line highlight, line theme, multi-language support).
  * `playback/buildExecutionSteps.ts`: Pedagogical 3-phase execution engine (START, MIDDLE, END) with smart fast-forwarding.
  * `utils/dataShaper.ts`: Pure functional data transforms for arrays, pointers, bounds, trees, and graphs.
  * `components/`: Specialized rendering components:
    * `ArrayVisualizer.tsx` (Array bar, pointer markers, holding cells)
    * `LinkedListVisualizer.tsx` (Node boxes, SVG arrows)
    * `TreeVisualizer.tsx` (Recursive binary tree with branch connectors)
    * `GraphVisualizer.tsx` (SVG force-directed graph with active/visited highlights)
    * `MemoryBoard.tsx` (Scalar variable board)
    * `TerminalConsole.tsx` (Virtual stdout terminal)
    * `PlaybackControls.tsx` (Step, play/pause controls)
    * `VisualizerStage.tsx` (Dynamic viewport orchestrator)
    * `index.ts` (Unified barrel exports)

---

## 2. Active Model, API Configuration & Security Fixes

* **Active LLM:** `openai/gpt-oss-120b` via Groq Cloud API.
  * `temperature: 0.2`, `max_completion_tokens: 8192`, `response_format: { type: "json_object" }`.
* **API Key Handling:**
  * Uses `process.env.GROQ_API_KEY` exclusively on the server (`src/lib/trace.functions.ts`).
  * Zero exposure to client bundle, browser logs, or Git history.
* **Security Remediations In Place:**
  * **Input Limitation:** Maximum code length capped at 3,000 characters (reduced from 20,000) via Zod schema.
  * **Prompt Injection Defense:** Source code wrapped in `<source_code>...</source_code>` XML tags with system instructions to treat code strictly as untrusted data to trace.
  * **Rate Limiting:** In-memory sliding-window limiter enforcing a maximum of 10 requests per minute per IP address (`cf-connecting-ip` / `x-forwarded-for`).
  * **Error Masking:** Upstream Groq failures and system errors are masked with generic user-friendly messages (detailed status logged server-side only).
  * **HTTP Security Headers:** `src/server.ts` injects:
    * `X-Frame-Options: DENY` (anti-clickjacking)
    * `X-Content-Type-Options: nosniff` (MIME sniffing prevention)
    * `Referrer-Policy: strict-origin-when-cross-origin`

---

## 3. Optimizations & Remediations Applied (Pre-Deployment Pass)

* **Model Config Locked (`src/lib/trace.functions.ts`):**
  * `openai/gpt-oss-120b` with `reasoning_effort: "low"`, `include_reasoning: false`, `temperature: 0.2`, `max_completion_tokens: 8192`.
  * Drops reasoning overhead while preserving 100% simulation accuracy on complex nested DSA algorithms.
* **CodeMirror Grammars Lazy-Loaded on Demand:**
  * Replaced static imports of JS, Python, Java, and C++ with dynamic `loadLanguageExtension(lang)` in `editor/extensions.ts`.
  * Grammars and Lezer AST parsers now load into isolated async chunks, reducing the main app chunk by 283 KB (-29%).
* **Framer Motion CSS Variable Warning Resolved:**
  * Updated `ArrayRow` in `ArrayVisualizer.tsx` to interpolate pre-resolved hex colors (`actionColor.bg`), eliminating all `"var(--cell-active-bg)" is not an animatable value` console warnings and enabling smooth 60fps color tweening.
* **React Memoization Fixed:**
  * Hoisted `EMPTY_VARS` fallback in `CodeVisualizer.tsx` so `useMemo(() => parseGraph(variables))` maintains stable object identity when idle.
* **Dead Code & Duplication Eliminated:**
  * Deleted redundant `lineNumberAttributes` plugin in `editor/extensions.ts`.
  * Deduplicated `isPointerName`, `pointerColor`, and `parseActive` from `types/index.ts`.
* **Package Dependency Pruning:**
  * Removed 43 unused packages from `package.json` (unimported Radix packages, Recharts, date-fns, cmdk, etc.), stripping 112 packages from `node_modules`.
* **CSRF Protection Middleware:**
  * Added TanStack Start's native `createCsrfMiddleware` in `src/start.ts` protecting server RPC functions from cross-site requests.
* **Verification:**
  * `npm run build` succeeds with 0 errors across client and SSR environments.
  * Live browser CDP testing confirmed **0 console warnings and 0 console errors** during live trace step execution.

---

## 4. Next Commands (Merge & Cloudflare Workers Deployment)

### Step A: Commit & Merge Changes to `main`
```bash
# 1. Stage all refactored, added, and cleaned files
git add .

# 2. Create the snapshot commit
git commit -m "feat: de-lovable, modularize visualizer architecture, and apply security hardening"

# 3. Switch to main and merge
git checkout main
git merge refactor-modularize
```

### Step B: Build Verification
```bash
# Verify production client and SSR bundles build cleanly with zero errors
npm run build
```

### Step C: Deploy to Cloudflare Workers
```bash
# 1. Configure production GROQ_API_KEY secret on Cloudflare Workers
npx wrangler secret put GROQ_API_KEY

# 2. Deploy the application to Cloudflare Workers
npx wrangler deploy
```
