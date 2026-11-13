/**
 * SafeHeader Documentation & Landing Page
 * Interactive Client Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPropertySearch();
  initLightbox();
  initCopyButtons();
});

/**
 * 1. Installation Platform Tab Switcher
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      // Update button active states
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panel visibility
      tabPanels.forEach((panel) => {
        if (panel.id === targetId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });
}

/**
 * 2. Real-Time Property & Feature Search & Filtering
 */
function initPropertySearch() {
  const searchInput = document.getElementById('propertySearch');
  const chipButtons = document.querySelectorAll('.chip-btn');
  const cards = document.querySelectorAll('.prop-card');
  const noResults = document.getElementById('noResultsMessage');

  let activeCategory = 'all';
  let searchTerm = '';

  function filterCards() {
    let visibleCount = 0;

    cards.forEach((card) => {
      const category = card.getAttribute('data-category') || '';
      const text = card.textContent.toLowerCase();

      const matchesCategory = activeCategory === 'all' || category.toLowerCase() === activeCategory.toLowerCase();
      const matchesSearch = !searchTerm || text.includes(searchTerm);

      if (matchesCategory && matchesSearch) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (noResults) {
      noResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      filterCards();
    });
  }

  chipButtons.forEach((chip) => {
    chip.addEventListener('click', () => {
      chipButtons.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.getAttribute('data-category') || 'all';
      filterCards();
    });
  });
}

/**
 * 3. High-Resolution Screenshot Lightbox
 */
function initLightbox() {
  const modal = document.getElementById('lightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const closeBtn = document.getElementById('lightboxClose');

  if (!modal || !lightboxImg) return;

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || 'Screenshot preview';
    if (lightboxCaption) {
      lightboxCaption.textContent = alt || '';
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Trigger elements
  document.querySelectorAll('[data-lightbox]').forEach((el) => {
    el.addEventListener('click', () => {
      const img = el.querySelector('img') || el;
      const src = el.getAttribute('data-lightbox') || img.src;
      const caption = el.getAttribute('data-caption') || img.alt;
      openLightbox(src, caption);
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeLightbox);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeLightbox();
    }
  });
}

/**
 * 4. Copy Code Snippet Buttons
 */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');

  copyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.code-container');
      if (!container) return;
      const pre = container.querySelector('pre');
      if (!pre) return;

      const code = pre.textContent;
      navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.color = '#34d399';
        btn.style.borderColor = '#34d399';

        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 2000);
      }).catch((err) => {
        console.error('Clipboard copy failed:', err);
      });
    });
  });
}
