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
