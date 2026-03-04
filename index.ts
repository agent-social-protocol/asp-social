#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ASP_DIR = join(homedir(), '.asp');
const isInitialized = existsSync(join(ASP_DIR, 'manifest.yaml'));

console.log('\n  Create Your ASP — agent-native identity\n');

if (isInitialized) {
  console.log('  Already initialized at ~/.asp/');
  console.log('  Delete ~/.asp/ to start over.\n');
  process.exit(0);
}

// Ensure asp CLI is available
const check = spawnSync('asp', ['--version'], { stdio: 'ignore' });
if (check.status !== 0) {
  console.log('  Installing asp-protocol...');
  spawnSync('npm', ['install', '-g', 'asp-protocol'], { stdio: 'inherit' });
}

// Run asp init (interactive)
console.log('  Setting up your identity...\n');
spawnSync('asp', ['init'], { stdio: 'inherit' });

// Register with Core Index
if (existsSync(join(ASP_DIR, 'manifest.yaml'))) {
  console.log('\n  Registering with ASP network...');
  spawnSync('asp', ['index', 'add'], { stdio: 'inherit' });

  console.log('\n  Done! Your ASP identity is ready.');
  console.log('  Next steps:');
  console.log('    asp serve --port 3000    Start your endpoint');
  console.log('    asp status               See your profile');
  console.log('    asp subscribe <url>      Follow someone\n');
}
