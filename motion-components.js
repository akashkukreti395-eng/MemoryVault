/* MemoryVault Motion System — Final stable pass. No dependencies. */
(() => {
  'use strict';
  if (window.__mvMotionFinal) return;
  window.__mvMotionFinal = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const intro = document.getElementById('cosmicIntro');
  const dashboard = document.getElementById('dashboardSection');
  const admin = document.getElementById('adminDashboardSection');

  // Visible cinematic scene components; these are real DOM/CSS elements, not placeholders.
  if (intro && !intro.querySelector('.mv-scene-sequence')) {
    const sequence = document.createElement('div');
    sequence.className = 'mv-scene-sequence';
    sequence.setAttribute('aria-label', 'MemoryVault cinematic sequence');
    sequence.setAttribute('aria-hidden', 'true');
    sequence.innerHTML = `
      <div class="mv-scene mv-scene-one is-active">
        <div class="mv-scene-art mv-scene-art-capture"><i></i><i></i><i></i><b></b></div>
        <div class="mv-scene-copy"><span>SCENE 01 / CAPTURE</span><strong>A moment becomes a memory.</strong><small>WRITE IT DOWN · KEEP IT CLOSE</small></div>
      </div>
      <div class="mv-scene mv-scene-two">
        <div class="mv-scene-art mv-scene-art-seal"><i></i><i></i><b></b></div>
        <div class="mv-scene-copy"><span>SCENE 02 / PRESERVE</span><strong>Sealed inside your vault.</strong><small>PRIVATE BY DESIGN · TIME-LOCKED</small></div>
      </div>
      <div class="mv-scene mv-scene-three">
        <div class="mv-scene-art mv-scene-art-unlock"><i></i><i></i><i></i><b></b></div>
        <div class="mv-scene-copy"><span>SCENE 03 / REDISCOVER</span><strong>Your past meets your future.</strong><small>THE RIGHT MEMORY · THE RIGHT TIME</small></div>
      </div>
      <div class="mv-scene-progress"><span></span></div>`;
    const environment = intro.querySelector('.mv-core-environment');
    if (environment) environment.appendChild(sequence);
    else intro.prepend(sequence);

    if (!reduced) {
      const scenes = Array.from(sequence.querySelectorAll('.mv-scene'));
      let current = 0;
      let sceneTimer = null;
      const switchScene = () => {
        if (!intro.isConnected || intro.classList.contains('intro-hidden') || intro.classList.contains('intro-opening')) return;
        scenes[current].classList.remove('is-active');
        current = (current + 1) % scenes.length;
        scenes[current].classList.add('is-active');
      };
      const stopSceneTimer = () => {
        if (sceneTimer !== null) window.clearInterval(sceneTimer);
        sceneTimer = null;
      };
      const startSceneTimer = () => {
        stopSceneTimer();
        if (!reduced) sceneTimer = window.setInterval(switchScene, 2800);
      };
      intro.addEventListener('cosmic-intro-exit', stopSceneTimer);
      intro.addEventListener('cosmic-intro-replay', () => {
        stopSceneTimer();
        current = 0;
        scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === 0));
        startSceneTimer();
      });
      startSceneTimer();
    }
  }

  // Scroll progress rail.
  const progress = document.createElement('div');
  progress.id = 'mvMotionProgress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);
  let progressQueued = false;
  function updateProgress() {
    progressQueued = false;
    const root = document.documentElement;
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    progress.style.transform = `scaleX(${Math.max(0, Math.min(1, window.scrollY / max))})`;
    document.body.classList.toggle('mv-has-scrolled', window.scrollY > 24);
  }
  function queueProgress() {
    if (progressQueued) return;
    progressQueued = true;
    window.requestAnimationFrame(updateProgress);
  }
  window.addEventListener('scroll', queueProgress, { passive: true });
  window.addEventListener('resize', queueProgress, { passive: true });
  updateProgress();

  const selectors = [
    '.hero .hero-badge', '.hero .hero-title', '.hero .hero-description', '.hero .hero-actions',
    '#how-it-works .section-heading', '#how-it-works .step-card', '#how-it-works .how-step',
    '#features .section-heading', '#features .feature-card', '#features .feature-item', '#features .feature',
    '.memory-preview .section-heading', '.memory-preview .memory-preview-card',
    '#start .section-heading', '#start .cta-content',
    '#dashboardSection .dashboard-header', '#dashboardSection .dashboard-stat',
    '#dashboardSection .memory-create-card', '#dashboardSection .vault-archive-panel',
    '#dashboardSection .memory-card', '#dashboardSection .memories-heading',
    '#adminDashboardSection .cyber-page-heading', '#adminDashboardSection .cyber-metric-card',
    '#adminDashboardSection .cyber-panel', '#adminDashboardSection .admin-user-card',
    '#adminDashboardSection .cyber-account-card', '#adminDashboardSection .admin-memory-card',
    '#adminDashboardSection .cyber-memory-card', '#adminDashboardSection .admin-pagination'
  ];
  const known = new WeakSet();
  const observed = new WeakSet();
  let revealObserver = null;
  const isHidden = el => !el || !el.isConnected || Boolean(el.closest('.hidden,[hidden],[aria-hidden="true"]'));

  if (!reduced && 'IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (isHidden(entry.target)) {
          revealObserver.unobserve(entry.target);
          observed.delete(entry.target);
          return;
        }
        entry.target.classList.add('mv-motion-visible');
        revealObserver.unobserve(entry.target);
        observed.delete(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -5% 0px' });
  }

  function register(el, index) {
    if (!el || known.has(el) || el.closest('#cosmicIntro') || el.matches('button,input,textarea,select,form,label,a.nav-login')) return;
    known.add(el);
    el.classList.add('mv-motion-item');
    el.style.setProperty('--mv-motion-delay', `${Math.min((index % 4) * 55, 165)}ms`);
    if (el.matches('.dashboard-stat,.cyber-metric-card,.feature-card,.step-card,.memory-card,.admin-user-card,.cyber-account-card')) el.classList.add('mv-motion-hover');
    if (reduced || !revealObserver) el.classList.add('mv-motion-visible');
    else if (!isHidden(el)) { observed.add(el); revealObserver.observe(el); }
  }

  function scan(root = document) {
    let index = 0;
    selectors.forEach(selector => {
      const found = [];
      if (root instanceof Element && root.matches(selector)) found.push(root);
      if (root.querySelectorAll) found.push(...root.querySelectorAll(selector));
      found.forEach(el => register(el, index++));
    });
  }

  function refreshScreen(screen) {
    if (!screen || screen.classList.contains('hidden')) return;
    scan(screen);
    if (!revealObserver || reduced) return;
    screen.querySelectorAll('.mv-motion-item').forEach(el => {
      if (!el.classList.contains('mv-motion-visible') && !isHidden(el) && !observed.has(el)) {
        observed.add(el);
        revealObserver.observe(el);
      }
    });
  }

  function enterScreen(screen) {
    if (!screen || screen.classList.contains('hidden')) return;
    screen.classList.remove('mv-screen-enter');
    void screen.offsetWidth;
    screen.classList.add('mv-screen-enter');
    window.setTimeout(() => screen.classList.remove('mv-screen-enter'), 1250);
    refreshScreen(screen);
  }

  function watchScreen(screen) {
    if (!screen) return;
    let wasHidden = screen.classList.contains('hidden');
    const observer = new MutationObserver(() => {
      const nowHidden = screen.classList.contains('hidden');
      if (wasHidden && !nowHidden) enterScreen(screen);
      wasHidden = nowHidden;
    });
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
    if (!wasHidden) window.setTimeout(() => refreshScreen(screen), 250);
  }
  watchScreen(dashboard);
  watchScreen(admin);
  scan(document);

  // Observe only newly inserted content; no subtree class observer and no repeated animation loop.
  const contentObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node);
    }));
  });
  contentObserver.observe(document.body, { childList: true, subtree: true });

  // Small desktop-only depth response on the existing vault object.
  if (intro && finePointer && !reduced) {
    const stage = intro.querySelector('.mv-vault-stage');
    let frame = 0;
    const reset = () => { if (stage) stage.style.transform = ''; };
    if (stage) {
      intro.addEventListener('pointermove', event => {
        if (intro.classList.contains('intro-opening') || intro.classList.contains('intro-hidden')) return;
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = intro.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = (event.clientX - rect.left) / rect.width - .5;
          const y = (event.clientY - rect.top) / rect.height - .5;
          stage.style.transform = `translate3d(${(x * 7).toFixed(1)}px,${(y * 5).toFixed(1)}px,0)`;
        });
      }, { passive: true });
      intro.addEventListener('pointerleave', reset);
      intro.addEventListener('cosmic-intro-replay', reset);
    }
  }
})();
