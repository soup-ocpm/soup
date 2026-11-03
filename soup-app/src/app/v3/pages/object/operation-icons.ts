/**
 * The Bootstrap icon of a group of operations ("Analisi", "EKG", ...): the
 * first keyword the group's name contains (case-insensitive), else a gear.
 * Only the look: any group works without an entry.
 */
const GROUP_ICONS: readonly [string, string][] = [
  ['analisi', 'bi-funnel'],
  ['ekg', 'bi-diagram-3'],
  ['grafo', 'bi-diagram-3'],
  ['ocel', 'bi-boxes'],
  ['tabell', 'bi-table'],
  ['table', 'bi-table'],
  ['test', 'bi-file-text'],
  ['text', 'bi-file-text'],
  ['report', 'bi-bar-chart'],
  ['statistic', 'bi-bar-chart'],
  ['templat', 'bi-puzzle']
];

const DEFAULT_ICON = 'bi-gear';

export function groupIcon(group: string): string {
  const name = group.toLowerCase();
  return GROUP_ICONS.find(([keyword]) => name.includes(keyword))?.[1] ?? DEFAULT_ICON;
}
