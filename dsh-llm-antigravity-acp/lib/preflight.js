/**
 * Startup preparation: locate the official `agy` binary, verify (and when
 * allowed, apply) the local context-window unlock, and lay out the isolated
 * Antigravity home that ACP sessions use.
 *
 * The isolated home keeps the user's global Antigravity rules, skills, and
 * MCP servers out of DSH sessions and installs the `dsh-bridge` agent, which
 * removes every built-in tool so the agent acts only through DSH tools.
 * @module dsh-llm-antigravity-acp/preflight
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
/** Agent id installed in the isolated home. */
export const BRIDGE_AGENT = 'dsh-bridge';
/** Context window the official binary enforces without the unlock. */
export const LOCKED_CONTEXT_WINDOW = 256_000;
/** Physical context window of the Gemini 4, Gemini 3.8, and Claude 5.5 families. */
export const UNLOCKED_CONTEXT_WINDOW = 1_048_576;
/** GPT-OSS 120B keeps its own 128K-class window and is not covered by the unlock. */
export const GPT_OSS_CONTEXT_WINDOW = 131_072;
/**
 * Locate the `agy` executable.
 * @param configured - configured absolute path, or empty.
 * @returns the executable path.
 */
export function resolveAgyBinary(configured) {
    if (configured.length > 0) {
        if (!isAbsolute(configured))
            throw new Error(`antigravity-acp: command must be an absolute path, got ${configured}`);
        if (!existsSync(configured))
            throw new Error(`antigravity-acp: configured agy binary not found at ${configured}`);
        return configured;
    }
    const candidates = [join(homedir(), '.local', 'bin', 'agy')];
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
        if (dir.length > 0)
            candidates.push(join(dir, 'agy'));
    }
    const found = candidates.find(candidate => existsSync(candidate));
    if (found === undefined) {
        throw new Error('antigravity-acp: the Antigravity CLI (agy) was not found; install it from https://antigravity.google/docs/install?tab=cli and sign in once with `agy`');
    }
    return found;
}
/**
 * Default isolated home.
 * @returns `$DSH_HOME/cache/antigravity-acp`, or `~/.dsh/cache/antigravity-acp`.
 */
export function defaultHome() {
    const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh');
    return join(dshHome, 'cache', 'antigravity-acp');
}
/**
 * Write the isolated Antigravity home: bridge agent and ACP settings.
 * @param home - absolute home directory used as `--gemini-dir`.
 * @returns the empty workspace directory used as every session's cwd.
 */
export function prepareHome(home) {
    const agentDir = join(home, 'config', 'plugins', BRIDGE_AGENT, 'agents');
    mkdirSync(agentDir, { recursive: true });
    writeIfChanged(join(home, 'config', 'plugins', BRIDGE_AGENT, 'plugin.json'), `${JSON.stringify({ name: BRIDGE_AGENT }, null, 2)}\n`);
    writeIfChanged(join(agentDir, `${BRIDGE_AGENT}.md`), [
        '---',
        `name: ${BRIDGE_AGENT}`,
        'description: "DeepSeek Harness primary-model bridge: no built-in tools, harness tools only"',
        'tools: []',
        'excludeDefaultComponents: true',
        'mainAgent: true',
        '---',
        'Follow the appended system instructions exactly. Act only through the harness tools you are given.',
        '',
    ].join('\n'));
    const appData = join(home, 'agy');
    mkdirSync(appData, { recursive: true });
    const settingsPath = join(appData, 'settings.json');
    const settings = readJson(settingsPath);
    writeIfChanged(settingsPath, `${JSON.stringify({ ...settings, toolPermission: 'request-review', agentMode: '' }, null, 2)}\n`);
    const workspace = join(home, 'workspace');
    mkdirSync(workspace, { recursive: true });
    return workspace;
}
/**
 * Check the context-window unlock and apply it when allowed.
 * @param binary - agy executable.
 * @param script - unlock script path.
 * @param apply - whether to patch a locked binary.
 * @param run - helper command runner.
 * @returns the unlock state.
 */
export async function checkUnlock(binary, script, apply, run) {
    if (!existsSync(script)) {
        return { status: 'unknown', applied: false, detail: `unlock script not found at ${script}; the 256K default applies` };
    }
    const python = existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
    const dry = await run([python, script, '--binary', binary, '--dry-run'], 120_000);
    const text = `${dry.stdout}\n${dry.stderr}`;
    if (/all gates already unlocked/i.test(text))
        return { status: 'unlocked', applied: false, detail: 'context gates already unlocked' };
    if (!/dry run complete/i.test(text)) {
        return { status: 'unknown', applied: false, detail: `unlock check inconclusive (exit ${dry.code ?? 'null'})` };
    }
    if (!apply)
        return { status: 'locked', applied: false, detail: 'binary is locked to 256K and autoPatch is off' };
    const patched = await run([python, script, '--binary', binary, '--in-place'], 300_000);
    if (patched.code !== 0) {
        return { status: 'locked', applied: false, detail: `unlock failed (exit ${patched.code ?? 'null'}): ${patched.stderr.trim().split('\n').slice(-2).join(' ')}` };
    }
    const verify = await run([python, script, '--binary', binary, '--dry-run'], 120_000);
    return /all gates already unlocked/i.test(`${verify.stdout}\n${verify.stderr}`)
        ? { status: 'unlocked', applied: true, detail: 'context gates unlocked by this preflight' }
        : { status: 'unknown', applied: true, detail: 'unlock applied but verification was inconclusive' };
}
/**
 * Read the agy version.
 * @param binary - agy executable.
 * @param run - helper command runner.
 * @returns the version text, or `unknown`.
 */
export async function readVersion(binary, run) {
    try {
        const result = await run([binary, '--version'], 30_000);
        return (result.stdout.trim() || result.stderr.trim()).split('\n')[0] ?? 'unknown';
    }
    catch (_versionFailure) {
        // The version is diagnostic only.
        return 'unknown';
    }
}
/**
 * Default unlock script location.
 * @returns `~/.gemini/antigravity/tools/agy-patch.py`.
 */
export function defaultPatchScript() {
    return join(homedir(), '.gemini', 'antigravity', 'tools', 'agy-patch.py');
}
function writeIfChanged(path, content) {
    if (existsSync(path) && readFileSync(path, 'utf8') === content)
        return;
    writeFileSync(path, content);
}
function readJson(path) {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch (_missingSettings) {
        // A missing or unreadable settings file starts empty.
        return {};
    }
}
