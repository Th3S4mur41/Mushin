import { describe, it, expect } from 'vitest';
import { getHighestUpdateType, isUpdateLevelAllowed } from '../src/update-type';
import type { updatedDependency } from '../src/vendor/dependabot/update_metadata';

function makeDep(updateType: string): updatedDependency {
  return {
    dependencyName: 'test',
    dependencyType: 'direct:production',
    updateType,
    directory: '/',
    packageEcosystem: 'npm_and_yarn',
    targetBranch: 'main',
    prevVersion: '1.0.0',
    newVersion: '2.0.0',
    compatScore: 0,
    maintainerChanges: false,
    dependencyGroup: '',
    alertState: '',
    ghsaId: '',
    cvss: 0,
  };
}

describe('getHighestUpdateType', () => {
  it('returns undefined for empty list', () => {
    expect(getHighestUpdateType([])).toBeUndefined();
  });

  it('returns undefined when all update types are unknown', () => {
    expect(getHighestUpdateType([makeDep('')])).toBeUndefined();
    expect(getHighestUpdateType([makeDep('version-update:semver-unknown')])).toBeUndefined();
  });

  it('returns patch for a single patch dependency', () => {
    expect(getHighestUpdateType([makeDep('version-update:semver-patch')])).toBe('patch');
  });

  it('returns minor for a single minor dependency', () => {
    expect(getHighestUpdateType([makeDep('version-update:semver-minor')])).toBe('minor');
  });

  it('returns major for a single major dependency', () => {
    expect(getHighestUpdateType([makeDep('version-update:semver-major')])).toBe('major');
  });

  it('returns the highest type among mixed dependencies', () => {
    const deps = [
      makeDep('version-update:semver-patch'),
      makeDep('version-update:semver-minor'),
    ];
    expect(getHighestUpdateType(deps)).toBe('minor');
  });

  it('returns major when one of many is major', () => {
    const deps = [
      makeDep('version-update:semver-patch'),
      makeDep('version-update:semver-major'),
      makeDep('version-update:semver-minor'),
    ];
    expect(getHighestUpdateType(deps)).toBe('major');
  });
});

describe('isUpdateLevelAllowed', () => {
  it('patch is always allowed', () => {
    expect(isUpdateLevelAllowed('patch', 'patch')).toBe(true);
    expect(isUpdateLevelAllowed('patch', 'minor')).toBe(true);
    expect(isUpdateLevelAllowed('patch', 'major')).toBe(true);
  });

  it('minor is allowed only if allowed >= minor', () => {
    expect(isUpdateLevelAllowed('minor', 'patch')).toBe(false);
    expect(isUpdateLevelAllowed('minor', 'minor')).toBe(true);
    expect(isUpdateLevelAllowed('minor', 'major')).toBe(true);
  });

  it('major is only allowed if allowed = major', () => {
    expect(isUpdateLevelAllowed('major', 'patch')).toBe(false);
    expect(isUpdateLevelAllowed('major', 'minor')).toBe(false);
    expect(isUpdateLevelAllowed('major', 'major')).toBe(true);
  });
});
