import { handleWebhook } from './webhook';
import { handleHealth } from './health';

export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_PRIVATE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return handleHealth();
    }

    if (request.method === 'POST' && url.pathname === '/webhook') {
      return handleWebhook(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
