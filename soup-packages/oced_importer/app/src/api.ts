import { errorMessage } from '@soup/sdk';

import type { Source } from './workflow';

const MODULE_URL = import.meta.url;
const INSPECT_URL = new URL('/api/v3/imports/inspect', MODULE_URL).href;

/** Additional object CSVs use the same inspection API as the host's event upload. */
export async function inspect(file: File): Promise<Source> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('importer_id', 'oced_importer.csv');
  const response = await fetch(INSPECT_URL, { method: 'POST', headers: { 'X-Soup-Client': '1' }, body: form });
  const envelope = (await response.json()) as {
    message: string;
    response_data: { fields?: { name: string; default: Source }[] };
  };
  if (!response.ok) throw new Error(errorMessage(envelope) || `CSV inspection failed (${response.status})`, { cause: envelope });
  const source = envelope.response_data.fields?.find((field) => field.name === 'source')?.default;
  if (!source) throw new Error('CSV inspection did not return table information.');
  return source;
}
