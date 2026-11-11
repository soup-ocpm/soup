import { groupIcon } from './operation-icons';

describe('groupIcon', () => {
  it('finds the icon of a known group, whatever the case', () => {
    expect(groupIcon('ANALYSIS')).toBe('bi-funnel');
    expect(groupIcon('EKG')).toBe('bi-diagram-3');
    expect(groupIcon('Tables')).toBe('bi-table');
  });

  it('falls back to a gear for any other group', () => {
    expect(groupIcon('Other')).toBe('bi-gear');
    expect(groupIcon('')).toBe('bi-gear');
  });
});
