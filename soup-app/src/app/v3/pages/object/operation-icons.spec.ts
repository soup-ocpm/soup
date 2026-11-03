import { groupIcon } from './operation-icons';

describe('groupIcon', () => {
  it('finds the icon of a known group, whatever the case', () => {
    expect(groupIcon('ANALISI')).toBe('bi-funnel');
    expect(groupIcon('EKG')).toBe('bi-diagram-3');
    expect(groupIcon('Tabelle')).toBe('bi-table');
  });

  it('falls back to a gear for any other group', () => {
    expect(groupIcon('Altro')).toBe('bi-gear');
    expect(groupIcon('')).toBe('bi-gear');
  });
});
