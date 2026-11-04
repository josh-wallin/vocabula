/**
 * Vocābula Worker. wrangler.jsonc routes only /api/* here (assets.run_worker_first);
 * every other path is served from dist/ by the assets layer. The whole host is
 * behind Cloudflare Access; handleApi re-checks the Access identity.
 */
import { handleApi, type ApiCtx, type ApiEnv } from './api.ts';
import { handleTts, isTtsPath, type TtsSecrets } from './tts.ts';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // Compile-time check that the real bindings satisfy the handlers' minimal types.
      const apiEnv: ApiEnv = { DB: env.DB, ALLOWED_EMAILS: env.ALLOWED_EMAILS, ACCESS_AUD: env.ACCESS_AUD, ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN };
      const apiCtx: ApiCtx = { access: ctx.access };
      // Voice test (#/compare). The keys are Worker secrets, so they aren't in the generated Env type.
      if (isTtsPath(url.pathname)) { const s = env as Partial<TtsSecrets>; return handleTts(request, { ...apiEnv, OPENAI_API_KEY: s.OPENAI_API_KEY, GEMINI_API_KEY: s.GEMINI_API_KEY }, apiCtx); }
      return handleApi(request, apiEnv, apiCtx);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
