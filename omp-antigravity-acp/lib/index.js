import { getAgentDir } from '@oh-my-pi/pi-coding-agent';
import { spawnAcp, runCommand } from "./host.js";
import { ACP_API, streamAcp } from "./provider.js";
import { AntigravityRuntime } from "./runtime.js";
import { loadConfig } from "./settings.js";
/** Each factory binding owns a runtime; OMP subagents never dispose their parent's sessions. */
export default async function antigravity(pi) {
    const config = loadConfig(getAgentDir());
    const runtime = new AntigravityRuntime({
        config, spawnAcp, runCommand,
        readImage: async (block) => block.attachment.data !== undefined && block.attachment.mimeType !== undefined
            ? { data: block.attachment.data, mimeType: block.attachment.mimeType } : undefined,
        canReadImages: () => true,
        log: { info: message => pi.logger.debug(message), warn: message => pi.logger.warn(message) },
    });
    try {
        await runtime.prepare();
    }
    catch (error) {
        pi.logger.warn(`Antigravity preflight: ${error instanceof Error ? error.message : String(error)}`);
    }
    const models = () => runtime.catalog.list().map(model => {
        const efforts = runtime.catalog.effortsFor(model.id);
        return {
            id: model.id, name: `${config.displayName}: ${model.name}`,
            reasoning: efforts.length > 0 || runtime.catalog.fixedEffort(model.id) !== undefined,
            ...(efforts.length > 0 ? { thinking: {
                    mode: 'effort', efforts: efforts,
                    defaultLevel: runtime.effectiveEffort(model.id, runtime.defaultEffort()),
                } } : {}),
            input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: runtime.contextWindowFor(model.id), maxTokens: 64_000,
        };
    });
    const provider = () => ({
        // OMP requires URL/key metadata; neither is used by the command-backed transport.
        baseUrl: 'https://antigravity-acp.invalid/', apiKey: 'local-agy-login', api: ACP_API,
        models: models(),
        streamSimple: (model, context, options) => streamAcp(runtime, model, context, options),
        fetchDynamicModels: async () => { await runtime.warmup(); return models(); },
        usage: {
            id: config.provider, cacheVersion: 1,
            async fetchUsage() {
                await runtime.ensureReady();
                const snapshot = await runtime.quota.read();
                if (snapshot.status !== 'ok')
                    return null;
                return {
                    provider: config.provider, fetchedAt: Date.parse(snapshot.updatedAt),
                    limits: snapshot.groups.flatMap(group => group.buckets.map(bucket => ({
                        id: `${group.name}:${bucket.id}`, label: `${group.name}: ${bucket.name}`,
                        scope: { provider: config.provider, shared: true, sharedGroup: group.name },
                        window: { id: bucket.window, label: bucket.window,
                            ...(Number.isFinite(Date.parse(bucket.resetTime)) ? { resetsAt: Date.parse(bucket.resetTime) } : {}),
                        },
                        amount: { unit: 'percent', remainingFraction: bucket.remainingFraction, usedFraction: 1 - bucket.remainingFraction },
                    }))),
                };
            },
        },
    });
    pi.registerProvider(config.provider, provider());
    pi.on('session_shutdown', async () => { await runtime.dispose(); });
    pi.on('session_start', () => {
        if (config.warmup)
            void runtime.warmup().catch((error) => {
                pi.logger.warn(`Antigravity warmup: ${error instanceof Error ? error.message : String(error)}`);
            });
    });
    pi.registerCommand('antigravity', {
        description: 'Antigravity ACP status, models, or usage (login through agy acp --login)',
        handler: async (args, ctx) => {
            try {
                switch (args.trim()) {
                    case 'models':
                        await runtime.warmup();
                        pi.registerProvider(config.provider, provider());
                        ctx.ui.notify(runtime.catalog.list().map(model => `${config.provider}/${model.id}`).join('\n'), 'info');
                        break;
                    case 'usage': {
                        await runtime.ensureReady();
                        const usage = await runtime.quota.read(true);
                        if (usage.status !== 'ok')
                            throw new Error(usage.error ?? 'Antigravity quota unavailable');
                        ctx.ui.notify(usage.groups.flatMap(group => group.buckets.map(bucket => `${group.name} ${bucket.name}: ${(bucket.remainingFraction * 100).toFixed(1)}% remaining; resets ${bucket.resetTime}`)).join('\n'), 'info');
                        break;
                    }
                    case '':
                    case 'status':
                        ctx.ui.notify(JSON.stringify(runtime.status(), null, 2), 'info');
                        break;
                    default: ctx.ui.notify('Usage: /antigravity [status|models|usage]. Login: agy acp --login', 'info');
                }
            }
            catch (error) {
                ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
            }
        },
    });
}
