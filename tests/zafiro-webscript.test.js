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

test('parsea el ejemplo como datos declarativos', () => {
  assert.deepEqual(parseZafiroWebScript(valid), {
    name: 'Mi app', title: 'Hola <Zafiro>', description: 'Ejemplo', button: 'Compartir', theme: 'claro'
  });
});

test('genera HTML con cadenas escapadas y permiso al pulsar', () => {
  const html = compileZafiroWebScript(valid);
  assert.match(html, /Hola &lt;Zafiro&gt;/);
  assert.match(html, /getCurrentPosition/);
  assert.match(html, /addEventListener\('click'/);
  assert.match(html, /no se envían a un servidor/);
  assert.doesNotMatch(html, /eval\(/);
});

test('rechaza un permiso escrito solo en comentario y rechaza instrucción inválida', () => {
  const commented = valid.replace('permiso ubicacion al_pulsar', '# permiso ubicacion al_pulsar');
  assert.throws(() => compileZafiroWebScript(commented), /debe declarar permiso/);
  assert.throws(() => compileZafiroWebScript(valid.replace('tema claro', 'tema azul')), /instrucción desconocida/);
});

test('rechaza contenido fuera del bloque de aplicación', () => {
  assert.throws(() => compileZafiroWebScript(`${valid}\nconsole.log("no")`), /después del cierre/);
});

test('escapa el texto de interfaz contra HTML ejecutable', () => {
  const hostile = valid.replace('Hola <Zafiro>', '<img src=x onerror=alert(1)>');
  const html = compileZafiroWebScript(hostile);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
