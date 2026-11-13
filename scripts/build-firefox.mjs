import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const distFirefoxDir = path.resolve('dist-firefox');
const firefoxManifestSource = path.resolve('public/manifest.firefox.json');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ directory not found. Run vite build first.');
}

if (!fs.existsSync(firefoxManifestSource)) {
  throw new Error('public/manifest.firefox.json not found.');
}

// Clean and recreate dist-firefox
if (fs.existsSync(distFirefoxDir)) {
  fs.rmSync(distFirefoxDir, { recursive: true, force: true });
}
fs.mkdirSync(distFirefoxDir, { recursive: true });

// Copy all files from dist/ to dist-firefox/
fs.cpSync(distDir, distFirefoxDir, { recursive: true });

// Read and update Firefox manifest version to match package.json
const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestSource, 'utf8'));
firefoxManifest.version = pkg.version;

// Write to dist-firefox/manifest.json
fs.writeFileSync(
  path.join(distFirefoxDir, 'manifest.json'),
  JSON.stringify(firefoxManifest, null, 2) + '\n'
);

// Remove duplicate manifest.firefox.json in dist-firefox if Vite copied it from public
const copiedFirefoxManifest = path.join(distFirefoxDir, 'manifest.firefox.json');
if (fs.existsSync(copiedFirefoxManifest)) {
  fs.unlinkSync(copiedFirefoxManifest);
}

// Also remove from dist if Vite copied it into dist
const distDuplicate = path.join(distDir, 'manifest.firefox.json');
if (fs.existsSync(distDuplicate)) {
  fs.unlinkSync(distDuplicate);
}

console.log('Built Firefox distribution at dist-firefox/');
