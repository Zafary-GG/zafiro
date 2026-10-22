import test from 'node:test';
import assert from 'node:assert/strict';
import { compileZafiroWebScript, parseZafiroWebScript } from '../site/zafiro-webscript.js';

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
    variables: {}, functions: {}, conditions: []
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
