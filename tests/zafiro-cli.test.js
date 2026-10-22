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

test.after(async () => {
  await Promise.all(temporaryDirectories.map(directory => fs.rm(directory, { recursive: true, force: true })));
});
