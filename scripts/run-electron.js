/**
 * Run Electron from within VSCode (or any Electron-based environment)
 * 
 * VSCode sets ELECTRON_RUN_AS_NODE=true which causes Electron to run
 * as Node.js instead of a proper Electron app. We remove these vars.
 * 
 * Copied from TotalRecall Browser V2.
 */
const { spawn } = require('child_process');
const { execFileSync } = require('child_process');
const path = require('path');

let electronPath;
if (process.platform === 'darwin') {
    electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
} else if (process.platform === 'win32') {
    electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
} else {
    electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron');
}

const appPath = path.join(__dirname, '..');

// Clean environment — remove Electron-related variables from parent VSCode process
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.ATOM_SHELL_INTERNAL_RUN_AS_NODE;

// macOS: clear quarantine flags (Gatekeeper kills unsigned Electron with SIGKILL)
if (process.platform === 'darwin') {
    const { execSync } = require('child_process');
    const electronApp = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
    try {
        execSync(`xattr -cr "${electronApp}"`, { stdio: 'ignore' });
        console.log('[run-electron] Cleared macOS quarantine flags');
    } catch (e) {
        // xattr may fail if already clean — that's fine
    }
}

function getWorkspaceElectronPath() {
    return path.normalize(electronPath).toLowerCase();
}

function getWorkspaceElectronIdentity() {
    return path.basename(electronPath).toLowerCase();
}

function listListeningPidsOn8765() {
    try {
        if (process.platform === 'win32') {
            const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
            const pids = new Set();
            for (const line of output.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('TCP')) continue;
                const parts = trimmed.split(/\s+/);
                if (parts.length < 5) continue;
                const localAddress = parts[1];
                const state = parts[3];
                const pid = parts[4];
                if (!localAddress.endsWith(':8765') || state !== 'LISTENING') continue;
                if (/^\d+$/.test(pid)) pids.add(pid);
            }
            return Array.from(pids);
        }

        const args = process.platform === 'darwin'
            ? ['-ti', ':8765']
            : ['-ti', 'TCP:8765', '-sTCP:LISTEN'];
        const output = execFileSync('lsof', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return output ? output.split(/\s+/).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function getPidExecutablePath(pid) {
    try {
        if (process.platform === 'win32') {
            const script = [
                `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`,
                'if ($p) { $p.ExecutablePath }',
            ].join('; ');
            return execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
        }

        return execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function terminatePid(pid) {
    try {
        if (process.platform === 'win32') {
            execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
            execFileSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
        }
        return true;
    } catch {
        return false;
    }
}

function preflightPort8765() {
    const pids = listListeningPidsOn8765();
    if (pids.length === 0) return true;

    const workspaceElectron = getWorkspaceElectronPath();
    const workspaceElectronIdentity = getWorkspaceElectronIdentity();
    const foreignPids = [];

    for (const pid of pids) {
        const executable = path.normalize(getPidExecutablePath(pid)).toLowerCase();
        const executableIdentity = executable ? path.basename(executable).toLowerCase() : '';
        const isWorkspaceElectron = executable && (
            executable === workspaceElectron ||
            executableIdentity === workspaceElectronIdentity
        );
        if (isWorkspaceElectron) {
            if (terminatePid(pid)) {
                console.log(`[run-electron] Killed prior Tandem Electron listener on port 8765 (PID ${pid})`);
                continue;
            }
        }
        foreignPids.push({ pid, executable: executable || 'unknown' });
    }

    if (foreignPids.length > 0) {
        console.error('[run-electron] Port 8765 is already in use by another process. Refusing to start Tandem blindly.');
        for (const entry of foreignPids) {
            console.error(`[run-electron] Occupied by PID ${entry.pid} (${entry.executable})`);
        }
        return false;
    }

    return true;
}

if (!preflightPort8765()) {
    process.exit(1);
}

// Clear stale Service Worker ScriptCache when extension source files are newer.
// Electron caches compiled V8 bytecode; if the cache is stale, source patches
// are silently ignored and old (pre-patch) bytecode runs instead.
try {
    const fs = require('fs');
    const os = require('os');
    const swCacheDir = path.join(
        os.homedir(),
        'Library', 'Application Support', 'tandem-browser',
        'Partitions', 'tandem', 'Service Worker', 'ScriptCache'
    );
    const extDir = path.join(os.homedir(), '.tandem', 'extensions');
    if (fs.existsSync(swCacheDir) && fs.existsSync(extDir)) {
        // Find the newest mtime among cache files
        const cacheFiles = fs.readdirSync(swCacheDir).filter(f => f !== 'index-dir');
        const cacheMtime = cacheFiles.reduce((max, f) => {
            try { return Math.max(max, fs.statSync(path.join(swCacheDir, f)).mtimeMs); } catch { return max; }
        }, 0);
        // Find the newest mtime among extension source files (bg.js, manifest, etc.)
        let extMtime = 0;
        const walkDir = (dir) => {
            try {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) { walkDir(full); }
                    else { try { extMtime = Math.max(extMtime, fs.statSync(full).mtimeMs); } catch {} }
                }
            } catch {}
        };
        walkDir(extDir);
        // Always clear cache — polyfill is injected in-memory (no file mtime change)
        // so we can't reliably detect polyfill version changes via mtime alone.
        let cleared = 0;
        for (const f of cacheFiles) {
            try { fs.unlinkSync(path.join(swCacheDir, f)); cleared++; } catch {}
        }
        if (cleared > 0) {
            console.log(`[run-electron] Cleared ${cleared} SW bytecode cache file(s) (always-clear for polyfill freshness)`);
        }
    }
} catch (e) {
    // Non-fatal — cache will just be used as-is
}

console.log('[run-electron] Starting Tandem Browser...');

const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    cwd: appPath,
    env: cleanEnv,
    shell: false
});

child.on('error', (err) => {
    console.error('[run-electron] Failed to start:', err);
    process.exit(1);
});

child.on('close', (code) => {
    process.exit(code || 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
