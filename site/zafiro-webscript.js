const quoted = '("(?:\\\\.|[^"\\\\])*")';

function lineError(line, message) { throw new SyntaxError(`Línea ${line}: ${message}`); }
function decodeString(literal, line) {
  try { return JSON.parse(literal); } catch { lineError(line, 'cadena de texto no válida.'); }
}

function tokenizeExpression(source, line) {
  const tokens = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?)|("(?:\\.|[^"\\])*"))|\s*(==|!=|<=|>=|[()+*/<>-])|\s*([A-Za-z_][A-Za-z0-9_]*)/gy;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match || match.index !== index) lineError(line, 'expresión no válida.');
    const [raw, number, string, operator, identifier] = match;
    tokens.push({ type: number ? 'number' : string ? 'string' : identifier ? 'identifier' : 'operator', value: number ? Number(number) : string ? JSON.parse(string) : identifier || operator });
    index = pattern.lastIndex;
  }
  return tokens;
}

function evaluateExpression(source, variables, line) {
  const tokens = tokenizeExpression(source, line);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = value => { if (peek()?.value === value) { cursor += 1; return true; } return false; };
  const primary = () => {
    const token = peek();
    if (take('(')) { const value = comparison(); if (!take(')')) lineError(line, 'falta cerrar paréntesis.'); return value; }
    if (token?.type === 'number' || token?.type === 'string') { cursor += 1; return token.value; }
    if (token?.type === 'identifier' && ['verdadero', 'falso'].includes(token.value)) { cursor += 1; return token.value === 'verdadero'; }
    if (token?.type === 'identifier') {
      cursor += 1;
      if (!Object.hasOwn(variables, token.value)) lineError(line, `la variable "${token.value}" no existe.`);
      return variables[token.value];
    }
    lineError(line, 'se esperaba un número, texto, variable o paréntesis.');
  };
  const unary = () => take('-') ? -Number(unary()) : primary();
  const product = () => {
    let value = unary();
    while (peek()?.value === '*' || peek()?.value === '/') {
      const op = tokens[cursor++].value, right = unary();
      if (op === '/' && right === 0) lineError(line, 'no se puede dividir entre cero.');
      value = op === '*' ? Number(value) * Number(right) : Number(value) / Number(right);
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (peek()?.value === '+' || peek()?.value === '-') {
      const op = tokens[cursor++].value, right = product();
      value = op === '+' && (typeof value === 'string' || typeof right === 'string') ? String(value) + String(right) : op === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
    }
    return value;
  };
  const comparison = () => {
    const left = sum(), op = peek()?.value;
    if (!['==', '!=', '<', '>', '<=', '>='].includes(op)) return left;
    cursor += 1;
    const right = sum();
    if (op === '==') return left === right;
    if (op === '!=') return left !== right;
    if (op === '<') return left < right;
    if (op === '>') return left > right;
    if (op === '<=') return left <= right;
    return left >= right;
  };
  const value = comparison();
  if (cursor !== tokens.length) lineError(line, 'sobran elementos en la expresión.');
  return value;
}

function resolveValue(source, variables, functions, line, depth = 0) {
  if (depth > 16) lineError(line, 'las llamadas a funciones superan el límite de seguridad.');
  const call = source.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (!call) return evaluateExpression(source, variables, line);
  const standard = {
    mayusculas: ['texto', value => String(value).toLocaleUpperCase('es')],
    minusculas: ['texto', value => String(value).toLocaleLowerCase('es')],
    longitud: ['texto', value => String(value).length],
    redondear: ['numeros', value => Math.round(Number(value))],
    minimo: ['numeros', (value, other) => Math.min(Number(value), Number(other))],
    maximo: ['numeros', (value, other) => Math.max(Number(value), Number(other))]
  };
  if (Object.hasOwn(standard, call[1])) {
    if (!functions.__modules?.includes(standard[call[1]][0])) lineError(line, `importa primero el módulo "${standard[call[1]][0]}" para usar "${call[1]}".`);
    const args = call[2].split(',').map(value => resolveValue(value.trim(), variables, functions, line, depth + 1));
    const needsTwo = ['minimo', 'maximo'].includes(call[1]);
    if (args.length !== (needsTwo ? 2 : 1)) lineError(line, `la función estándar "${call[1]}" recibió una cantidad incorrecta de argumentos.`);
    return standard[call[1]][1](...args);
  }
  const fn = functions[call[1]];
  if (!fn) lineError(line, `la función "${call[1]}" no existe.`);
  const arg = resolveValue(call[2], variables, functions, line, depth + 1);
  return executeFunction(fn, arg, functions, line, depth + 1);
}

function executeFunction(fn, arg, functions, line, depth) {
  const local = { ...fn.variables, [fn.parameter]: arg };
  return resolveValue(fn.expression, local, functions, fn.line ?? line, depth);
}

function displayValue(source, variables, functions, line) {
  const literal = source.match(new RegExp(`^${quoted}$`));
  if (literal) return interpolate(decodeString(literal[1], line), variables, functions, line);
  const interpolation = source.match(/^\{\{\s*(.+?)\s*\}\}$/);
  if (!interpolation) lineError(line, 'el texto debe estar entre comillas o usar {{ expresion }}.');
  return String(resolveValue(interpolation[1], variables, functions, line));
}

function interpolate(text, variables, functions, line) {
  return text.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expression) => String(resolveValue(expression, variables, functions, line)));
}

export function parseZafiroWebScript(source) {
  if (typeof source !== 'string') throw new TypeError('El programa debe ser texto.');
  const sourceLines = source.split(/\r?\n/).map((text, index) => ({ text: text.trim(), number: index + 1 }))
    .filter(line => line.text && !line.text.startsWith('#'));
  const modules = Object.create(null), lines = [];
  let currentModule = null, appStarted = false;
  for (const line of sourceLines) {
    if (!appStarted && !currentModule) {
      const declaration = line.text.match(/^modulo\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/);
      if (declaration) { currentModule = { name: declaration[1], statements: [], line: line.number }; continue; }
      if (/^aplicacion\s+/.test(line.text)) appStarted = true;
      else lineError(line.number, 'antes de aplicacion solo se permiten bloques modulo.');
    } else if (currentModule) {
      if (line.text === '}') {
        if (Object.hasOwn(modules, currentModule.name)) lineError(currentModule.line, `el módulo "${currentModule.name}" ya está declarado.`);
        modules[currentModule.name] = currentModule.statements;
        currentModule = null;
      } else {
        if (!/^(?:variable\s+|funcion\s+|tipo\s+)/.test(line.text)) lineError(line.number, 'un módulo solo puede declarar variables, funciones y tipos.');
        currentModule.statements.push(line);
      }
      continue;
    }
    lines.push(line);
  }
  if (currentModule) throw new SyntaxError(`Falta cerrar el bloque modulo "${currentModule.name}".`);
  const appLine = lines[0];
  const appMatch = appLine?.text.match(new RegExp(`^aplicacion\\s+${quoted}\\s*\\{$`));
  if (!appMatch) lineError(appLine?.number ?? 1, 'se esperaba aplicacion "Nombre" {');
  const app = { name: decodeString(appMatch[1], appLine.number), title: '', description: '', button: '', theme: 'oscuro', variables: {}, types: {}, functions: {}, conditions: [], imports: [] };
  let buttonOpen = false, appClosed = false, locationPermission = false, showCoordinates = false, closeIndex = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (buttonOpen && line.text === '}') { buttonOpen = false; continue; }
    if (!buttonOpen && line.text === '}') { appClosed = true; closeIndex = index; break; }
    if (buttonOpen && line.text === 'permiso ubicacion al_pulsar') { locationPermission = true; continue; }
    if (buttonOpen && line.text === 'mostrar coordenadas') { showCoordinates = true; continue; }
    if (buttonOpen) lineError(line.number, 'instrucción desconocida dentro de boton.');

    let match = line.text.match(/^titulo\s+(.+)$/);
    if (match) { app.title = displayValue(match[1], app.variables, app.functions, line.number); continue; }
    match = line.text.match(/^descripcion\s+(.+)$/);
    if (match) { app.description = displayValue(match[1], app.variables, app.functions, line.number); continue; }
    match = line.text.match(/^tema\s+(oscuro|claro)$/);
    if (match) { app.theme = match[1]; continue; }
    match = line.text.match(/^usar\s+([A-Za-z_][A-Za-z0-9_]*)$/);
    if (match) {
      const moduleName = match[1];
      if (app.imports.includes(moduleName)) lineError(line.number, `el módulo "${moduleName}" ya se importó.`);
      if (Object.hasOwn(modules, moduleName)) {
        app.imports.push(moduleName);
        lines.splice(index, 1, ...modules[moduleName]);
        index -= 1;
        continue;
      }
      if (['texto', 'numeros'].includes(moduleName)) { app.imports.push(moduleName); app.functions.__modules = app.imports; continue; }
      lineError(line.number, `el módulo "${moduleName}" no está declarado en este archivo ni en la biblioteca estándar.`);
    }
    match = line.text.match(/^repetir\s+([A-Za-z_][A-Za-z0-9_]*)\s+desde\s+(.+?)\s+hasta\s+(.+?)\s+entonces\s+variable\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) {
      const start = resolveValue(match[2], app.variables, app.functions, line.number), end = resolveValue(match[3], app.variables, app.functions, line.number);
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 100) lineError(line.number, 'el ciclo requiere enteros ascendentes con un máximo de 101 iteraciones.');
      if (match[1] === match[4]) lineError(line.number, 'el índice del ciclo y la variable acumuladora deben ser distintos.');
      if (!Object.hasOwn(app.variables, match[4])) lineError(line.number, `declara primero la variable acumuladora "${match[4]}".`);
      if (typeof app.variables[match[4]] !== 'number') lineError(line.number, 'la variable acumuladora del ciclo debe ser numerica.');
      for (let value = start; value <= end; value += 1) {
        app.variables[match[1]] = value;
        const result = resolveValue(match[5], app.variables, app.functions, line.number);
        if (typeof result !== 'number' || !Number.isFinite(result)) lineError(line.number, 'el ciclo debe producir un resultado numerico finito.');
        app.variables[match[4]] = result;
      }
      continue;
    }
    match = line.text.match(/^boton\s+(.+)\s+\{$/);
    if (match) { app.button = displayValue(match[1], app.variables, app.functions, line.number); buttonOpen = true; continue; }
    match = line.text.match(/^tipo\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(texto|numero|booleano)$/);
    if (match) { if (Object.hasOwn(app.types, match[1])) lineError(line.number, `el tipo "${match[1]}" ya está declarado.`); app.types[match[1]] = match[2]; continue; }
    match = line.text.match(/^variable\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?\s*=\s*(.+)$/);
    if (match) {
      if (Object.hasOwn(app.variables, match[1])) lineError(line.number, `la variable "${match[1]}" ya fue declarada.`);
      const value = resolveValue(match[3], app.variables, app.functions, line.number);
      const expected = match[2] ? (app.types[match[2]] ?? match[2]) : null;
      if (match[2] && !['texto', 'numero', 'booleano'].includes(expected)) lineError(line.number, `el tipo "${match[2]}" no está declarado.`);
      if (expected && (expected === 'texto' ? typeof value !== 'string' : expected === 'numero' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'boolean')) lineError(line.number, `el valor de "${match[1]}" no coincide con el tipo ${expected}.`);
      app.variables[match[1]] = value;
      if (expected) app.types[match[1]] = expected;
      continue;
    }
    match = line.text.match(/^funcion\s+([A-Za-z_][A-Za-z0-9_]*)\(([A-Za-z_][A-Za-z0-9_]*)\)\s*=\s*(.+)$/);
    if (match) {
      if (Object.hasOwn(app.functions, match[1])) lineError(line.number, `la función "${match[1]}" ya fue declarada.`);
      app.functions[match[1]] = { parameter: match[2], expression: match[3], variables: { ...app.variables }, line: line.number };
      continue;
    }
    match = line.text.match(/^si\s+(.+?)\s+entonces\s+(titulo|descripcion|boton)\s+(.+)$/);
    if (match) {
      const stringValue = match[3].match(new RegExp(`^${quoted}$`));
      const assignment = stringValue ? interpolate(decodeString(stringValue[1], line.number), app.variables, app.functions, line.number) : resolveValue(match[3], app.variables, app.functions, line.number);
      app.conditions.push({ condition: match[1], target: match[2], value: assignment, line: line.number });
      continue;
    }
    lineError(line.number, 'instrucción desconocida o fuera de lugar.');
  }
  if (buttonOpen) throw new SyntaxError('Falta cerrar el bloque del botón con }.');
  if (!appClosed) throw new SyntaxError('Falta cerrar el bloque de aplicacion con }.');
  if (closeIndex !== lines.length - 1) lineError(lines[closeIndex + 1].number, 'hay instrucciones después del cierre de la aplicación.');
  if (!app.name || !app.title || !app.description || !app.button) throw new SyntaxError('La aplicación necesita nombre, titulo, descripcion y boton.');
  if (!locationPermission || !showCoordinates) throw new SyntaxError('El botón debe declarar permiso ubicacion al_pulsar y mostrar coordenadas.');
  for (const condition of app.conditions) {
    const result = resolveValue(condition.condition, app.variables, app.functions, condition.line);
    if (typeof result !== 'boolean') lineError(condition.line, 'la condición debe producir verdadero o falso.');
    if (result) {
      const property = condition.target === 'titulo' ? 'title' : condition.target === 'descripcion' ? 'description' : 'button';
      app[property] = condition.value;
    }
  }
  app.theme = app.theme === 'claro' ? 'claro' : 'oscuro';
  return app;
}

export function compileZafiroWebScript(source) {
  const app = parseZafiroWebScript(source);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const colors = app.theme === 'claro'
    ? { background: '#f4f7f5', foreground: '#15231e', muted: '#53645d', accent: '#147a56' }
    : { background: '#10191d', foreground: '#eaf1ed', muted: '#aab9b4', accent: '#a6efd0' };
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${app.theme === 'claro' ? 'light' : 'dark'}"><meta name="theme-color" content="${colors.background}"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><title>${escapeHtml(app.title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colors.background};color:${colors.foreground};font:16px/1.6 system-ui,sans-serif}.app{width:min(560px,calc(100% - 40px));padding:28px 0}h1{font-size:clamp(32px,8vw,48px);line-height:1.08;letter-spacing:-.04em}p{color:${colors.muted}}button{border:0;border-radius:8px;background:${colors.accent};color:${app.theme === 'claro' ? '#fff' : '#10231d'};font:700 15px system-ui;padding:13px 18px;cursor:pointer}button:focus-visible{outline:3px solid ${colors.foreground};outline-offset:3px}#result{margin-top:22px;overflow-wrap:anywhere}.privacy{font-size:12px;border-top:1px solid ${colors.muted}55;padding-top:14px}</style></head>
<body><main class="app"><p>${escapeHtml(app.name)}</p><h1>${escapeHtml(app.title)}</h1><p>${escapeHtml(app.description)}</p><button id="locate" type="button">${escapeHtml(app.button)}</button><p id="result" role="status" aria-live="polite">La ubicación aparecerá aquí solo si das permiso.</p><p class="privacy">Esta app solicita una lectura de ubicación cuando pulsas el botón. Las coordenadas se muestran en este dispositivo y no se envían a un servidor.</p></main>
<script>const button=document.querySelector('#locate');const result=document.querySelector('#result');button.addEventListener('click',()=>{if(!('geolocation' in navigator)){result.textContent='Este navegador no ofrece geolocalización.';return;}button.disabled=true;result.textContent='Esperando permiso y ubicación…';navigator.geolocation.getCurrentPosition(position=>{result.textContent='Latitud: '+position.coords.latitude+' · Longitud: '+position.coords.longitude+' · Precisión aproximada: '+Math.round(position.coords.accuracy)+' m';button.disabled=false;},error=>{result.textContent=error.code===1?'No se concedió el permiso de ubicación.':error.code===2?'El dispositivo no pudo determinar la ubicación.':'La solicitud de ubicación agotó el tiempo.';button.disabled=false;},{enableHighAccuracy:false,maximumAge:0,timeout:15000});});if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});</script></body></html>`;
}

export function createZafiroPwaAssets(source) {
  const app = parseZafiroWebScript(source);
  const manifest = JSON.stringify({ name: app.title, short_name: app.name.slice(0, 12), start_url: './zafiro-app.html', scope: './', display: 'standalone', background_color: app.theme === 'claro' ? '#f4f7f5' : '#10191d', theme_color: app.theme === 'claro' ? '#f4f7f5' : '#10191d', icons: [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] }, null, 2);
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${app.theme === 'claro' ? '#147a56' : '#10191d'}"/><path d="M64 14 112 64 64 114 16 64z" fill="${app.theme === 'claro' ? '#fff' : '#a6efd0'}"/><path d="m64 34 28 30-28 30-28-30z" fill="${app.theme === 'claro' ? '#147a56' : '#10191d'}"/></svg>`;
  const serviceWorker = `const CACHE='zafiro-${encodeURIComponent(app.name).replace(/%/g, '')}-v1';const FILES=['./zafiro-app.html','./manifest.webmanifest','./icon.svg'];self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{if(event.request.method==='GET')event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});`;
  return { manifest, icon, serviceWorker };
}
