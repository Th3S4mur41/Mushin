import { parse } from 'fetch-metadata/src/dependabot/update_metadata';
import { getHighestUpdateType, isUpdateLevelAllowed } from './update-type';
import { resolveConfig } from './config/index';
import { upsertStatusComment, buildUnknownTypeMessage } from './comment';
import type { GitHubClient } from './github/api';
import type { GitHubCommitStatus, GitHubPR } from './github/types';

const DEPENDABOT_LOGIN = 'dependabot[bot]';

/**
 * Determines whether all required checks for a PR head SHA are passing.
 * Returns true only if there are no failed/pending check runs and no failed/pending legacy commit statuses.
 */
async function areChecksPassing(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
): Promise<boolean> {
  const [checkRuns, commitStatuses] = await Promise.all([
    client.getCheckRuns(owner, repo, sha),
    client.getCommitStatuses(owner, repo, sha),
  ]);

  // If there are any incomplete or failed check runs, not ready
  for (const run of checkRuns) {
    if (run.status !== 'completed') return false;
    if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled') {
      return false;
    }
  }

  if (hasBlockingCommitStatus(commitStatuses)) return false;

  return true;
}

function hasBlockingCommitStatus(statuses: GitHubCommitStatus[]): boolean {
  return statuses.some((status) => {
    return status.state === 'failure' || status.state === 'error' || status.state === 'pending';
  });
}

/**
 * Main merge evaluation for a Dependabot PR.
 */
export async function evaluatePullRequest(
  client: GitHubClient,
  repo: Record<string, unknown>,
  prData: Record<string, unknown>,
): Promise<void> {
  const owner = (repo.owner as { login: string }).login;
  const repoName = repo.name as string;
  const pr = prData as unknown as GitHubPR;

  // Only act on open, non-draft PRs by dependabot
  if (pr.state !== 'open') return;
  if (pr.draft) return;
  if (pr.user.login !== DEPENDABOT_LOGIN) return;

  const config = await resolveConfig(client, owner, repoName, pr.labels);

  // Label override: skip
  if (config.skip) {
    console.log(`[mushin] Skipping PR ${owner}/${repoName}#${pr.number} (mushin:skip)`);
    return;
  }

  // Check required checks
  const checksOK = await areChecksPassing(client, owner, repoName, pr.head.sha);
  if (!checksOK) {
    console.log(`[mushin] PR ${owner}/${repoName}#${pr.number}: checks not yet passing, waiting`);
    return;
  }

  // Get commit message for metadata parsing
  let commitMessage = pr.title;
  let body = pr.body ?? '';
  try {
    const commits = await client.getPRCommits(owner, repoName, pr.number);
    if (commits.length > 0) {
      commitMessage = commits[commits.length - 1].commit.message;
    }
  } catch {
    // Fall back to PR title
  }

  // Parse Dependabot metadata
  const dependencies = await parse(
    commitMessage,
    body,
    pr.head.ref,
    pr.base.ref,
  );

  const highestType = getHighestUpdateType(dependencies);

  if (highestType === undefined) {
    if (!config.mergeUnknown) {
      console.log(`[mushin] PR ${owner}/${repoName}#${pr.number}: unknown update type, commenting`);
      await upsertStatusComment(client, owner, repoName, pr.number, buildUnknownTypeMessage(pr.title));
      return;
    }
    // mergeUnknown=true: proceed with merge
    console.log(`[mushin] PR ${owner}/${repoName}#${pr.number}: unknown update type but merge_unknown=true, merging`);
  } else {
    if (!isUpdateLevelAllowed(highestType, config.highestVersionToMerge)) {
      console.log(
        `[mushin] PR ${owner}/${repoName}#${pr.number}: update type ${highestType} exceeds allowed ${config.highestVersionToMerge}, skipping`,
      );
      return;
    }
    console.log(`[mushin] PR ${owner}/${repoName}#${pr.number}: merging (${highestType} ≤ ${config.highestVersionToMerge})`);
  }

  // Merge!
  const merged = await client.mergePR(owner, repoName, pr.number, config.mergeMethod, pr.head.sha);
  if (merged) {
    console.log(`[mushin] PR ${owner}/${repoName}#${pr.number}: merged successfully`);
  }
}
