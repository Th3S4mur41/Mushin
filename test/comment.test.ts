import { describe, expect, it, vi } from 'vitest';
import { buildUnknownTypeMessage, upsertStatusComment } from '../src/comment';
import type { GitHubClient } from '../src/github/api';

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
	return {
		getPR: vi.fn(),
		getPRCommits: vi.fn(),
		getPRComments: vi.fn().mockResolvedValue([]),
		createComment: vi.fn().mockResolvedValue({ id: 1, body: '', user: { login: 'mushin[bot]' } }),
		updateComment: vi.fn().mockResolvedValue(undefined),
		getCheckRuns: vi.fn(),
		getCommitStatuses: vi.fn(),
		mergePR: vi.fn(),
		getRepoCustomProperties: vi.fn(),
		getFileContent: vi.fn(),
		getAppLogin: vi.fn().mockResolvedValue('mushin[bot]'),
		...overrides,
	};
}

describe('upsertStatusComment', () => {
	it('creates a new comment when none exists', async () => {
		const client = makeClient();
		await upsertStatusComment(client, 'owner', 'repo', 1, 'Hello Mushin');
		expect(client.createComment).toHaveBeenCalledOnce();
		expect(client.updateComment).not.toHaveBeenCalled();
	});

	it('updates existing comment when content changes', async () => {
		const existingBody = `<!-- mushin:status -->\n<!-- mushin:hash=00000000 -->\n\nOld message`;
		const client = makeClient({
			getPRComments: vi.fn().mockResolvedValue([{ id: 42, body: existingBody, user: { login: 'mushin[bot]' } }]),
		});

		await upsertStatusComment(client, 'owner', 'repo', 1, 'New message');
		expect(client.updateComment).toHaveBeenCalledWith('owner', 'repo', 42, expect.stringContaining('New message'));
		expect(client.createComment).not.toHaveBeenCalled();
	});

	it('does not update comment when content is unchanged', async () => {
		const message = 'Same message';
		// Compute the hash the same way the implementation does (FNV-1a)
		let h = 0x811c9dc5;
		for (let i = 0; i < message.length; i++) {
			h ^= message.charCodeAt(i);
			h = (h * 0x01000193) >>> 0;
		}
		const hash = h.toString(16).padStart(8, '0');
		const existingBody = `<!-- mushin:status -->\n<!-- mushin:hash=${hash} -->\n\n${message}`;

		const client = makeClient({
			getPRComments: vi.fn().mockResolvedValue([{ id: 42, body: existingBody, user: { login: 'mushin[bot]' } }]),
		});

		await upsertStatusComment(client, 'owner', 'repo', 1, message);
		expect(client.updateComment).not.toHaveBeenCalled();
		expect(client.createComment).not.toHaveBeenCalled();
	});

	it('ignores comments from other users', async () => {
		const existingBody = `<!-- mushin:status -->\n<!-- mushin:hash=00000000 -->\n\nOld`;
		const client = makeClient({
			getPRComments: vi.fn().mockResolvedValue([{ id: 42, body: existingBody, user: { login: 'other-user' } }]),
		});

		await upsertStatusComment(client, 'owner', 'repo', 1, 'Hello');
		expect(client.createComment).toHaveBeenCalledOnce();
		expect(client.updateComment).not.toHaveBeenCalled();
	});
});

describe('buildUnknownTypeMessage', () => {
	it('includes the PR title', () => {
		const msg = buildUnknownTypeMessage('Bump foo from 1.0.0 to 2.0.0');
		expect(msg).toContain('Bump foo from 1.0.0 to 2.0.0');
	});

	it('mentions mushin:merge-unknown label', () => {
		const msg = buildUnknownTypeMessage('test PR');
		expect(msg).toContain('mushin:merge-unknown');
	});

	it('mentions merge_unknown config option', () => {
		const msg = buildUnknownTypeMessage('test PR');
		expect(msg).toContain('merge_unknown');
	});

	it('includes accessibility-friendly heading', () => {
		const msg = buildUnknownTypeMessage('test PR');
		expect(msg).toContain('## Mushin');
	});
});
