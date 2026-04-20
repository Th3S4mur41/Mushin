import { createGitHubClient } from './github/api';
import { getInstallationToken } from './github/auth';
import type { Env } from './index';
import { evaluatePullRequest } from './merge';

/**
 * Verifies the GitHub webhook HMAC-SHA256 signature.
 * Uses constant-time comparison to prevent timing attacks.
 */
async function verifySignature(secret: string, body: string, signatureHeader: string): Promise<boolean> {
	if (!signatureHeader.startsWith('sha256=')) return false;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
	]);

	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	const expected =
		'sha256=' +
		Array.from(new Uint8Array(mac))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

	if (expected.length !== signatureHeader.length) return false;

	const a = encoder.encode(expected);
	const b = encoder.encode(signatureHeader);
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get('X-Hub-Signature-256') ?? '';

	if (!signature) {
		return new Response('Missing signature', { status: 400 });
	}

	const valid = await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, signature);
	if (!valid) {
		return new Response('Unauthorized', { status: 401 });
	}

	const event = request.headers.get('X-GitHub-Event') ?? '';

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(body) as Record<string, unknown>;
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

	const installationId = (payload.installation as { id: number } | undefined)?.id;
	if (!installationId) {
		return new Response('OK', { status: 200 });
	}

	try {
		const token = await getInstallationToken(installationId, env);
		const client = createGitHubClient(token);

		if (event === 'pull_request') {
			const action = payload.action as string;
			if (['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(action)) {
				const pr = payload.pull_request as Record<string, unknown>;
				const repo = payload.repository as Record<string, unknown>;
				await evaluatePullRequest(client, repo, pr);
			}
		} else if (event === 'check_suite' && payload.action === 'completed') {
			const checkSuite = payload.check_suite as Record<string, unknown>;
			const prs = (checkSuite?.pull_requests as Array<{ number: number }>) ?? [];
			const repo = payload.repository as Record<string, unknown>;
			for (const pr of prs) {
				const fullPR = await client.getPR((repo.owner as { login: string }).login, repo.name as string, pr.number);
				if (fullPR) {
					await evaluatePullRequest(client, repo, fullPR as unknown as Record<string, unknown>);
				}
			}
		} else if (event === 'check_run' && payload.action === 'completed') {
			const checkRun = payload.check_run as Record<string, unknown>;
			const prs = (checkRun?.pull_requests as Array<{ number: number }>) ?? [];
			const repo = payload.repository as Record<string, unknown>;
			for (const pr of prs) {
				const fullPR = await client.getPR((repo.owner as { login: string }).login, repo.name as string, pr.number);
				if (fullPR) {
					await evaluatePullRequest(client, repo, fullPR as unknown as Record<string, unknown>);
				}
			}
		}
	} catch (err) {
		console.error('Error processing webhook:', err);
		return new Response('Internal Server Error', { status: 500 });
	}

	return new Response('OK', { status: 200 });
}
