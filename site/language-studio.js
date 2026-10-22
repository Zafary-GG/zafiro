import { compileZafiroWebScript, parseZafiroWebScript } from './zafiro-webscript.js';

const example = `aplicacion "Mi app" {
  titulo "Una idea en marcha"
  descripcion "Una pequeña aplicación web hecha con Zafiro."
  tema oscuro
  boton "Compartir mi ubicación" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`;

const source = document.querySelector('#source');
const preview = document.querySelector('#preview');
const status = document.querySelector('#compiler-status');
source.value = example;

function requestLocation(button, result) {
  if (!('geolocation' in navigator)) {
    result.textContent = 'Este navegador no ofrece geolocalización.';
    return;
  }
  button.disabled = true;
  result.textContent = 'Esperando permiso y ubicación…';
  navigator.geolocation.getCurrentPosition(position => {
    result.textContent = `Latitud: ${position.coords.latitude} · Longitud: ${position.coords.longitude} · Precisión aproximada: ${Math.round(position.coords.accuracy)} m`;
    button.disabled = false;
  }, error => {
    result.textContent = error.code === 1 ? 'No se concedió el permiso de ubicación.' : error.code === 2 ? 'El dispositivo no pudo determinar la ubicación.' : 'La solicitud de ubicación agotó el tiempo.';
    button.disabled = false;
  }, { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 });
}

function renderPreview() {
  const app = parseZafiroWebScript(source.value);
  preview.replaceChildren();
  preview.dataset.theme = app.theme;
  const content = document.createElement('div');
  content.className = 'preview-content';
  const brand = document.createElement('p'); brand.className = 'preview-brand'; brand.textContent = app.name;
  const heading = document.createElement('h3'); heading.textContent = app.title;
  const description = document.createElement('p'); description.className = 'preview-description'; description.textContent = app.description;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'preview-locate'; button.textContent = app.button;
  const result = document.createElement('p'); result.className = 'preview-result'; result.setAttribute('role', 'status'); result.textContent = 'La ubicación aparecerá aquí solo si das permiso.';
  const privacy = document.createElement('p'); privacy.className = 'preview-privacy'; privacy.textContent = 'La ubicación se pide al pulsar el botón y se muestra en este dispositivo.';
  button.addEventListener('click', () => requestLocation(button, result));
  content.append(brand, heading, description, button, result, privacy);
  preview.append(content);
  status.textContent = 'Compilación correcta. La vista previa se actualizó.';
}

document.querySelector('#preview-button').addEventListener('click', () => {
  try { renderPreview(); }
  catch (error) { status.textContent = error.message; }
});

document.querySelector('#download-button').addEventListener('click', () => {
  try {
    const html = compileZafiroWebScript(source.value);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'zafiro-app.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'App compilada y descargada como zafiro-app.html.';
  } catch (error) { status.textContent = error.message; }
});

renderPreview();
