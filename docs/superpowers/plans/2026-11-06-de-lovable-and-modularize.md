# Migration & Modularization Plan: De-legacy & Refactor Code Visualizer

This plan details the complete migration away from legacy configuration, metadata, and dependencies to standard native Antigravity architecture, followed by the modularization of the ~2,000 LOC `CodeVisualizer.tsx` component.

---

## 1. File Structure Map

### Files to Remove
- `.legacy/` directory and `.legacy/project.json`
- `bun.lock` (lockfile from prior environment; project uses npm with `.npmrc`)

### Files to Modify
- `package.json`: Rename project to `"code-visualizer"`, remove `@legacy.dev/vite-tanstack-config` and any `legacy-tagger` references.
- `bunfig.toml`: Scrub legacy reference or remove if bun is unused.
- `vite.config.ts`: Replace `@legacy.dev/vite-tanstack-config` with standard `defineConfig` from `vite`, `@tanstack/react-start/plugin/vite` (`tanstackStart`), `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, and `nitro/vite` (or `@cloudflare/vite-plugin`) ensuring `server: { entry: "server" }`.
- `src/routes/__root.tsx`: Clean out all legacy meta tags, titles, author, and OpenGraph URLs. Update title to `"Code Visualizer - Interactive Algorithm & Code Execution Tracing"`.
- `src/components/CodeVisualizer.tsx`: Refactor into a clean orchestrator importing modularized components.
- `README.md`: Professional project documentation highlighting the TanStack Start + Groq AI tracing engine.

### Files to Create
- `public/favicon.svg`: Neutral code-bracket SVG icon.
- `src/features/visualizer/types/index.ts`: Visualizer domain types (`TraceStep`, `Complexity`, `StructureType`, `ActionType`, `ArrayItem`, etc.).
- `src/features/visualizer/editor/extensions.ts`: CodeMirror 6 active line highlights, decorations, and DOM line tracking plugins.
- `src/features/visualizer/playback/buildExecutionSteps.ts`: 3-phase pedagogical execution engine (`START`, `MIDDLE`, `END` phases and speed multipliers).
- `src/features/visualizer/components/ArrayVisualizer.tsx`: `ArrayRow`, `HoldingCells`, pointer stacking, and sub-array bounds highlighting.
- `src/features/visualizer/components/LinkedListVisualizer.tsx`: `LinkedListView`, node memory cells, and SVG pointer arrow rendering.
- `src/features/visualizer/components/TreeVisualizer.tsx`: `TreeView`, `TreeNodeView`, auto-scaling, and dynamic SVG branch paths.
- `src/features/visualizer/components/GraphVisualizer.tsx`: 2D force-directed layout simulation (Coulomb electrostatic repulsion and Hooke spring dynamics).
- `src/features/visualizer/components/MemoryBoard.tsx`: Scalar variable memory cards with semantic action coloring.
- `src/features/visualizer/components/TerminalConsole.tsx`: Virtual terminal output console with auto-scroll and unread tracking.

---

## 2. Tasks

### Task 1: Purge legacy Dependencies, Metadata, and Configs
1. Update `package.json`:
   - Change `"name": "tanstack_start_ts"` / `"my-simple-web-app-d0f75322"` to `"code-visualizer"`.
   - Remove `"@legacy.dev/vite-tanstack-config": "2.3.2"`.
2. Delete `.legacy` directory.
3. Clean `bunfig.toml` and remove stale lockfile if needed.
4. Create `public/favicon.svg` with a modern SVG code bracket icon.
5. Update `src/routes/__root.tsx` to scrub legacy meta tags and set title to "Code Visualizer - Interactive Algorithm & Code Execution Tracing".
6. Rewrite `README.md` to be professional and focused on the Code Visualizer architecture.

### Task 2: Standardize `vite.config.ts` for Native TanStack Start & Nitro/Cloudflare
1. Reconfigure `vite.config.ts` using:
   - `tanstackStart({ server: { entry: "server" } })` from `@tanstack/react-start/plugin/vite`
   - `nitro({ defaultPreset: "cloudflare-module", preset: "cloudflare-module" })` from `nitro/vite`
   - `viteReact()` from `@vitejs/plugin-react`
   - `tailwindcss()` from `@tailwindcss/vite`
   - `tsconfigPaths()` from `vite-tsconfig-paths`
   - Alias `@` to `src`
2. Test Vite configuration with `npm run build` and `npm run dev` to verify clean compilation.

### Task 3: Extract Visualizer Types, Editor Extensions, and Playback Logic
1. Create `src/features/visualizer/types/index.ts`.
2. Create `src/features/visualizer/editor/extensions.ts` with CodeMirror 6 custom extensions (`setActiveLine`, `activeLineField`, `lineNumberAttributes`, `lineTheme`, `languageExtension`).
3. Create `src/features/visualizer/playback/buildExecutionSteps.ts` with 3-phase pedagogical execution engine.

### Task 4: Extract Specialized Visualizer Components
1. Extract `ArrayVisualizer.tsx` (`ArrayRow`, `HoldingCells`).
2. Extract `LinkedListVisualizer.tsx` (`LinkedListView`, node parsing).
3. Extract `TreeVisualizer.tsx` (`TreeView`, `TreeNodeView`).
4. Extract `GraphVisualizer.tsx` (`GraphVisualizer`, physics simulation, force-directed graph calculation).
5. Extract `MemoryBoard.tsx` (primitive memory cells).
6. Extract `TerminalConsole.tsx` (stdout console).

### Task 5: Assemble Lean `CodeVisualizer.tsx` Orchestrator
1. Refactor `src/components/CodeVisualizer.tsx` to import the modularized components, editor extensions, and playback engine.
2. Ensure identical state management, animations, and Groq RPC integration.

### Task 6: Global Audit and Verification
1. Run case-insensitive grep across the codebase to ensure 0 remaining instances of "legacy".
2. Run `npm run build` to confirm TypeScript and Vite compile with 0 errors.
3. Start dev server and verify HTTP 200 OK.
