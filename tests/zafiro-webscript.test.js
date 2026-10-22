import test from 'node:test';
import assert from 'node:assert/strict';
import { compileZafiroWebScript, createZafiroPwaAssets, parseZafiroWebScript } from '../site/zafiro-webscript.js';

const valid = `aplicacion "Mi app" {
  titulo "Hola <Zafiro>"
  descripcion "Ejemplo"
  tema claro
  boton "Compartir" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`;

test('parsea las instrucciones básicas', () => {
  assert.deepEqual(parseZafiroWebScript(valid), {
    name: 'Mi app', title: 'Hola <Zafiro>', description: 'Ejemplo', button: 'Compartir', theme: 'claro',
    variables: {}, types: {}, functions: {}, conditions: [], imports: [], tables: {}, forms: [], queries: [], parameters: {}, webInspector: null
  });
});

test('evalúa variables, operaciones, precedencia y llamadas a función', () => {
  const app = parseZafiroWebScript(`aplicacion "Calculadora" {
  variable base = 2 + 3 * 4
  funcion duplicar(x) = x * 2
  titulo {{ duplicar(base) }}
  descripcion "Resultado calculado"
  tema oscuro
  boton "Compartir" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`);
  assert.equal(app.title, '28');
});

test('las condiciones verdaderas cambian textos; las falsas dejan el valor inicial', () => {
  const app = parseZafiroWebScript(`aplicacion "Condición" {
  variable puntos = 7
  titulo "Inicio"
  descripcion "Ejemplo"
  tema oscuro
  si puntos > 5 entonces titulo "Aprobado"
  si puntos < 5 entonces descripcion "No debe cambiar"
  boton "Compartir" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`);
  assert.equal(app.title, 'Aprobado');
  assert.equal(app.description, 'Ejemplo');
});

test('valida tipos y calcula un ciclo con tope de iteraciones', () => {
  const app = parseZafiroWebScript(`aplicacion "Tipos y ciclo" {
  variable saludo: texto = "hola"
  variable listo: booleano = verdadero
  variable total: numero = 0
  repetir i desde 1 hasta 5 entonces variable total = total + i
  titulo {{ mayusculas(saludo) }}
  descripcion "Listo"
  tema oscuro
  boton "Compartir" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`.replace('  titulo {{ mayusculas(saludo) }}', '  usar texto\n  titulo {{ mayusculas(saludo) }}'));
  assert.equal(app.title, 'HOLA');
  assert.equal(app.variables.total, 15);
  assert.equal(app.variables.i, 5);
  assert.equal(app.types.saludo, 'texto');
  assert.equal(app.types.listo, 'booleano');
});

test('provee módulos de estándar con importación explícita y valida tipo', () => {
  assert.throws(() => parseZafiroWebScript(`aplicacion "Error" {\n variable valor = mayusculas("a")\n titulo "A"\n descripcion "B"\n tema oscuro\n boton "Compartir" {\n permiso ubicacion al_pulsar\n mostrar coordenadas\n }\n}`), /importa primero el módulo "texto"/);
  assert.throws(() => parseZafiroWebScript(`aplicacion "Error" {\n variable valor: numero = "no"\n titulo "A"\n descripcion "B"\n tema oscuro\n boton "Compartir" {\n permiso ubicacion al_pulsar\n mostrar coordenadas\n }\n}`), /no coincide con el tipo numero/);
});

test('importa funciones desde módulos declarados antes de la aplicación', () => {
  const app = parseZafiroWebScript(`modulo saludos {
  funcion hola(nombre) = "Hola " + nombre
}
aplicacion "Módulos" {
  usar saludos
  variable usuario: texto = "Ada"
  titulo {{ hola(usuario) }}
  descripcion "Módulo local"
  tema claro
  boton "Continuar" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`);
  assert.equal(app.title, 'Hola Ada');
  assert.deepEqual(app.imports, ['saludos']);
  assert.throws(() => parseZafiroWebScript(`modulo malo {\n instruccion\n}\naplicacion "A" {}`), /solo puede declarar/);
});

test('rechaza ciclos no acotados y reporta las funciones estándar ausentes', () => {
  const source = `aplicacion "Ciclo" {\n variable total = 0\n repetir i desde 1 hasta 1000 entonces variable total = total + i\n titulo "A"\n descripcion "B"\n tema oscuro\n boton "Compartir" {\n permiso ubicacion al_pulsar\n mostrar coordenadas\n }\n}`;
  assert.throws(() => parseZafiroWebScript(source), /máximo de 101 iteraciones/);
  const withNumbers = `aplicacion "Números" {\n usar numeros\n variable n = maximo(2, 9)\n titulo {{ n }}\n descripcion "Biblioteca estándar"\n tema oscuro\n boton "Compartir" {\n permiso ubicacion al_pulsar\n mostrar coordenadas\n }\n}`;
  assert.equal(parseZafiroWebScript(withNumbers).title, '9');
});

test('genera HTML escapado sin eval y solicita ubicación al pulsar', () => {
  const html = compileZafiroWebScript(valid);
  assert.match(html, /Hola &lt;Zafiro&gt;/);
  assert.match(html, /getCurrentPosition/);
  assert.match(html, /addEventListener\('click'/);
  assert.match(html, /no se envían a un servidor/);
  assert.doesNotMatch(html, /eval\(/);
});

test('rechaza permisos escritos solo en comentarios e instrucciones desconocidas', () => {
  assert.throws(() => compileZafiroWebScript(valid.replace('permiso ubicacion al_pulsar', '# permiso ubicacion al_pulsar')), /debe declarar permiso/);
  assert.throws(() => compileZafiroWebScript(valid.replace('tema claro', 'tema azul')), /instrucción desconocida/);
});

test('reporta variables ausentes, división entre cero, duplicados y condiciones no booleanas', () => {
  const replace = (body, original = 'titulo "Hola <Zafiro>"') => valid.replace(original, body);
  assert.throws(() => parseZafiroWebScript(replace('titulo {{ falta }}')), /variable "falta" no existe/);
  assert.throws(() => parseZafiroWebScript(replace('variable x = 3 / 0\n  titulo "Hola <Zafiro>"')), /dividir entre cero/);
  assert.throws(() => parseZafiroWebScript(replace('variable x = 1\n  variable x = 2\n  titulo "Hola <Zafiro>"')), /ya fue declarada/);
  assert.throws(() => parseZafiroWebScript(replace('si 4 + 2 entonces titulo "Otro"\n  titulo "Hola <Zafiro>"')), /debe producir verdadero o falso/);
});

test('rechaza contenido extra y escapa cadenas contra HTML', () => {
  assert.throws(() => compileZafiroWebScript(`${valid}\nconsole.log("no")`), /después del cierre/);
  const hostile = valid.replace('Hola <Zafiro>', '<img src=x onerror=alert(1)>');
  const html = compileZafiroWebScript(hostile);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('genera archivos PWA enlazados y un service worker con caché offline', () => {
  const assets = createZafiroPwaAssets(valid);
  const html = compileZafiroWebScript(valid);
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /register\('\.\/sw\.js'/);
  assert.match(assets.manifest, /"display": "standalone"/);
  assert.match(assets.icon, /<svg/);
  assert.match(assets.serviceWorker, /caches\.open/);
  assert.match(assets.serviceWorker, /zafiro-app\.html/);
});

const dataProgram = `aplicacion "Directorio" {
  usar datos
  tabla contactos {
    campo id: numero clave
    campo nombre: texto
    campo activo: booleano
  }
  formulario contactos {
    campo nombre "Nombre" requerido
    campo activo "Activo" requerido
  }
  parametro soloActivos: booleano = verdadero
  consulta contactos selecciona nombre, activo donde activo == :soloActivos limite 25
  titulo "Directorio"
  descripcion "Datos locales"
  tema oscuro
  boton "Compartir ubicación" {
    permiso ubicacion al_pulsar
    mostrar coordenadas
  }
}`;

test('declara esquemas, formularios y consultas parametrizadas con datos locales', () => {
  const app = parseZafiroWebScript(dataProgram);
  assert.equal(app.tables.contactos.fields.length, 3);
  assert.equal(app.forms[0].fields[0].type, 'texto');
  assert.deepEqual(app.queries[0], { table: 'contactos', fields: ['nombre', 'activo'], filter: { field: 'activo', operator: '==', value: true }, limit: 25 });
  const html = compileZafiroWebScript(dataProgram);
  assert.match(html, /localStorage/);
  assert.match(html, /Autorizo guardar estos datos en este dispositivo/);
  assert.match(html, /textContent/);
  assert.doesNotMatch(html, /innerHTML|eval\(/);
});

test('rechaza columnas desconocidas, parámetros ausentes, tipos incompatibles y límites excesivos', () => {
  assert.throws(() => parseZafiroWebScript(dataProgram.replace('selecciona nombre, activo', 'selecciona secreto, activo')), /no existe en contactos/);
  assert.throws(() => parseZafiroWebScript(dataProgram.replace(':soloActivos', ':ausente')), /parámetro ":ausente" no existe/);
  assert.throws(() => parseZafiroWebScript(dataProgram.replace('activo == :soloActivos', 'nombre == :soloActivos')), /filtro debe ser de tipo texto/);
  assert.throws(() => parseZafiroWebScript(dataProgram.replace('limite 25', 'limite 101')), /entre 1 y 100/);
});

const webInspectorProgram = valid.replace('  titulo "Hola <Zafiro>"', '  usar inspeccion_web\n  inspeccionar web paginas 8\n  titulo "Hola <Zafiro>"');

test('genera un inventario web pasivo con alcance limitado y consentimiento', () => {
  const app = parseZafiroWebScript(webInspectorProgram);
  assert.deepEqual(app.webInspector, { maxPages: 8 });
  const html = compileZafiroWebScript(webInspectorProgram);
  assert.match(html, /Confirmo que controlo este sitio o tengo autorización/);
  assert.match(html, /redirect:'error'/);
  assert.match(html, /credentials:'omit'/);
  assert.match(html, /no se consultó DNS ni se buscaron subdominios/);
  assert.match(html, /DOMParser/);
  assert.match(html, /data-zafiro-src/);
  assert.doesNotMatch(html, /innerHTML|eval\(/);
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
});

test('limita el inventario y exige importar el módulo', () => {
  assert.throws(() => parseZafiroWebScript(valid.replace('  titulo "Hola <Zafiro>"', '  inspeccionar web paginas 3\n  titulo "Hola <Zafiro>"')), /importa primero "inspeccion_web"/);
  assert.throws(() => parseZafiroWebScript(webInspectorProgram.replace('paginas 8', 'paginas 16')), /de 1 a 15 páginas/);
});
