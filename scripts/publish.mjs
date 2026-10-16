import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args, { cwd = root, input, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
if (!existsSync(path.join(root, 'dist/index.html')) || !existsSync(path.join(root, 'dist/docs/report.pdf'))) throw new Error('Run checks, docs and build before publication.');
const remote = run('git', ['remote', 'get-url', 'origin']).stdout;
const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
if (!match) throw new Error('Expected a GitHub HTTPS origin.');
const repository = match[1];
mkdirSync(path.join(root, '.tmp'), { recursive: true });
const staging = mkdtempSync(path.join(root, '.tmp/pages-'));
if (!path.resolve(staging).startsWith(path.resolve(root, '.tmp') + path.sep)) throw new Error('Unsafe staging directory');
run('git', ['init', '-b', 'gh-pages'], { cwd: staging });
run('git', ['remote', 'add', 'origin', remote], { cwd: staging });
const hasBranch = run('git', ['ls-remote', '--heads', remote, 'gh-pages']).stdout;
if (hasBranch) {
  run('git', ['fetch', '--depth=1', 'origin', 'gh-pages'], { cwd: staging });
  run('git', ['checkout', '-B', 'gh-pages', 'FETCH_HEAD'], { cwd: staging });
  for (const item of readdirSync(staging)) {
    if (item === '.git') continue;
    const target = path.resolve(staging, item);
    if (!target.startsWith(path.resolve(staging) + path.sep)) throw new Error('Unsafe cleanup path');
    rmSync(target, { recursive: true, force: true });
  }
}
cpSync(path.join(root, 'dist'), staging, { recursive: true });
run('git', ['add', '--all'], { cwd: staging });
const changes = run('git', ['status', '--porcelain'], { cwd: staging }).stdout;
if (changes) {
  run('git', ['-c', 'user.name=Yevhenii Levkivskyi', '-c', 'user.email=108275427+fffooocus@users.noreply.github.com', 'commit', '-m', 'Publish verified SONORA static application'], { cwd: staging });
  run('git', ['push', 'origin', 'HEAD:gh-pages'], { cwd: staging });
}
const current = run('gh', ['api', `repos/${repository}/pages`], { allowFailure: true });
if (!current.ok) {
  run('gh', ['api', '--method', 'POST', `repos/${repository}/pages`, '--input', '-'], { input: JSON.stringify({ build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } }) });
} else {
  const config = JSON.parse(current.stdout);
  if (config.source?.branch !== 'gh-pages' || config.source?.path !== '/') {
    run('gh', ['api', '--method', 'PUT', `repos/${repository}/pages`, '--input', '-'], { input: JSON.stringify({ build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } }) });
  }
}
console.log(`Source published to ${repository}:gh-pages`);
console.log(`Site: https://${repository.split('/')[0]}.github.io/${repository.split('/')[1]}/`);
console.log('Check the GitHub Pages build status before reporting the site as live.');
