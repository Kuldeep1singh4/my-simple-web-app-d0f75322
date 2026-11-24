# Code Visualizer

An interactive, AI-powered algorithm and code execution visualizer built with **TanStack Start**, **React 19**, **Vite 7**, and **Tailwind CSS v4**.

Code Visualizer allows students, developers, and educators to trace code step by step across multiple programming languages—inspecting memory variables, tracking active loops, highlighting sub-array bounds, and rendering animated data structures (Arrays, Linked Lists, Binary Trees, and Force-Directed Graphs) in real time.

---

## Features

- **Multi-Language Support**: Interactive tracing for JavaScript, Python, Java, C, and C++.
- **Compiler-Grade AI Tracing**: Powered by Groq Cloud (`llama-3.3-70b-versatile`) with mathematical verification, smart loop fast-forwarding, and Big-O complexity analysis.
- **Dynamic Physics Visualizers**:
  - **Arrays**: 3-pass persistent element identity tracking with Framer Motion layout animations, colliding pointer stacks, and bounds scoping.
  - **Linked Lists**: Segmented memory node views with SVG pointer arrows and `null` terminator detection.
  - **Binary Trees**: Auto-scaling recursive hierarchy with dynamic SVG connecting branches.
  - **Graphs**: 2D real-time force-directed physics simulation applying Coulomb electrostatic repulsion and Hooke spring attraction.
  - **Memory Board**: Visual scalar cards highlighting read, write, compare, and swap actions.
- **Embedded CodeMirror 6**: Code editor featuring active line tracking, programmatic auto-scrolling, and syntax highlighting.
- **Virtual Terminal Console**: Standard output viewer collecting program prints (`console.log`, `print`, `printf`, `System.out.println`).
- **SSR & Edge Ready**: Full-stack architecture powered by TanStack Start and Nitro/Cloudflare Workers compatibility.

---

## Getting Started

### Prerequisites

- **Node.js** >= 20.x
- **npm** (configured with `.npmrc` for peer dependency resolution)
- **Groq API Key**: Obtain a free key from [console.groq.com](https://console.groq.com)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory:
   ```env
   GROQ_API_KEY=gsk_your_groq_api_key_here
   ```

3. Launch the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at [http://localhost:8080](http://localhost:8080).

---

## Production Build

To build the client and server bundles:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## Project Structure

```
├── .agents/                    # Model Context Protocol configuration
├── public/                     # Static assets and SVG favicon
├── src/
│   ├── server.ts               # SSR request fetch handler and error boundary isolation
│   ├── start.ts                # TanStack Start client hydration entry
│   ├── router.tsx              # TanStack Router instance creation
│   ├── routes/
│   │   ├── __root.tsx          # Root shell layout, meta tags, and global error component
│   │   └── index.tsx           # Home route mounting CodeVisualizer
│   ├── components/
│   │   ├── CodeVisualizer.tsx  # Master orchestrator component
│   │   └── ui/                 # Reusable UI primitive components (Radix UI)
│   ├── features/
│   │   └── visualizer/
│   │       ├── types/          # Visualizer domain and trace action types
│   │       ├── editor/         # CodeMirror 6 active line & DOM extensions
│   │       ├── playback/       # Pedagogical 3-phase execution engine
│   │       └── components/     # Modular visualizers (Array, Tree, Graph, etc.)
│   └── lib/
│       ├── trace.functions.ts  # TanStack Start server RPC calling Groq API
│       ├── error-capture.ts    # Unhandled SSR error interceptor
│       └── error-page.ts       # Fallback error HTML generator
└── vite.config.ts              # Vite + TanStack Start + Tailwind CSS configuration
```

---

## License

MIT

