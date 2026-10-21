const copyButton = document.querySelector('[data-copy="snippet"]');
const toast = document.querySelector('.toast');
let toastTimer;

copyButton?.addEventListener('click', async () => {
  const source = document.querySelector('#snippet')?.innerText ?? '';
  try {
    await navigator.clipboard.writeText(source);
    copyButton.textContent = 'Copiado';
    toast.textContent = 'Código copiado al portapapeles';
  } catch {
    copyButton.textContent = 'Selecciona el código';
    toast.textContent = 'Selecciona el bloque de código para copiarlo';
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    copyButton.textContent = 'Copiar código';
  }, 2200);
});
