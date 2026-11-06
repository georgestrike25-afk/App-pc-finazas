/**
 * Teclado del celular:
 * - la tecla de acción dice "Listo" (no "Siguiente") y al tocarla se confirma lo escrito y se cierra el teclado;
 * - el campo donde se escribe se acomoda a la vista cuando aparece el teclado;
 * - con el teclado abierto se oculta la barra de abajo (le sacaba lugar al campo).
 */
const isField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
  !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range|color)$/i.test((el as HTMLInputElement).type)));

export function startKeyboardHelpers() {
  const show = () => {
    const el = document.activeElement;
    if (isField(el)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    if (!isField(el)) return;
    if (el.tagName === 'INPUT' && !el.hasAttribute('enterkeyhint')) el.setAttribute('enterkeyhint', 'done');
    // Espera a que el teclado termine de abrir.
    setTimeout(show, 350);
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target as Element;
    // Dentro de un formulario (PIN), Enter ya lo envía.
    if (e.key !== 'Enter' || e.defaultPrevented || el.tagName !== 'INPUT' || !isField(el) || el.closest('form')) return;
    // "Listo": confirma lo escrito (los campos de importe se guardan al salir) y cierra el teclado.
    (el as HTMLInputElement).blur();
  });
  let tallest = window.innerHeight;
  window.addEventListener('resize', () => {
    tallest = Math.max(tallest, window.innerHeight);
    const open = isField(document.activeElement) && window.innerHeight < tallest - 150;
    document.body.classList.toggle('kb-open', open);
    if (open) show();
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('kb-open'); }, 100));
}
