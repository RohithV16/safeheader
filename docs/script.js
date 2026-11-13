/**
 * SafeHeader Documentation & Landing Page
 * Advanced Interactive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initScrollProgress();
  initScrollspy();
  initTabs();
  initBentoSpotlight();
  initHeroTilt();
  initSandboxWidget();
  initFaqAccordion();
  initCommandPalette();
  initPropertySearch();
  initLightbox();
  initCopyButtons();
  initMobileDrawer();
  initBackToTop();
});

/**
 * 1. Scroll Progress Bar
 */
function initScrollProgress() {
  const progressBar = document.getElementById('scrollProgressBar');
  if (!progressBar) return;

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const progress = (scrollTop / scrollHeight) * 100;
    progressBar.style.width = `${progress}%`;
  }, { passive: true });
}

/**
 * 2. Scrollspy Navigation
 */
function initScrollspy() {
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  const sections = Array.from(navLinks).map((link) => {
    const id = link.getAttribute('href').substring(1);
    return document.getElementById(id);
  }).filter(Boolean);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach((link) => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  sections.forEach((sec) => observer.observe(sec));
}

/**
 * 3. Installation Tabs
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      tabPanels.forEach((panel) => {
        if (panel.id === targetId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });

    // Keyboard navigation (ArrowLeft / ArrowRight)
    btn.addEventListener('keydown', (e) => {
      let nextIndex = null;
      if (e.key === 'ArrowRight') {
        nextIndex = (index + 1) % tabButtons.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      }

      if (nextIndex !== null) {
        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      }
    });
  });
}

/**
 * 4. Bento Card Mouse-Following Spotlight
 */
function initBentoSpotlight() {
  const cards = document.querySelectorAll('.bento-card, .prop-card');

  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

/**
 * 5. 3D Hero Mockup Interactive Tilt
 */
function initHeroTilt() {
  const wrapper = document.querySelector('.hero-mockup-wrapper');
  const frame = document.querySelector('.mockup-frame');
  if (!wrapper || !frame) return;

  wrapper.addEventListener('mousemove', (e) => {
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;

    frame.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  wrapper.addEventListener('mouseleave', () => {
    frame.style.transform = 'rotateX(0deg) rotateY(0deg)';
  });
}

/**
 * 6. Interactive URL Filter Sandbox Widget
 */
function initSandboxWidget() {
  const urlInput = document.getElementById('sandboxUrl');
  const patternInput = document.getElementById('sandboxPattern');
  const resultBox = document.getElementById('sandboxResult');
  const typeSelect = document.getElementById('sandboxType');

  if (!urlInput || !patternInput || !resultBox) return;

  function wildcardToRegExp(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(regexStr);
  }

  function evaluateMatch() {
    const url = urlInput.value.trim();
    const pattern = patternInput.value.trim();
    const type = typeSelect ? typeSelect.value : 'wildcard';

    if (!url || !pattern) {
      resultBox.className = 'sandbox-result';
      resultBox.textContent = 'Enter both a Test URL and Filter Pattern to evaluate.';
      return;
    }

    try {
      let isMatch = false;
      if (type === 'regex') {
        const re = new RegExp(pattern);
        isMatch = re.test(url);
      } else {
        const re = wildcardToRegExp(pattern);
        isMatch = re.test(url);
      }

      if (isMatch) {
        resultBox.className = 'sandbox-result match';
        resultBox.innerHTML = `<span>✓ MATCH — SafeHeader rules will execute on this request</span><span class="badge badge-emerald">ALLOWED</span>`;
      } else {
        resultBox.className = 'sandbox-result nomatch';
        resultBox.innerHTML = `<span>✕ NO MATCH — Request bypassed without modification</span><span class="badge badge-rose">BYPASSED</span>`;
      }
    } catch (err) {
      resultBox.className = 'sandbox-result nomatch';
      resultBox.textContent = `Invalid Pattern Syntax: ${err.message}`;
    }
  }

  urlInput.addEventListener('input', evaluateMatch);
  patternInput.addEventListener('input', evaluateMatch);
  if (typeSelect) typeSelect.addEventListener('change', evaluateMatch);
}

/**
 * 7. Technical FAQ Accordion
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const btn = item.querySelector('.faq-question-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close other items for accordion mode
      faqItems.forEach((other) => {
        if (other !== item) other.classList.remove('active');
      });

      if (isActive) {
        item.classList.remove('active');
      } else {
        item.classList.add('active');
      }
    });
  });
}

/**
 * 8. Global Command Palette (Cmd+K / /)
 */
function initCommandPalette() {
  const modal = document.getElementById('cmdModal');
  const trigger = document.getElementById('cmdTrigger');
  const input = document.getElementById('cmdInput');
  const resultsContainer = document.getElementById('cmdResults');

  if (!modal || !input) return;

  // Search index of all site sections and topics
  const searchIndex = [
    { title: 'Overview & Value Proposition', category: 'General', url: '#overview' },
    { title: 'Download & Installation (Chrome & Firefox)', category: 'Install', url: '#install' },
    { title: 'Chrome & Chromium Installation Guide', category: 'Install', url: '#install' },
    { title: 'Firefox MV3 Installation Guide', category: 'Install', url: '#install' },
    { title: 'Build from Source with npm', category: 'Install', url: '#install' },
    { title: 'DNR Kernel Architecture & Rule Quotas', category: 'Architecture', url: '#architecture' },
    { title: 'Dynamic Rules vs. Session Rules', category: 'Architecture', url: '#architecture' },
    { title: 'Rule Limits (30k Dynamic, 5k Session, 1k Regex)', category: 'Architecture', url: '#architecture' },
    { title: 'Appendable Headers Allowlist (APPENDABLE_REQUEST_HEADERS)', category: 'Architecture', url: '#architecture' },
    { title: 'Request Headers (Add, Set, Remove)', category: 'Properties', url: '#properties' },
    { title: 'Response Headers & CORS Overrides', category: 'Properties', url: '#properties' },
    { title: 'Request Cookies Injection (Zero Jar Pollution)', category: 'Properties', url: '#properties' },
    { title: 'Query Parameters Transform (Append, Set, Remove)', category: 'Properties', url: '#properties' },
    { title: 'Redirects & Blocks (Localhost & Tracker Blocker)', category: 'Properties', url: '#properties' },
    { title: 'URL Filters (Wildcard vs RE2 Regex)', category: 'Filters', url: '#properties' },
    { title: 'Interactive URL Filter Matcher Sandbox', category: 'Sandbox', url: '#sandbox' },
    { title: 'Resource Types (Document, XHR/Fetch, Script)', category: 'Filters', url: '#properties' },
    { title: 'HTTP Methods (GET, POST, PUT, DELETE, OPTIONS)', category: 'Filters', url: '#properties' },
    { title: 'Strict Scope Guard & Sensitive Credentials', category: 'Security', url: '#security' },
    { title: '1-Click Scope This Site Action', category: 'Filters', url: '#properties' },
    { title: 'Profiles, Colors, and Multi-Profile Mode', category: 'Profiles', url: '#properties' },
    { title: 'Tab Lock Mode (Ephemeral Session Scoping)', category: 'Power Features', url: '#properties' },
    { title: 'Presentation Mode & Secret Masking', category: 'Security', url: '#security' },
    { title: 'Enterprise Managed Storage (chrome.storage.managed)', category: 'Enterprise', url: '#security' },
    { title: 'Local Audit Log (20-Entry Ring Buffer)', category: 'Security', url: '#security' },
    { title: 'Feature Comparison Matrix (vs ModHeader, Requestly)', category: 'Comparison', url: '#comparison' },
    { title: 'Cookbook: Bearer Token Auth Injection', category: 'Recipes', url: '#cookbook' },
    { title: 'Cookbook: Local CORS Development Bypass', category: 'Recipes', url: '#cookbook' },
    { title: 'Cookbook: A/B Testing Feature Flag Cookie', category: 'Recipes', url: '#cookbook' },
    { title: 'Cookbook: Microfrontend Redirect to Localhost', category: 'Recipes', url: '#cookbook' },
    { title: 'Cookbook: Strip Tracking Parameters (utm_*)', category: 'Recipes', url: '#cookbook' },
    { title: 'Cookbook: Block Analytics & Pixels', category: 'Recipes', url: '#cookbook' },
    { title: 'FAQ: Why is profile export disabled?', category: 'FAQ', url: '#faq' },
    { title: 'FAQ: DevTools Network panel header caching', category: 'FAQ', url: '#faq' },
    { title: 'FAQ: CORS Preflight OPTIONS handling', category: 'FAQ', url: '#faq' },
    { title: 'FAQ: Testing locally with echo-server', category: 'FAQ', url: '#faq' },
    { title: 'Extension Screenshots Gallery', category: 'Gallery', url: '#gallery' }
  ];

  function openPalette() {
    modal.classList.add('active');
    input.value = '';
    renderResults(searchIndex);
    input.focus();
    document.body.style.overflow = 'hidden';
  }

  function closePalette() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderResults(items) {
    resultsContainer.innerHTML = '';
    if (items.length === 0) {
      resultsContainer.innerHTML = '<li style="padding: 1.5rem; text-align: center; color: var(--text-faint);">No matching documentation found.</li>';
      return;
    }

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = `cmd-item ${index === 0 ? 'selected' : ''}`;
      li.innerHTML = `<span>${item.title}</span><span class="cmd-item-category">${item.category}</span>`;
      li.addEventListener('click', () => {
        closePalette();
        window.location.hash = item.url;
      });
      resultsContainer.appendChild(li);
    });
  }

  if (trigger) trigger.addEventListener('click', openPalette);

  input.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderResults(searchIndex);
      return;
    }
    const filtered = searchIndex.filter(item => 
      item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
    renderResults(filtered);
  });

  input.addEventListener('keydown', (e) => {
    const items = resultsContainer.querySelectorAll('.cmd-item');
    if (!items.length) return;

    let selectedIndex = Array.from(items).findIndex(el => el.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectedIndex !== -1) items[selectedIndex].classList.remove('selected');
      selectedIndex = (selectedIndex + 1) % items.length;
      items[selectedIndex].classList.add('selected');
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIndex !== -1) items[selectedIndex].classList.remove('selected');
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      items[selectedIndex].classList.add('selected');
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex !== -1) {
        items[selectedIndex].click();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      modal.classList.contains('active') ? closePalette() : openPalette();
    } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape' && modal.classList.contains('active')) {
      closePalette();
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePalette();
  });
}

/**
 * 9. Real-Time Property Category Filter & Card Search
 */
function initPropertySearch() {
  const searchInput = document.getElementById('propertySearch');
  const chipButtons = document.querySelectorAll('.chip-btn');
  const cards = document.querySelectorAll('.bento-card');
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
 * 10. Screenshot Lightbox Viewer
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
    if (lightboxCaption) lightboxCaption.textContent = alt || '';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-lightbox]').forEach((el) => {
    el.addEventListener('click', () => {
      const img = el.querySelector('img') || el;
      const src = el.getAttribute('data-lightbox') || img.src;
      const caption = el.getAttribute('data-caption') || img.alt;
      openLightbox(src, caption);
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeLightbox();
  });
}

/**
 * 11. Copy Code Snippet Buttons
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

/**
 * 12. Mobile Drawer Navigation
 */
function initMobileDrawer() {
  const toggle = document.getElementById('mobileNavToggle');
  const drawer = document.getElementById('mobileDrawer');
  const closeBtn = document.getElementById('mobileDrawerClose');
  const links = document.querySelectorAll('.mobile-drawer-link');

  if (!toggle || !drawer) return;

  toggle.addEventListener('click', () => {
    drawer.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  function closeDrawer() {
    drawer.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  links.forEach(l => l.addEventListener('click', closeDrawer));
}

/**
 * 13. Back to Top Button
 */
function initBackToTop() {
  const backBtn = document.getElementById('backToTopBtn');
  if (!backBtn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
      backBtn.classList.add('visible');
    } else {
      backBtn.classList.remove('visible');
    }
  }, { passive: true });

  backBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
