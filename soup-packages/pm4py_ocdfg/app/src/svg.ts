/** Make Soup's graph drawing portable outside the page that rendered it. */
export function standaloneSvg(svg: string, fontFamily = 'system-ui, sans-serif', fontSize = '14px'): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Invalid SVG.');
  const ids = new Set(Array.from(doc.querySelectorAll('[id]'), node => node.id));
  const attributes = ['marker-start', 'marker-mid', 'marker-end', 'clip-path', 'mask', 'filter', 'fill', 'stroke'];
  for (const element of doc.querySelectorAll('*')) for (const name of attributes) {
    const value = element.getAttribute(name) ?? '';
    const match = /^url\(["']?(.*?)["']?\)$/.exec(value);
    if (!match) continue;
    const id = match[1].slice(match[1].lastIndexOf('#') + 1);
    if (ids.has(id)) element.setAttribute(name, `url(#${id})`);
  }
  intrinsicSize(root);
  root.setAttribute('font-family', fontFamily);
  root.setAttribute('font-size', fontSize);
  return new XMLSerializer().serializeToString(root);
}

function intrinsicSize(root: Element): void {
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    root.setAttribute('width', String(Math.ceil(viewBox[2])));
    root.setAttribute('height', String(Math.ceil(viewBox[3])));
  }
}
