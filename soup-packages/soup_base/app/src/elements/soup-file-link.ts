import { download, h } from '@soup/sdk';

import { BlockElement, decodeBase64 } from '../dom';

interface FileData {
  filename: string;
  mime: string;
  base64: string;
}

function size(base64: string): string {
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** <soup-file-link>: `data` = {filename, mime, base64}; the button saves the file. */
export class SoupFileLink extends BlockElement<FileData> {
  protected draw(data: FileData | undefined): Node[] {
    if (!data) return [];
    const button = h('button', {
      text: `Download ${data.filename}`,
      attrs: { type: 'button' },
      on: { click: () => download(data.filename, data.mime, decodeBase64(data.base64)) }
    });
    return [button, h('span', { className: 'muted', text: ` ${size(data.base64)}` })];
  }
}
