import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const distDir = path.resolve('dist');
const releaseDir = path.resolve('release');

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ directory not found. Run "npm run build" first.');
}

const distManifestPath = path.join(distDir, 'manifest.json');
const distManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));

if (distManifest.version !== pkg.version) {
  throw new Error(
    `Version mismatch: package.json=${pkg.version} vs dist/manifest.json=${distManifest.version}`
  );
}

// Verify dist/ contains no sourcemaps or dev-only scripts
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(path.relative(distDir, full));
    }
  }
  return files;
}

const distFiles = walk(distDir);
for (const rel of distFiles) {
  if (rel.endsWith('.map') || rel.includes('echo-server') || rel.startsWith('node_modules')) {
    throw new Error(`Disallowed artifact found in dist/: ${rel}`);
  }
}

fs.mkdirSync(releaseDir, { recursive: true });
const zipName = `safeheader-v${pkg.version}.zip`;
const outZip = path.join(releaseDir, zipName);

if (fs.existsSync(outZip)) {
  fs.unlinkSync(outZip);
}

const zipBinary = fs.existsSync('/usr/bin/zip') ? '/usr/bin/zip' : 'zip';
execFileSync(zipBinary, ['-r', '-q', '-X', outZip, '.'], {
  cwd: distDir,
  stdio: 'inherit',
  env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
});

const zipBytes = fs.readFileSync(outZip);
const sha256 = crypto.createHash('sha256').update(zipBytes).digest('hex');
fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), `${sha256}  ${zipName}\n`);

console.log(`Packaged extension archive: ${outZip}`);
console.log(`SHA-256: ${sha256}`);
