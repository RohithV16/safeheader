/**
 * SafeHeader Documentation Page Scripts
 * Handles installation tab switching & dynamic GitHub latest release detection
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Tab Switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanels.forEach((panel) => {
        if (panel.id === targetId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });

  // 2. Dynamic GitHub Latest Release Loader
  // Keeps the site automatically up-to-date when new versions are released
  fetchLatestRelease();
});

async function fetchLatestRelease() {
  const badge = document.getElementById('release-badge');
  const chromeBtn = document.getElementById('btn-download-chrome');
  const firefoxBtn = document.getElementById('btn-download-firefox');

  try {
    const res = await fetch('https://api.github.com/repos/RohithV16/safeheader/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!res.ok) return;

    const data = await res.json();
    if (data.tag_name && badge) {
      badge.textContent = data.tag_name;
    }

    if (Array.isArray(data.assets)) {
      data.assets.forEach((asset) => {
        const name = (asset.name || '').toLowerCase();
        if (chromeBtn && name.includes('chrome') && name.endsWith('.zip')) {
          chromeBtn.href = asset.browser_download_url;
        }
        if (firefoxBtn && name.includes('firefox') && name.endsWith('.zip')) {
          firefoxBtn.href = asset.browser_download_url;
        }
      });
    }
  } catch {
    // Offline or rate-limited: fallback cleanly to generic 'Latest' link
  }
}
