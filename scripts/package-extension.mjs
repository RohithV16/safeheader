import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const distDir = path.resolve('dist');
const distFirefoxDir = path.resolve('dist-firefox');
const releaseDir = path.resolve('release');

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ directory not found. Run "npm run build" first.');
}

function verifyDist(dir, label) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${label}: manifest.json not found in ${dir}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(
      `${label}: Version mismatch: package.json=${pkg.version} vs ${dir}/manifest.json=${manifest.version}`
    );
  }

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        files.push(...walk(full));
      } else {
        files.push(path.relative(dir, full));
      }
    }
    return files;
  }

  const files = walk(dir);
  for (const rel of files) {
    if (rel.endsWith('.map') || rel.includes('echo-server') || rel.startsWith('node_modules')) {
      throw new Error(`${label}: Disallowed artifact found in ${dir}: ${rel}`);
    }
  }
}

verifyDist(distDir, 'Chrome dist');
if (fs.existsSync(distFirefoxDir)) {
  verifyDist(distFirefoxDir, 'Firefox dist');
}

fs.mkdirSync(releaseDir, { recursive: true });
const zipBinary = fs.existsSync('/usr/bin/zip') ? '/usr/bin/zip' : 'zip';
const checksums = [];

function createZip(sourceDir, zipName) {
  const outZip = path.join(releaseDir, zipName);
  if (fs.existsSync(outZip)) {
    fs.unlinkSync(outZip);
  }
  execFileSync(zipBinary, ['-r', '-q', '-X', outZip, '.'], {
    cwd: sourceDir,
    stdio: 'inherit',
    env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  });
  const bytes = fs.readFileSync(outZip);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  checksums.push(`${sha256}  ${zipName}`);
  console.log(`Packaged ${zipName}: ${outZip}`);
  console.log(`SHA-256: ${sha256}`);
  return outZip;
}

// 1. Chrome / Chromium archive
const chromeZip = `safeheader-v${pkg.version}-chrome.zip`;
createZip(distDir, chromeZip);

// Backwards-compatible default zip (identical to chrome zip)
const defaultZip = `safeheader-v${pkg.version}.zip`;
fs.copyFileSync(path.join(releaseDir, chromeZip), path.join(releaseDir, defaultZip));
const defaultBytes = fs.readFileSync(path.join(releaseDir, defaultZip));
const defaultSha = crypto.createHash('sha256').update(defaultBytes).digest('hex');
checksums.push(`${defaultSha}  ${defaultZip}`);

// 2. Firefox AMO archive
if (fs.existsSync(distFirefoxDir)) {
  const firefoxZip = `safeheader-v${pkg.version}-firefox.zip`;
  createZip(distFirefoxDir, firefoxZip);
}

fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`Updated release checksums in ${path.join(releaseDir, 'SHA256SUMS.txt')}`);
