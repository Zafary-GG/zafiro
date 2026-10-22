import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'bin', 'zafiro.js');
const temporaryDirectories = [];

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zafiro-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

test('crea un proyecto auto-contenido y genera los cuatro archivos PWA', async () => {
  const cwd = await temporaryDirectory();
  const created = runCli(['create', 'MiApp'], cwd);
  assert.equal(created.status, 0, created.stderr);
  const project = path.join(cwd, 'MiApp');
  assert.equal(runCli(['check', project], cwd).status, 0);
  const build = runCli(['build', project], cwd);
  assert.equal(build.status, 0, build.stderr);
  const output = path.join(project, 'dist');
  assert.deepEqual((await fs.readdir(output)).sort(), ['icon.svg', 'manifest.webmanifest', 'sw.js', 'zafiro-app.html']);
  assert.match(await fs.readFile(path.join(output, 'zafiro-app.html'), 'utf8'), /Bienvenido, Zafiro/);
});

test('importa módulos .zfm relativos al proyecto y rechaza rutas que salen de él', async () => {
  const cwd = await temporaryDirectory();
  const created = runCli(['create', 'ConModulos'], cwd);
  assert.equal(created.status, 0, created.stderr);
  const project = path.join(cwd, 'ConModulos');
  const main = path.join(project, 'src', 'main.zafiro');
  const original = await fs.readFile(main, 'utf8');
  await fs.writeFile(main, original.replace('../modules/saludos.zfm', '../../../fuera.zfm'));
  const rejected = runCli(['check', project], cwd);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /sale de la carpeta del proyecto/);
});

test('rechaza comandos desconocidos y evita sobrescribir proyectos', async () => {
  const cwd = await temporaryDirectory();
  assert.notEqual(runCli(['no-existe'], cwd).status, 0);
  assert.equal(runCli(['create', 'App'], cwd).status, 0);
  assert.notEqual(runCli(['create', 'App'], cwd).status, 0);
});

test('empaqueta e instala un módulo local con lock e integridad verificable', async () => {
  const cwd = await temporaryDirectory();
  assert.equal(runCli(['create', 'ConPaquetes'], cwd).status, 0);
  const project = path.join(cwd, 'ConPaquetes');
  const moduleFile = path.join(cwd, 'saludos.zfm');
  await fs.writeFile(moduleFile, 'modulo saludos {\n  funcion hola(nombre) = "Hola " + nombre\n}\n');
  const packageFile = path.join(cwd, 'saludos-1.0.0.zfpkg');
  const packed = runCli(['pack', moduleFile, '--name', '@demo/saludos', '--version', '1.0.0', '--out', packageFile], cwd);
  assert.equal(packed.status, 0, packed.stderr);
  assert.match(packed.stdout, /Integridad para el índice: sha256-/);
  const installed = runCli(['install', packageFile], project);
  assert.equal(installed.status, 0, installed.stderr);
  const config = JSON.parse(await fs.readFile(path.join(project, 'zafiro.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(project, 'zafiro.lock'), 'utf8'));
  assert.equal(config.dependencies['@demo/saludos'], '1.0.0');
  assert.equal(lock.packages['@demo/saludos'].moduleName, 'saludos');
  const entry = path.join(project, 'src', 'main.zafiro');
  const original = await fs.readFile(entry, 'utf8');
  await fs.writeFile(entry, original.replace('usar "../modules/saludos.zfm"', 'usar "@demo/saludos"').replace('{{ bienvenida(nombre) }}', '{{ hola(nombre) }}'));
  const checked = runCli(['check', project], cwd);
  assert.equal(checked.status, 0, checked.stderr);

  await fs.writeFile(packageFile, JSON.stringify({ ...JSON.parse(await fs.readFile(packageFile, 'utf8')), module: 'modulo saludos {\n funcion hola(nombre) = "alterado"\n}\n' }));
  const corrupt = runCli(['install', packageFile], project);
  assert.notEqual(corrupt.status, 0);
  assert.match(corrupt.stderr, /integridad del módulo no coincide/);
  const updateLocal = runCli(['update'], project);
  assert.notEqual(updateLocal.status, 0);
  assert.match(updateLocal.stderr, /No hay paquetes instalados para actualizar/);
});

test('rechaza paquetes con nombre o código inválido', async () => {
  const cwd = await temporaryDirectory();
  const moduleFile = path.join(cwd, 'bad.zfm');
  await fs.writeFile(moduleFile, 'modulo malo {\n  variable salida = fetch("https://sitio")\n}\n');
  const packed = runCli(['pack', moduleFile, '--name', '../saludos', '--version', '1.0.0'], cwd);
  assert.notEqual(packed.status, 0);
  assert.match(packed.stderr, /Nombre de paquete inválido/);
  const invalidModule = runCli(['pack', moduleFile, '--name', '@demo/malo', '--version', '1.0.0'], cwd);
  assert.notEqual(invalidModule.status, 0);
  assert.match(invalidModule.stderr, /no es válido para WebScript/);
});

test.after(async () => {
  await Promise.all(temporaryDirectories.map(directory => fs.rm(directory, { recursive: true, force: true })));
});
