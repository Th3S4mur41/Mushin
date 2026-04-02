import { describe, it, expect, vi } from 'vitest';
import { resolveConfig } from '../src/config/index';
import { DEFAULT_CONFIG } from '../src/config/types';
import type { GitHubClient } from '../src/github/api';

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getPR: vi.fn(),
    getPRCommits: vi.fn(),
    getPRComments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    getCheckRuns: vi.fn(),
    getCombinedStatus: vi.fn(),
    mergePR: vi.fn(),
    getRepoCustomProperties: vi.fn().mockResolvedValue([]),
    getFileContent: vi.fn().mockResolvedValue(null),
    getAppLogin: vi.fn(),
    ...overrides,
  };
}

describe('resolveConfig', () => {
  it('returns defaults when no config sources available', async () => {
    const client = makeClient();
    const config = await resolveConfig(client, 'owner', 'repo', []);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('reads highest_version_to_merge from custom properties', async () => {
    const client = makeClient({
      getRepoCustomProperties: vi.fn().mockResolvedValue([
        { property_name: 'mushin_highest_version_to_merge', value: 'major' },
      ]),
    });
    const config = await resolveConfig(client, 'owner', 'repo', []);
    expect(config.highestVersionToMerge).toBe('major');
  });

  it('reads merge_unknown from custom properties', async () => {
    const client = makeClient({
      getRepoCustomProperties: vi.fn().mockResolvedValue([
        { property_name: 'mushin_merge_unknown', value: 'true' },
      ]),
    });
    const config = await resolveConfig(client, 'owner', 'repo', []);
    expect(config.mergeUnknown).toBe(true);
  });

  it('reads config from mushin.yml file', async () => {
    const client = makeClient({
      getFileContent: vi.fn().mockResolvedValue('highest_version_to_merge: major\nmerge_unknown: true'),
    });
    const config = await resolveConfig(client, 'owner', 'repo', []);
    expect(config.highestVersionToMerge).toBe('major');
    expect(config.mergeUnknown).toBe(true);
  });

  it('labels override repo YAML and custom properties', async () => {
    const client = makeClient({
      getRepoCustomProperties: vi.fn().mockResolvedValue([
        { property_name: 'mushin_highest_version_to_merge', value: 'patch' },
      ]),
      getFileContent: vi.fn().mockResolvedValue('highest_version_to_merge: minor'),
    });
    const config = await resolveConfig(client, 'owner', 'repo', [
      { name: 'mushin:merge-major' },
    ]);
    expect(config.highestVersionToMerge).toBe('major');
  });

  it('mushin:skip label sets skip=true', async () => {
    const client = makeClient();
    const config = await resolveConfig(client, 'owner', 'repo', [{ name: 'mushin:skip' }]);
    expect(config.skip).toBe(true);
  });

  it('mushin:merge-unknown label sets mergeUnknown=true', async () => {
    const client = makeClient();
    const config = await resolveConfig(client, 'owner', 'repo', [{ name: 'mushin:merge-unknown' }]);
    expect(config.mergeUnknown).toBe(true);
  });

  it('ignores invalid values in custom properties', async () => {
    const client = makeClient({
      getRepoCustomProperties: vi.fn().mockResolvedValue([
        { property_name: 'mushin_highest_version_to_merge', value: 'invalid' },
      ]),
    });
    const config = await resolveConfig(client, 'owner', 'repo', []);
    expect(config.highestVersionToMerge).toBe(DEFAULT_CONFIG.highestVersionToMerge);
  });

  it('repo YAML overrides custom properties', async () => {
    const client = makeClient({
      getRepoCustomProperties: vi.fn().mockResolvedValue([
        { property_name: 'mushin_highest_version_to_merge', value: 'patch' },
      ]),
      getFileContent: vi.fn().mockResolvedValue('highest_version_to_merge: major'),
    });
    const config = await resolveConfig(client, 'owner', 'repo', []);
    expect(config.highestVersionToMerge).toBe('major');
  });
});
