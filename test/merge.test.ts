import { describe, it, expect, vi } from 'vitest';
import { evaluatePullRequest } from '../src/merge';
import type { GitHubClient } from '../src/github/api';
import type { GitHubPR } from '../src/github/types';

vi.mock('fetch-metadata/src/dependabot/update_metadata', () => ({
  parse: vi.fn().mockResolvedValue([
    {
      dependencyName: 'dep',
      dependencyType: 'direct:production',
      updateType: 'version-update:semver-patch',
      directory: '/',
      packageEcosystem: 'npm_and_yarn',
      targetBranch: 'main',
      prevVersion: '1.0.0',
      newVersion: '1.0.1',
      compatScore: 0,
      maintainerChanges: false,
      dependencyGroup: '',
      alertState: '',
      ghsaId: '',
      cvss: 0,
    },
  ]),
}));

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    number: 58,
    title: 'Bump dep from 1.0.0 to 1.0.1',
    body: null,
    state: 'open',
    draft: false,
    user: { login: 'dependabot[bot]' },
    head: { ref: 'dependabot/npm_and_yarn/dep-1.0.1', sha: 'abc123' },
    base: {
      ref: 'main',
      repo: {
        owner: { login: 'owner' },
        name: 'repo',
        default_branch: 'main',
      },
    },
    labels: [],
    mergeable: true,
    mergeable_state: 'clean',
    ...overrides,
  };
}

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getPR: vi.fn(),
    getPRCommits: vi.fn().mockResolvedValue([]),
    getPRComments: vi.fn().mockResolvedValue([]),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    getCheckRuns: vi.fn().mockResolvedValue([]),
    getCommitStatuses: vi.fn().mockResolvedValue([]),
    mergePR: vi.fn().mockResolvedValue(true),
    getRepoCustomProperties: vi.fn().mockResolvedValue([]),
    getFileContent: vi.fn().mockResolvedValue(null),
    getAppLogin: vi.fn().mockResolvedValue('mushin[bot]'),
    ...overrides,
  };
}

describe('evaluatePullRequest readiness', () => {
  it('merges when check runs are neutral and there are no legacy commit statuses', async () => {
    const client = makeClient({
      getCheckRuns: vi.fn().mockResolvedValue([
        { name: 'CodeQL', status: 'completed', conclusion: 'neutral' },
        { name: 'test', status: 'completed', conclusion: 'success' },
      ]),
    });

    await evaluatePullRequest(
      client,
      { owner: { login: 'owner' }, name: 'repo' },
      makePR() as unknown as Record<string, unknown>,
    );

    expect(client.mergePR).toHaveBeenCalledWith('owner', 'repo', 58, 'squash', 'abc123');
  });

  it('does not merge when a legacy commit status is pending', async () => {
    const client = makeClient({
      getCommitStatuses: vi.fn().mockResolvedValue([
        { context: 'external-ci', state: 'pending' },
      ]),
    });

    await evaluatePullRequest(
      client,
      { owner: { login: 'owner' }, name: 'repo' },
      makePR() as unknown as Record<string, unknown>,
    );

    expect(client.mergePR).not.toHaveBeenCalled();
  });

  it('does not merge when a check run is still in progress', async () => {
    const client = makeClient({
      getCheckRuns: vi.fn().mockResolvedValue([
        { name: 'test', status: 'in_progress', conclusion: null },
      ]),
    });

    await evaluatePullRequest(
      client,
      { owner: { login: 'owner' }, name: 'repo' },
      makePR() as unknown as Record<string, unknown>,
    );

    expect(client.mergePR).not.toHaveBeenCalled();
  });
});