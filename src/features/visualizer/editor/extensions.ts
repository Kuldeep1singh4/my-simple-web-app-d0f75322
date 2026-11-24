import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import type { Language } from "../types";

const languageCache = new Map<Language, Extension>();

/**
 * Lazy-loads CodeMirror language parsers on demand.
 * This prevents bundling all Lezer language grammars (JS, Python, Java, C++)
 * into the initial client bundle, dropping initial JS size under 250 KB.
 */
export async function loadLanguageExtension(lang: Language): Promise<Extension> {
  const cached = languageCache.get(lang);
  if (cached) return cached;

  let ext: Extension;
  switch (lang) {
    case "python": {
      const { python } = await import("@codemirror/lang-python");
      ext = python();
      break;
    }
    case "java": {
      const { java } = await import("@codemirror/lang-java");
      ext = java();
      break;
    }
    case "c":
    case "cpp": {
      const { cpp } = await import("@codemirror/lang-cpp");
      ext = cpp();
      break;
    }
    default: {
      const { javascript } = await import("@codemirror/lang-javascript");
      ext = javascript();
      break;
    }
  }

  languageCache.set(lang, ext);
  return ext;
}

export const setActiveLine = StateEffect.define<number | null>();

export const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setActiveLine)) {
        if (e.value == null) return Decoration.none;
        const lineNum = Math.max(1, Math.min(e.value, tr.state.doc.lines));
        const line = tr.state.doc.line(lineNum);
        return Decoration.set([
          Decoration.line({
            class: "cm-active-trace-line",
            attributes: { "data-active-trace-line": String(lineNum) },
          }).range(line.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const lineTheme = EditorView.baseTheme({
  ".cm-active-trace-line": {
    backgroundColor: "rgba(34, 211, 238, 0.16)",
    boxShadow: "inset 4px 0 0 0 #22d3ee",
    transition: "background-color 200ms ease",
  },
});
