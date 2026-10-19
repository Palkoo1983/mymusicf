/* Editable music style picker: select on click without a blur timer race. */
document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('styleList');
  const input = document.getElementById('styleInput');
  if (!list || !input) return;
  const options = [...list.querySelectorAll('[data-val]')];
  let active = -1;
  let restoringFocus = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'none');
  list.setAttribute('role', 'listbox');
  options.forEach((option, index) => {
    option.id = 'style-option-' + index;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
  });
  function highlight(index) {
    active = index;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (index < 0) input.removeAttribute('aria-activedescendant');
    else input.setAttribute('aria-activedescendant', options[index].id);
  }
  function open() {
    list.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  }
  function close() {
    list.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    highlight(-1);
  }
  function choose(option) {
    input.value = option.dataset.val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    restoringFocus = true;
    input.focus({ preventScroll: true });
    restoringFocus = false;
    close();
  }
  input.addEventListener('focus', () => { if (!restoringFocus) open(); });
  input.addEventListener('click', open);
  input.addEventListener('input', () => { highlight(-1); open(); });
  // Retain input focus during mouse presses, including slow clicks. Touch
  // scrolling stays native; selection still occurs only on the click event.
  list.addEventListener('mousedown', event => {
    if (event.button === 0 && event.target.closest('[data-val]')) event.preventDefault();
  });
  list.addEventListener('click', event => {
    const option = event.target.closest('[data-val]');
    if (!option || !list.contains(option)) return;
    event.preventDefault();
    choose(option);
  });
  document.addEventListener('pointerdown', event => {
    if (event.target !== input && !list.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (event.target !== input && !list.contains(event.target)) close();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
      const next = event.key === 'ArrowDown' ? (active + 1) % options.length : (active <= 0 ? options.length - 1 : active - 1);
      highlight(next);
      options[next].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0 && input.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      close();
    }
  });
});
