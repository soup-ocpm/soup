/**
 * Small DOM helpers for the elements of the packages (they used to be
 * copied into the app/ of every package). Text coming from data is always
 * set with textContent, never as markup.
 */

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

export type Child = Node | string | null | undefined;

function applyOptions(element: HTMLElement, options: ElementOptions): void {
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) element.setAttribute(name, value);
  for (const [name, listener] of Object.entries(options.on ?? {})) {
    if (listener) element.addEventListener(name, listener);
  }
}

/** A new element with these options and children (null and undefined are skipped). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  applyOptions(element, options);
  element.append(...children.filter((child): child is Node | string => child !== null && child !== undefined));
  return element;
}

/** Understand both SOUP's API envelope and native Error objects. */
function errorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function errorLocation(details: Record<string, unknown>): string {
  return [['phase', 'Phase'], ['file', 'File'], ['field', 'Field'],
    ['column', 'Column'], ['row', 'Data row'], ['line', 'Line']].flatMap(([key, label]) => {
    const value = details[key];
    return (typeof value === 'string' && value) || typeof value === 'number' ? [`${label}: ${value}`] : [];
  }).join(' · ');
}

/** Preserve safe import phase/location details through the API boundary. */
export function errorMessage(error: unknown): string {
  const info = errorRecord(error);
  const body = errorRecord(info['error']);
  const message = String(body['message'] ?? info['message'] ?? error);
  const details = errorRecord(info['responseData'] ?? info['response_data'] ?? info['details'] ?? body['response_data']);
  const hint = typeof details['hint'] === 'string' && !message.includes(details['hint']) ? details['hint'] : '';
  return [errorLocation(details), message, hint].filter(Boolean).join('\n');
}
