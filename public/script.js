// script.js — CLEAN, no forced scroll, no logo wrapping

document.addEventListener('DOMContentLoaded', () => {
  // ---- Tabs ----
  const tabs = document.querySelectorAll('.vinyl-tabs .tab');
  const panels = document.querySelectorAll('.panel');

  function showPanel(id) {
    panels.forEach(p => p.classList.toggle('active', p.id === id));
    tabs.forEach(t => t.classList.toggle('active', t.dataset.target === id));
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.target;
      showPanel(id);
      // csak user interakcióra módosítunk hash-t
      if (history.replaceState) history.replaceState(null, '', `#${id}`);
    });
  });

  // Hash alapján nyitás (load-kor villanás nélkül)
  const initial = (location.hash || '#intro').replace('#','');
  if ([...panels].some(p => p.id === initial)) showPanel(initial);
  else showPanel('intro');

  // ---- Jump link (csak user-kattintásra sima scroll) ----
  document.querySelectorAll('[data-jump]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('data-jump');
      showPanel(id);
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', `#${id}`);
    });
  });

  // ---- Példa kitöltők (opcionális) ----
  document.querySelectorAll('.examples .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = document.querySelector('textarea[name="brief"]');
      if (t) t.value = btn.dataset.example || '';
    });
  });

  // ---- Consent sáv ----
  const consent = document.getElementById('consent');
  const consentBtn = document.getElementById('consentAccept');
  if (consent && !localStorage.getItem('enz-consent')) {
    consent.classList.add('show');
  }
  consentBtn?.addEventListener('click', () => {
    localStorage.setItem('enz-consent', '1');
    consent.classList.remove('show');
  });

  // ---- License modal (meghagyva, ha hívod máshonnan) ----
  const lic = document.getElementById('license-warning');
  document.getElementById('licenseAccept')?.addEventListener('click', () => lic.style.display = 'none');
  document.getElementById('licenseCancel')?.addEventListener('click', () => lic.style.display = 'none');

  // ---- Kapcsolat overlay ----
  const overlay = document.getElementById('thanksOverlay');
  const overlayClose = document.getElementById('overlayClose');
  overlayClose?.addEventListener('click', () => overlay.classList.add('hidden'));

  // (űrlap submit-kezelők itt maradhatnak, nem befolyásolják a betöltést)
});
