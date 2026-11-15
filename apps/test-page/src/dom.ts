type Child = Node | string | null | undefined | false;

/**
 * Creates an element. Text goes in as text nodes, never as HTML, so a Transcript or an expected
 * text can never inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
