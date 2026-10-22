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
  const app = { name: decodeString(appMatch[1], appLine.number), title: '', description: '', button: '', theme: 'oscuro', variables: {}, types: {}, functions: {}, conditions: [], imports: [], tables: {}, forms: [], queries: [], parameters: {} };
  let buttonOpen = false, tableOpen = '', formOpen = '', appClosed = false, locationPermission = false, showCoordinates = false, closeIndex = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (tableOpen) {
      if (line.text === '}') { tableOpen = ''; continue; }
      const field = line.text.match(/^campo\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(texto|numero|booleano)(?:\s+(clave))?$/);
      if (!field) lineError(line.number, 'campo inválido; usa campo nombre: texto|numero|booleano [clave].');
      const table = app.tables[tableOpen];
      if (table.fields.some(item => item.name === field[1])) lineError(line.number, `el campo "${field[1]}" ya existe en ${tableOpen}.`);
      if (table.fields.length >= 32) lineError(line.number, 'cada tabla admite un máximo de 32 campos.');
      if (field[3] && table.fields.some(item => item.primary)) lineError(line.number, `la tabla "${tableOpen}" ya tiene una clave primaria.`);
      table.fields.push({ name: field[1], type: field[2], primary: Boolean(field[3]) });
      continue;
    }
    if (formOpen) {
      if (line.text === '}') { formOpen = ''; continue; }
      const field = line.text.match(new RegExp(`^campo\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+${quoted}(?:\\s+(requerido|opcional))?$`));
      if (!field) lineError(line.number, 'campo de formulario inválido; usa campo nombre "Etiqueta" [requerido|opcional].');
      const schemaField = app.tables[formOpen]?.fields.find(item => item.name === field[1]);
      if (!schemaField) lineError(line.number, `el campo "${field[1]}" no existe en la tabla "${formOpen}".`);
      if (schemaField.primary && schemaField.type === 'numero') lineError(line.number, 'la clave numérica se genera automáticamente y no va en el formulario.');
      const form = app.forms.find(item => item.table === formOpen);
      if (form.fields.some(item => item.name === field[1])) lineError(line.number, `el campo "${field[1]}" ya está en el formulario.`);
      if (form.fields.length >= 16) lineError(line.number, 'cada formulario admite un máximo de 16 campos.');
      form.fields.push({ name: field[1], label: decodeString(field[2], line.number), required: field[3] !== 'opcional', type: schemaField.type });
      continue;
    }
    if (buttonOpen && line.text === '}') { buttonOpen = false; continue; }
    if (!buttonOpen && line.text === '}') { appClosed = true; closeIndex = index; break; }
    if (buttonOpen && line.text === 'permiso ubicacion al_pulsar') { locationPermission = true; continue; }
    if (buttonOpen && line.text === 'mostrar coordenadas') { showCoordinates = true; continue; }
    if (buttonOpen) lineError(line.number, 'instrucción desconocida dentro de boton.');

    let match = line.text.match(/^tabla\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/);
    if (match) {
      if (!app.imports.includes('datos')) lineError(line.number, 'importa primero "datos" para declarar tablas.');
      if (Object.hasOwn(app.tables, match[1])) lineError(line.number, `la tabla "${match[1]}" ya existe.`);
      app.tables[match[1]] = { fields: [] }; tableOpen = match[1]; continue;
    }
    match = line.text.match(/^formulario\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/);
    if (match) {
      if (!app.imports.includes('datos')) lineError(line.number, 'importa primero "datos" para declarar formularios.');
      if (!app.tables[match[1]]) lineError(line.number, `declara primero la tabla "${match[1]}".`);
      if (app.forms.some(form => form.table === match[1])) lineError(line.number, `la tabla "${match[1]}" ya tiene un formulario.`);
      app.forms.push({ table: match[1], fields: [] }); formOpen = match[1]; continue;
    }
    match = line.text.match(/^parametro\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(texto|numero|booleano)\s*=\s*(.+)$/);
    if (match) {
      if (!app.imports.includes('datos')) lineError(line.number, 'importa primero "datos" para declarar parámetros.');
      if (Object.hasOwn(app.parameters, match[1])) lineError(line.number, `el parámetro "${match[1]}" ya existe.`);
      const value = resolveValue(match[3], app.variables, app.functions, line.number);
      const type = match[2];
      if (type === 'texto' ? typeof value !== 'string' : type === 'numero' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'boolean') lineError(line.number, `el valor del parámetro debe ser ${type}.`);
      app.parameters[match[1]] = { type, value }; continue;
    }
    match = line.text.match(/^consulta\s+([A-Za-z_][A-Za-z0-9_]*)\s+selecciona\s+(\*|[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)(?:\s+donde\s+([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=|<|>|<=|>=)\s*(?::([A-Za-z_][A-Za-z0-9_]*)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?)|(verdadero|falso)))?\s+limite\s+(\d+)$/);
    if (match) {
      if (!app.imports.includes('datos')) lineError(line.number, 'importa primero "datos" para declarar consultas.');
      const table = app.tables[match[1]];
      if (!table) lineError(line.number, `la tabla "${match[1]}" no existe.`);
      const fields = match[2] === '*' ? table.fields.map(field => field.name) : match[2].split(',').map(field => field.trim());
      for (const field of fields) if (!table.fields.some(item => item.name === field)) lineError(line.number, `el campo de consulta "${field}" no existe en ${match[1]}.`);
      let filter = null;
      if (match[3]) {
        const schemaField = table.fields.find(item => item.name === match[3]);
        let value, type;
        if (match[5]) {
          if (!Object.hasOwn(app.parameters, match[5])) lineError(line.number, `el parámetro ":${match[5]}" no existe.`);
          ({ value, type } = app.parameters[match[5]]);
        } else if (match[6]) { value = decodeString(match[6], line.number); type = 'texto'; }
        else if (match[7]) { value = Number(match[7]); type = 'numero'; }
        else { value = match[8] === 'verdadero'; type = 'booleano'; }
        if (schemaField.type !== type) lineError(line.number, `el filtro debe ser de tipo ${schemaField.type}.`);
        filter = { field: match[3], operator: match[4], value };
      }
      const limit = Number(match[10] || match[9]);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) lineError(line.number, 'el límite de consulta debe estar entre 1 y 100.');
      app.queries.push({ table: match[1], fields, filter, limit }); continue;
    }

    match = line.text.match(/^titulo\s+(.+)$/);
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
      if (['texto', 'numeros', 'datos'].includes(moduleName)) { app.imports.push(moduleName); app.functions.__modules = app.imports; continue; }
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
  if (tableOpen) throw new SyntaxError(`Falta cerrar la tabla "${tableOpen}" con }.`);
  if (formOpen) throw new SyntaxError(`Falta cerrar el formulario "${formOpen}" con }.`);
  if (!appClosed) throw new SyntaxError('Falta cerrar el bloque de aplicacion con }.');
  if (closeIndex !== lines.length - 1) lineError(lines[closeIndex + 1].number, 'hay instrucciones después del cierre de la aplicación.');
  if (!app.name || !app.title || !app.description || !app.button) throw new SyntaxError('La aplicación necesita nombre, titulo, descripcion y boton.');
  if (!locationPermission || !showCoordinates) throw new SyntaxError('El botón debe declarar permiso ubicacion al_pulsar y mostrar coordenadas.');
  for (const [name, table] of Object.entries(app.tables)) {
    if (!table.fields.length) throw new SyntaxError(`La tabla "${name}" debe declarar al menos un campo.`);
    if (table.fields.filter(field => field.primary).length > 1) throw new SyntaxError(`La tabla "${name}" solo puede tener una clave primaria.`);
  }
  for (const form of app.forms) if (!form.fields.length) throw new SyntaxError(`El formulario "${form.table}" debe tener al menos un campo.`);
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
  const dataModel = JSON.stringify({ app: app.name, tables: app.tables, forms: app.forms, queries: app.queries }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const dataScript = `if(MODEL.tables&&Object.keys(MODEL.tables).length){const root=document.querySelector('#data-ui'),key='zafiro.webscript.'+encodeURIComponent(MODEL.app);const read=name=>{try{const rows=JSON.parse(localStorage.getItem(key+'.'+name)||'[]');if(!Array.isArray(rows))return[];const schema=MODEL.tables[name].fields;return rows.slice(0,500).filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&schema.every(field=>field.primary&&field.type==='numero'?Number.isSafeInteger(row[field.name])&&row[field.name]>0:field.type==='texto'?typeof row[field.name]==='string'&&row[field.name].length<=200:field.type==='numero'?typeof row[field.name]==='number'&&Number.isFinite(row[field.name]):typeof row[field.name]==='boolean'));}catch{return[]}};const write=(name,rows)=>localStorage.setItem(key+'.'+name,JSON.stringify(rows));const heading=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el};const cell=(row,name)=>{const td=document.createElement('td');td.textContent=row[name]===undefined?'':String(row[name]);return td};const render=()=>{root.replaceChildren();for(const form of MODEL.forms){const schema=MODEL.tables[form.table],formEl=document.createElement('form');formEl.append(heading('h3','Agregar a '+form.table));const inputs={};for(const field of form.fields){const label=document.createElement('label');label.append(document.createTextNode(field.label+' '));const input=document.createElement('input');input.name=field.name;input.required=field.required;input.maxLength=200;if(field.type==='numero')input.type='number';else if(field.type==='booleano')input.type='checkbox';else input.type=/correo|email/i.test(field.name)?'email':'text';inputs[field.name]=input;label.append(input);formEl.append(label,document.createElement('br'));}const consent=document.createElement('input');consent.type='checkbox';consent.required=true;const consentLabel=document.createElement('label');consentLabel.append(consent,document.createTextNode(' Autorizo guardar estos datos en este dispositivo.'));formEl.append(consentLabel,document.createElement('br'));const submit=document.createElement('button');submit.type='submit';submit.textContent='Guardar';formEl.append(submit);const status=heading('p','');status.setAttribute('role','status');formEl.append(status);formEl.addEventListener('submit',event=>{event.preventDefault();if(!consent.checked)return;const rows=read(form.table);if(rows.length>=500){status.textContent='Se alcanzó el límite local de 500 registros.';return;}const record={};for(const field of form.fields){const input=inputs[field.name];record[field.name]=field.type==='booleano'?input.checked:field.type==='numero'?Number(input.value):input.value.trim();if(typeof record[field.name]==='string'&&record[field.name].length>200){status.textContent='El texto excede 200 caracteres.';return;}if(field.type==='numero'&&!Number.isFinite(record[field.name])){status.textContent='Ingresa un número válido.';return;}}const primary=schema.fields.find(field=>field.primary);if(primary){if(primary.type==='numero')record[primary.name]=rows.reduce((max,row)=>Math.max(max,Number(row[primary.name])||0),0)+1;else if(rows.some(row=>row[primary.name]===record[primary.name])){status.textContent='La clave ya existe.';return;}}rows.push(record);try{write(form.table,rows);formEl.reset();status.textContent='Registro guardado en este dispositivo.';render();}catch{status.textContent='No fue posible guardar; el almacenamiento local puede estar lleno o deshabilitado.';}});root.append(formEl);}for(const query of MODEL.queries){root.append(heading('h3','Consulta: '+query.table));const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');for(const field of query.fields)tr.append(heading('th',field));thead.append(tr);table.append(thead);const body=document.createElement('tbody');let rows=read(query.table);if(query.filter){const f=query.filter;rows=rows.filter(row=>{const value=row[f.field];switch(f.operator){case'==':return value===f.value;case'!=':return value!==f.value;case'<':return value<f.value;case'>':return value>f.value;case'<=':return value<=f.value;case'>=':return value>=f.value;default:return false;}});}for(const row of rows.slice(0,query.limit)){const tr=document.createElement('tr');for(const field of query.fields)tr.append(cell(row,field));body.append(tr);}table.append(body);root.append(table);}for(const [name] of Object.entries(MODEL.tables)){const remove=document.createElement('button');remove.type='button';remove.textContent='Borrar datos de '+name;remove.addEventListener('click',()=>{if(confirm('¿Borrar todos los datos guardados en este navegador?')){localStorage.removeItem(key+'.'+name);render();}});root.append(remove);}};render();}`;
  const databaseMarkup = Object.keys(app.tables).length ? '<section id="database" aria-label="Datos locales"><h2>Datos de esta aplicación</h2><p>Los registros se guardan solo en este navegador. No se envían a un servidor.</p><div id="data-ui"></div></section>' : '';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${app.theme === 'claro' ? 'light' : 'dark'}"><meta name="theme-color" content="${colors.background}"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><title>${escapeHtml(app.title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colors.background};color:${colors.foreground};font:16px/1.6 system-ui,sans-serif}.app{width:min(560px,calc(100% - 40px));padding:28px 0}h1{font-size:clamp(32px,8vw,48px);line-height:1.08;letter-spacing:-.04em}p{color:${colors.muted}}button{border:0;border-radius:8px;background:${colors.accent};color:${app.theme === 'claro' ? '#fff' : '#10231d'};font:700 15px system-ui;padding:13px 18px;cursor:pointer}button:focus-visible{outline:3px solid ${colors.foreground};outline-offset:3px}#result{margin-top:22px;overflow-wrap:anywhere}.privacy{font-size:12px;border-top:1px solid ${colors.muted}55;padding-top:14px}</style></head>
<body><main class="app"><p>${escapeHtml(app.name)}</p><h1>${escapeHtml(app.title)}</h1><p>${escapeHtml(app.description)}</p><button id="locate" type="button">${escapeHtml(app.button)}</button><p id="result" role="status" aria-live="polite">La ubicación aparecerá aquí solo si das permiso.</p>${databaseMarkup}<p class="privacy">Esta app solicita la ubicación solo al pulsar el botón. Los datos de formularios requieren consentimiento y permanecen en este navegador; no se envían a un servidor.</p></main>
<script>const MODEL=${dataModel};const button=document.querySelector('#locate');const result=document.querySelector('#result');button.addEventListener('click',()=>{if(!('geolocation' in navigator)){result.textContent='Este navegador no ofrece geolocalización.';return;}button.disabled=true;result.textContent='Esperando permiso y ubicación…';navigator.geolocation.getCurrentPosition(position=>{result.textContent='Latitud: '+position.coords.latitude+' · Longitud: '+position.coords.longitude+' · Precisión aproximada: '+Math.round(position.coords.accuracy)+' m';button.disabled=false;},error=>{result.textContent=error.code===1?'No se concedió el permiso de ubicación.':error.code===2?'El dispositivo no pudo determinar la ubicación.':'La solicitud de ubicación agotó el tiempo.';button.disabled=false;},{enableHighAccuracy:false,maximumAge:0,timeout:15000});});${dataScript}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});</script></body></html>`;
}

export function createZafiroPwaAssets(source) {
  const app = parseZafiroWebScript(source);
  const manifest = JSON.stringify({ name: app.title, short_name: app.name.slice(0, 12), start_url: './zafiro-app.html', scope: './', display: 'standalone', background_color: app.theme === 'claro' ? '#f4f7f5' : '#10191d', theme_color: app.theme === 'claro' ? '#f4f7f5' : '#10191d', icons: [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] }, null, 2);
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${app.theme === 'claro' ? '#147a56' : '#10191d'}"/><path d="M64 14 112 64 64 114 16 64z" fill="${app.theme === 'claro' ? '#fff' : '#a6efd0'}"/><path d="m64 34 28 30-28 30-28-30z" fill="${app.theme === 'claro' ? '#147a56' : '#10191d'}"/></svg>`;
  const serviceWorker = `const CACHE='zafiro-${encodeURIComponent(app.name).replace(/%/g, '')}-v1';const FILES=['./zafiro-app.html','./manifest.webmanifest','./icon.svg'];self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{if(event.request.method==='GET')event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});`;
  return { manifest, icon, serviceWorker };
}
