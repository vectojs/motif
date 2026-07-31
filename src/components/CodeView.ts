import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Warm-white editor theme keyed to the Motif shell palette (motif.css :root).
const motifLight = EditorView.theme(
  {
    '&': { color: '#3d3529', backgroundColor: 'transparent' },
    '.cm-content': { caretColor: '#d97757' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#d97757' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(217, 119, 87, 0.18)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#a89e8c',
      border: 'none',
    },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(61, 53, 41, 0.04)' },
    '.cm-activeLine': { backgroundColor: 'rgba(61, 53, 41, 0.03)' },
  },
  { dark: false },
);

const motifHighlight = HighlightStyle.define([
  { tag: t.comment, color: '#a89e8c', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: '#8a5a3d' },
  { tag: [t.number, t.bool, t.null], color: '#b45309' },
  { tag: [t.keyword, t.modifier], color: '#c2410c' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: '#9a3412',
  },
  { tag: [t.propertyName, t.attributeName], color: '#6b6254' },
  { tag: [t.typeName, t.tagName, t.className], color: '#7c2d12' },
  { tag: [t.operator, t.punctuation], color: '#6b6254' },
  { tag: t.variableName, color: '#3d3529' },
]);

type SourceKind = 'module' | 'html';

/**
 * Upgrades the server-rendered <pre data-code-source> blocks into read-only
 * CodeMirror 6 editors. The <pre> text is the seed (exact bytes the iframe
 * runs), so the panel keeps working without JS and shows identical content.
 */
function initCodeView(): void {
  const panel = document.querySelector<HTMLElement>('.code-panel');
  if (!panel) return;

  const bodies = panel.querySelectorAll<HTMLElement>('[data-code-source]');
  const sources = new Map<SourceKind, string>();
  const views = new Map<SourceKind, EditorView>();

  for (const pre of bodies) {
    const kind = pre.dataset.codeSource as SourceKind;
    const code = pre.textContent ?? '';
    sources.set(kind, code);
    const host = document.createElement('div');
    host.className = 'code-editor';
    host.dataset.codeEditor = kind;
    if (!pre.classList.contains('active')) host.hidden = true;
    pre.replaceWith(host);
    views.set(
      kind,
      new EditorView({
        parent: host,
        state: EditorState.create({
          doc: code,
          extensions: [
            lineNumbers(),
            kind === 'module' ? javascript() : html(),
            motifLight,
            syntaxHighlighting(motifHighlight),
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ],
        }),
      }),
    );
  }

  let active: SourceKind = sources.has('module') ? 'module' : 'html';

  for (const tab of panel.querySelectorAll<HTMLButtonElement>('[data-code-tab]')) {
    tab.addEventListener('click', () => {
      const kind = tab.dataset.codeTab as SourceKind;
      active = kind;
      for (const t of panel.querySelectorAll<HTMLButtonElement>('[data-code-tab]')) {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      }
      for (const [k, host] of views) (host.dom.parentElement as HTMLElement).hidden = k !== kind;
    });
  }

  const copyButton = panel.querySelector<HTMLButtonElement>('[data-copy]');
  copyButton?.addEventListener('click', async () => {
    const text = sources.get(active) ?? '';
    try {
      await navigator.clipboard.writeText(text);
      const prev = copyButton.textContent;
      copyButton.textContent = 'Copied';
      copyButton.classList.add('copied');
      setTimeout(() => {
        copyButton.textContent = prev;
        copyButton.classList.remove('copied');
      }, 1400);
    } catch {
      /* clipboard blocked (e.g. insecure context) — leave the label unchanged */
    }
  });
}

initCodeView();
