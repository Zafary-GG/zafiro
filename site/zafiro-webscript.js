const stringLiteral = '("(?:\\\\.|[^"\\\\])*")';

function readString(literal, lineNumber) {
  try { return JSON.parse(literal); }
  catch { throw new SyntaxError(`Línea ${lineNumber}: texto entre comillas no válido.`); }
}

export function parseZafiroWebScript(source) {
  if (typeof source !== 'string') throw new TypeError('El programa debe ser texto.');
  const lines = source.split(/\r?\n/).map((text, index) => ({ text: text.trim(), number: index + 1 }))
    .filter(line => line.text && !line.text.startsWith('#'));
  const appLine = lines[0];
  const appMatch = appLine?.text.match(new RegExp(`^aplicacion\\s+${stringLiteral}\\s*\\{$`));
  if (!appMatch) throw new SyntaxError('Línea 1: se esperaba aplicacion "Nombre" {');
  const app = { name: readString(appMatch[1], appLine.number), title: '', description: '', button: '', theme: 'oscuro' };
  let buttonOpen = false, appClosed = false, locationPermission = false, showCoordinates = false, closeIndex = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const title = line.text.match(new RegExp(`^titulo\\s+${stringLiteral}$`));
    const description = line.text.match(new RegExp(`^descripcion\\s+${stringLiteral}$`));
    const theme = line.text.match(/^tema\s+(oscuro|claro)$/);
    const button = line.text.match(new RegExp(`^boton\\s+${stringLiteral}\\s*\\{$`));
    if (buttonOpen && line.text === '}') { buttonOpen = false; continue; }
    if (!buttonOpen && line.text === '}') { appClosed = true; closeIndex = index; break; }
    if (title && !buttonOpen) app.title = readString(title[1], line.number);
    else if (description && !buttonOpen) app.description = readString(description[1], line.number);
    else if (theme && !buttonOpen) app.theme = theme[1];
    else if (button && !buttonOpen) { app.button = readString(button[1], line.number); buttonOpen = true; }
    else if (buttonOpen && line.text === 'permiso ubicacion al_pulsar') locationPermission = true;
    else if (buttonOpen && line.text === 'mostrar coordenadas') showCoordinates = true;
    else throw new SyntaxError(`Línea ${line.number}: instrucción desconocida o fuera de lugar.`);
  }
  if (buttonOpen) throw new SyntaxError('Falta cerrar el bloque del botón con }.');
  if (!appClosed) throw new SyntaxError('Falta cerrar el bloque de aplicacion con }.');
  if (closeIndex !== lines.length - 1) throw new SyntaxError(`Línea ${lines[closeIndex + 1].number}: hay instrucciones después del cierre de la aplicación.`);
  if (!app.name || !app.title || !app.description || !app.button) throw new SyntaxError('La aplicación necesita nombre, titulo, descripcion y boton.');
  if (!locationPermission || !showCoordinates) throw new SyntaxError('El botón debe declarar permiso ubicacion al_pulsar y mostrar coordenadas.');
  app.theme = app.theme === 'claro' ? 'claro' : 'oscuro';
  return app;
}

export function compileZafiroWebScript(source) {
  const app = parseZafiroWebScript(source);
  const escapeHtml = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const colors = app.theme === 'claro'
    ? { background: '#f4f7f5', foreground: '#15231e', muted: '#53645d', accent: '#147a56' }
    : { background: '#10191d', foreground: '#eaf1ed', muted: '#aab9b4', accent: '#a6efd0' };
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${app.theme === 'claro' ? 'light' : 'dark'}"><title>${escapeHtml(app.title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colors.background};color:${colors.foreground};font:16px/1.6 system-ui,sans-serif}.app{width:min(560px,calc(100% - 40px));padding:28px 0}h1{font-size:clamp(32px,8vw,48px);line-height:1.08;letter-spacing:-.04em}p{color:${colors.muted}}button{border:0;border-radius:8px;background:${colors.accent};color:${app.theme === 'claro' ? '#fff' : '#10231d'};font:700 15px system-ui;padding:13px 18px;cursor:pointer}button:focus-visible{outline:3px solid ${colors.foreground};outline-offset:3px}#result{margin-top:22px;overflow-wrap:anywhere}.privacy{font-size:12px;border-top:1px solid ${colors.muted}55;padding-top:14px}</style></head>
<body><main class="app"><p>${escapeHtml(app.name)}</p><h1>${escapeHtml(app.title)}</h1><p>${escapeHtml(app.description)}</p><button id="locate" type="button">${escapeHtml(app.button)}</button><p id="result" role="status" aria-live="polite">La ubicación aparecerá aquí solo si das permiso.</p><p class="privacy">Esta app solicita una lectura de ubicación cuando pulsas el botón. Las coordenadas se muestran en este dispositivo y no se envían a un servidor.</p></main>
<script>const button=document.querySelector('#locate');const result=document.querySelector('#result');button.addEventListener('click',()=>{if(!('geolocation' in navigator)){result.textContent='Este navegador no ofrece geolocalización.';return;}button.disabled=true;result.textContent='Esperando permiso y ubicación…';navigator.geolocation.getCurrentPosition(position=>{result.textContent='Latitud: '+position.coords.latitude+' · Longitud: '+position.coords.longitude+' · Precisión aproximada: '+Math.round(position.coords.accuracy)+' m';button.disabled=false;},error=>{result.textContent=error.code===1?'No se concedió el permiso de ubicación.':error.code===2?'El dispositivo no pudo determinar la ubicación.':'La solicitud de ubicación agotó el tiempo.';button.disabled=false;},{enableHighAccuracy:false,maximumAge:0,timeout:15000});});</script></body></html>`;
}
