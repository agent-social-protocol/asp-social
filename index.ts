#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const ASP_DIR = join(homedir(), '.asp');
const MANIFEST_PATH = join(ASP_DIR, 'manifest.yaml');

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const selfHost = args.includes('--self-host');
  const provider = args.find((a) => a.startsWith('--provider='))?.split('=')[1]
    || (args.includes('--provider') ? args[args.indexOf('--provider') + 1] : null);

  console.log('\n  ✦ Create Your ASP Identity\n');

  if (existsSync(MANIFEST_PATH)) {
    console.log('  Already initialized at ~/.asp/');
    console.log('  Delete ~/.asp/ to start over.\n');
    process.exit(0);
  }

  // Ensure asp CLI
  const check = spawnSync('asp', ['--version'], { stdio: 'ignore' });
  if (check.status !== 0) {
    console.log('  Installing asp-protocol...');
    spawnSync('npm', ['install', '-g', 'asp-protocol'], { stdio: 'inherit' });
  }

  const handle = await ask('  Handle: ');
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle)) {
    console.log('  Invalid handle. Use 3-30 lowercase alphanumeric characters and hyphens.\n');
    process.exit(1);
  }
  const name = await ask('  Name: ');
  const bio = await ask('  Bio (optional): ');

  if (selfHost || provider) {
    // Self-host or provider path: just run asp init
    const initArgs = ['init', '--handle', handle, '--name', name, '--bio', bio || 'ASP identity'];
    if (provider) {
      console.log(`\n  Provider "${provider}" deployment not yet implemented.`);
      console.log('  Running asp init for manual setup...\n');
    }
    spawnSync('asp', initArgs, { stdio: 'inherit' });
    console.log('\n  Next: deploy your endpoint and run `asp index add`\n');
    return;
  }

  // --- ASP Hosted path (default) ---

  // Check handle availability
  console.log('\n  Checking handle availability...');
  let checkRes;
  try {
    checkRes = await fetch(`https://asp.social/api/check-handle?handle=${encodeURIComponent(handle)}`);
  } catch {
    console.log('  Could not connect to asp.social. Try again later.');
    process.exit(1);
  }

  const checkData = await checkRes.json() as { available?: boolean; error?: string };
  if (!checkRes.ok) {
    console.log(`  Error: ${checkData.error}`);
    process.exit(1);
  }

  if (!checkData.available) {
    console.log(`  @${handle} is taken.`);
    // TODO: show suggestions from server
    console.log('  Try a different handle.\n');
    process.exit(1);
  }

  // Run asp init with the hosted endpoint as ID
  const endpoint = `https://${handle}.asp.social`;
  spawnSync('asp', [
    'init',
    '--handle', handle,
    '--name', name,
    '--bio', bio || 'ASP identity',
    '--id', endpoint,
  ], { stdio: 'inherit' });

  if (!existsSync(MANIFEST_PATH)) {
    console.log('  asp init failed.');
    process.exit(1);
  }

  // Read the generated manifest and public key
  const yaml = await import('js-yaml');
  const manifestYaml = readFileSync(MANIFEST_PATH, 'utf-8');
  const manifest = yaml.load(manifestYaml) as Record<string, unknown>;
  const verification = manifest.verification as Record<string, string> | undefined;
  const publicKey = verification?.public_key;

  if (!publicKey) {
    console.log('  Error: no public key in manifest.');
    process.exit(1);
  }

  // Register with Hub
  console.log('  Registering with asp.social...');
  let registerRes;
  try {
    registerRes = await fetch('https://asp.social/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, manifest, public_key: publicKey }),
    });
  } catch {
    console.log('  Could not connect to asp.social.');
    process.exit(1);
  }

  const registerData = await registerRes.json() as { status?: string; error?: string; suggestions?: string[] };
  if (!registerRes.ok) {
    if (registerData.suggestions?.length) {
      console.log(`  @${handle} is taken. Try: ${registerData.suggestions.join(', ')}`);
    } else {
      console.log(`  Registration failed: ${registerData.error}`);
    }
    process.exit(1);
  }

  // Register with Core Index (required for hosted users)
  console.log('  Registering with ASP network...');
  let indexOk = false;
  for (let i = 0; i < 3 && !indexOk; i++) {
    try {
      const indexRes = await fetch('https://aspnetwork.dev/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      if (indexRes.ok) {
        indexOk = true;
      } else if (i < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch {
      if (i < 2) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!indexOk) {
    console.log('  Warning: Could not register with Core Index. Run `asp index add` later.');
  }

  // Open browser
  const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const profileUrl = `https://asp.social/@${handle}`;
  spawnSync(openCmd, [profileUrl], { stdio: 'ignore' });
  console.log(`\n  Opening ${profileUrl}...`);

  // Summary
  const profile = `asp.social/@${handle}`;
  const ep = `${handle}.asp.social`;
  console.log(`
  Profile:  ${profile}
  Endpoint: ${ep}
  Key:      ~/.asp/private.pem

  Try: asp publish "Hello, ASP world!"

  Share ${profile} to connect with others.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
