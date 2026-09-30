/* Theme initialisation — must load synchronously (no defer/async) to prevent FOUC. */
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    }
  } catch (_) { /* localStorage may be blocked by privacy settings */ }
}());
