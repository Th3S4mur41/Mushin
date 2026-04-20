import type { GitHubClient } from './github/api';

const STATUS_MARKER = '<!-- mushin:status -->';
const HASH_RE = /<!-- mushin:hash=([a-f0-9]+) -->/;

/**
 * Computes a simple 32-bit FNV-1a hash of a string, returned as hex.
 */
function hashContent(content: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		h ^= content.charCodeAt(i);
		h = (h * 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

/**
 * Finds an existing Mushin status comment on a PR authored by the bot.
 */
async function findStatusComment(
	client: GitHubClient,
	owner: string,
	repo: string,
	prNumber: number,
	botLogin: string,
): Promise<{ id: number; body: string } | null> {
	const comments = await client.getPRComments(owner, repo, prNumber);
	for (const comment of comments) {
		if (comment.user.login === botLogin && comment.body.includes(STATUS_MARKER)) {
			return { id: comment.id, body: comment.body };
		}
	}
	return null;
}

/**
 * Upserts a Mushin status comment on a PR.
 * - Creates the comment if none exists.
 * - Updates the existing comment only if the content has changed (hash check).
 */
export async function upsertStatusComment(
	client: GitHubClient,
	owner: string,
	repo: string,
	prNumber: number,
	message: string,
): Promise<void> {
	const botLogin = await client.getAppLogin();
	const hash = hashContent(message);
	const fullBody = `${STATUS_MARKER}\n<!-- mushin:hash=${hash} -->\n\n${message}`;

	const existing = await findStatusComment(client, owner, repo, prNumber, botLogin);

	if (!existing) {
		await client.createComment(owner, repo, prNumber, fullBody);
		return;
	}

	// Check if hash has changed
	const existingHash = HASH_RE.exec(existing.body)?.[1];
	if (existingHash === hash) {
		// Content unchanged, skip update
		return;
	}

	await client.updateComment(owner, repo, existing.id, fullBody);
}

/**
 * Builds the "unknown update type" comment message.
 */
export function buildUnknownTypeMessage(prTitle: string): string {
	return `## Mushin — Status Update

**Action:** No merge attempted.

### Reason

Mushin could not determine the semver update type for this pull request.

The Dependabot metadata parser did not return a recognisable update category
(\`version-update:semver-major\`, \`version-update:semver-minor\`, or
\`version-update:semver-patch\`) for PR: _${prTitle}_

### How to resolve

1. **Wait** — if the PR was just opened, Dependabot may update the description shortly.
2. **Override via label** — add the label \`mushin:merge-unknown\` to this PR
   to instruct Mushin to merge regardless of unknown update type.
3. **Override via config** — set \`merge_unknown: true\` in \`.github/mushin.yml\`
   or the \`mushin_merge_unknown\` GitHub custom property at the org/repo level.
4. **Skip** — add the label \`mushin:skip\` if you want Mushin to ignore this PR.`;
}

/**
 * Builds the "skipped" comment message.
 */
export function buildSkippedMessage(reason: string): string {
	return `## Mushin — Status Update

**Action:** No merge attempted.

### Reason

${reason}`;
}
