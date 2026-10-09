type Kid = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | boolean | ((e: Event) => void)> = {}, ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') n.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false) n.setAttribute(k, v);
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}

export const $id = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
