// Tema de Brote (sistema, claro u oscuro): se aplica antes de pintar la pantalla.
(function () {
  var pref = 'system';
  try {
    pref = localStorage.getItem('fp.tema') || 'system';
  } catch (e) {
    /* sin almacenamiento: se sigue el sistema */
  }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
