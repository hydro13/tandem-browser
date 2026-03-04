/**
 * Run Electron from within VSCode (or any Electron-based environment)
 * 
 * VSCode sets ELECTRON_RUN_AS_NODE=true which causes Electron to run
 * as Node.js instead of a proper Electron app. We remove these vars.
 * 
 * Copied from TotalRecall Browser V2.
 */
const { spawn } = require('child_process');
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

// Kill any leftover process on port 8765
try {
    const { execSync } = require('child_process');
    const pids = execSync('/usr/sbin/lsof -ti :8765 2>/dev/null', { encoding: 'utf8' }).trim();
    if (pids) {
        execSync(`kill -9 ${pids.split('\n').join(' ')}`, { stdio: 'ignore' });
        console.log('[run-electron] Killed leftover process on port 8765');
    }
} catch (e) {
    // No process on port — good
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
        if (extMtime > cacheMtime) {
            let cleared = 0;
            for (const f of cacheFiles) {
                try { fs.unlinkSync(path.join(swCacheDir, f)); cleared++; } catch {}
            }
            if (cleared > 0) {
                console.log(`[run-electron] Cleared ${cleared} stale SW bytecode cache file(s) (ext files newer by ${Math.round((extMtime - cacheMtime)/1000)}s)`);
            }
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
