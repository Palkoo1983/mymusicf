/* Load a YouTube player only after an explicit click. Links work without JS. */
(() => {
  'use strict';
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a.yt-preview');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = link.dataset.videoId;
    if (!/^[\w-]{11}$/.test(id)) return;
    event.preventDefault();
    const frame = document.createElement('iframe');
    frame.title = link.getAttribute('aria-label') || 'EnZenem video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.setAttribute('allowfullscreen', '');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
    link.replaceWith(frame);
    frame.focus();
  });
})();
