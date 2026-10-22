#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileZafiroWebScript, createZafiroPwaAssets } from '../site/zafiro-webscript.js';
import { installPackage, listPackages, packModule, resolvePackageImport, updatePackages } from './packages.js';

const usage = `Zafiro WebScript CLI

Comandos:
  zafiro create <nombre>       Crea un proyecto con un módulo externo de ejemplo
  zafiro install <paquete>     Instala @autor/nombre[@versión] o un .zfpkg local
  zafiro list [búsqueda]       Muestra los paquetes del registro
  zafiro update [paquete]      Actualiza los paquetes instalados desde el registro
  zafiro pack <archivo.zfm>    Crea un paquete .zfpkg para compartir
  zafiro build [proyecto]      Compila el proyecto a una PWA en dist/
  zafiro check [proyecto]      Valida el programa sin generar archivos

Opciones de build:
  --out <carpeta>              Carpeta de salida (predeterminado: dist)
  --entry <archivo>            Archivo de entrada (predeterminado: src/main.zafiro)
`;

function fail(message) { console.error(`Zafiro: ${message}`); process.exitCode = 1; }

async function loadProject(root, entry, config = {}) {
  const projectRoot = await fs.realpath(root);
  const entryPath = path.resolve(projectRoot, entry);
  if (entryPath !== projectRoot && !entryPath.startsWith(projectRoot + path.sep)) throw new Error('El archivo de entrada sale de la carpeta del proyecto.');
  const resolvedEntry = await fs.realpath(entryPath);
  if (resolvedEntry !== projectRoot && !resolvedEntry.startsWith(projectRoot + path.sep)) throw new Error('El archivo de entrada sale de la carpeta del proyecto.');
  const source = await fs.readFile(resolvedEntry, 'utf8');
  const visited = new Set();
  const importPattern = /^\s*usar\s+"([^"\r\n]+)"\s*$/gm;
  const modules = [];
  let lock = { lockfileVersion: 1, packages: {} };
  try { lock = JSON.parse(await fs.readFile(path.join(projectRoot, 'zafiro.lock'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`zafiro.lock no es válido: ${error.message}`); }
  if (lock.lockfileVersion !== 1 || !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) throw new Error('zafiro.lock tiene un formato no compatible.');
  let expanded = source;
  for (const match of source.matchAll(importPattern)) {
    const relative = match[1];
    let resolved, moduleSource, declaredName;
    if (relative.endsWith('.zfm')) {
      const candidate = path.resolve(path.dirname(resolvedEntry), relative);
      if (candidate !== projectRoot && !candidate.startsWith(projectRoot + path.sep)) throw new Error(`El módulo ${relative} sale de la carpeta del proyecto.`);
      try { resolved = await fs.realpath(candidate); }
      catch { throw new Error(`No se encontró el módulo ${relative}.`); }
      if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) throw new Error(`El módulo ${relative} sale de la carpeta del proyecto.`);
      moduleSource = await fs.readFile(resolved, 'utf8');
      declaredName = moduleSource.match(/^\s*modulo\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/m)?.[1];
      if (!declaredName) throw new Error(`El módulo ${relative} debe declarar un bloque modulo nombre { ... }.`);
    } else {
      const installed = await resolvePackageImport(projectRoot, relative, config, lock);
      ({ resolved, module: moduleSource, moduleName: declaredName } = installed);
    }
    if (visited.has(resolved)) throw new Error(`El módulo ${relative} está importado más de una vez.`);
    visited.add(resolved);
    if (/^\s*usar\s+"/m.test(moduleSource)) throw new Error('Por ahora, los módulos externos no pueden importar otros archivos.');
    modules.push(moduleSource.trim());
    expanded = expanded.replace(match[0], `usar ${declaredName}`);
  }
  return `${modules.join('\n\n')}\n\n${expanded}`;
}

async function createProject(name) {
  if (!name || name === '.' || name === '..' || /[<>:"|?*]/.test(name) || name.includes('/') || name.includes('\\')) throw new Error('Indica un nombre de carpeta sencillo, por ejemplo: zafiro create MiApp');
  const root = path.resolve(name);
  await fs.mkdir(root, { recursive: false });
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'modules'));
  await fs.mkdir(path.join(root, 'bin'));
  await fs.mkdir(path.join(root, 'packages'));
  await fs.mkdir(path.join(root, 'site'));
  await fs.copyFile(fileURLToPath(import.meta.url), path.join(root, 'bin', 'zafiro.js'));
  await fs.copyFile(fileURLToPath(new URL('./packages.js', import.meta.url)), path.join(root, 'bin', 'packages.js'));
  await fs.copyFile(fileURLToPath(new URL('../site/zafiro-webscript.js', import.meta.url)), path.join(root, 'site', 'zafiro-webscript.js'));
  await fs.writeFile(path.join(root, 'zafiro.json'), `${JSON.stringify({ name, entry: 'src/main.zafiro', output: 'dist' }, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'), private: true, type: 'module', scripts: { check: 'node bin/zafiro.js check', build: 'node bin/zafiro.js build' } }, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'modules', 'saludos.zfm'), `modulo saludos {\n  funcion bienvenida(persona) = "Bienvenido, " + persona\n}\n`);
  await fs.writeFile(path.join(root, 'src', 'main.zafiro'), `aplicacion "${name}" {\n  usar "../modules/saludos.zfm"\n  variable nombre: texto = "Zafiro"\n  variable intentos: numero = 0\n  titulo {{ bienvenida(nombre) }}\n  descripcion "App web compilada con Zafiro WebScript."\n  tema oscuro\n  repetir i desde 1 hasta 3 entonces variable intentos = intentos + 1\n  boton "Compartir ubicación" {\n    permiso ubicacion al_pulsar\n    mostrar coordenadas\n  }\n}\n`);
  await fs.writeFile(path.join(root, 'README.md'), `# ${name}\n\nRequiere Node.js 22 o posterior. Desde esta carpeta ejecuta:\n\n\`npm run check\` valida el proyecto.\n\n\`npm run build\` compila la PWA en \`dist/\`.\n\nInstala módulos con \`node bin/zafiro.js install @zafiro/saludos\` y usa \`usar "@zafiro/saludos"\` en el programa. Crea un paquete para compartir con \`node bin/zafiro.js pack archivo.zfm --name @autor/nombre --version 1.0.0\`.\n\nEl proyecto incluye la CLI local, el compilador y el módulo de ejemplo. Publica juntos los archivos generados bajo HTTPS para instalar la app.\n`);
  console.log(`Proyecto creado en ${root}`);
  console.log(`Siguiente paso: cd ${name}; npm run check`);
}

async function projectConfig(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, 'zafiro.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error(`zafiro.json no es JSON válido: ${error.message}`); }
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) { console.log(usage); return; }
  if (command === 'create') { await createProject(args[0]); return; }
  if (command === 'install') { if (!args[0]) throw new Error('Indica un nombre de paquete o un archivo .zfpkg.'); await installPackage(process.cwd(), args[0]); return; }
  if (command === 'list') { await listPackages(args[0] ?? ''); return; }
  if (command === 'update') { await updatePackages(process.cwd(), args[0]); return; }
  if (command === 'pack') {
    const input = args[0]; let name, version, output;
    for (let i = 1; i < args.length; i += 1) {
      if (args[i] === '--name') name = args[++i];
      else if (args[i] === '--version') version = args[++i];
      else if (args[i] === '--out') output = args[++i];
      else throw new Error(`Opción desconocida de pack: ${args[i]}`);
    }
    if (!input || !name || !version) throw new Error('Uso: zafiro pack <archivo.zfm> --name @autor/nombre --version 1.0.0 [--out archivo.zfpkg].');
    await packModule(path.resolve(input), name, version, output); return;
  }
  if (!['build', 'check'].includes(command)) throw new Error(`Comando desconocido: ${command}\n\n${usage}`);
  let root = '.', entryOverride, outputOverride;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--entry') entryOverride = args[++i];
    else if (args[i] === '--out') outputOverride = args[++i];
    else positional.push(args[i]);
  }
  root = path.resolve(positional[0] ?? '.');
  const config = await projectConfig(root);
  const sourceText = await loadProject(root, entryOverride ?? config.entry ?? 'src/main.zafiro', config);
  const html = compileZafiroWebScript(sourceText);
  const app = html.match(/<title>(.*?)<\/title>/)?.[1] ?? 'WebScript';
  if (command === 'check') { console.log(`Sintaxis y compilación correctas: ${app}`); return; }
  const output = path.resolve(root, outputOverride ?? config.output ?? 'dist');
  await fs.mkdir(output, { recursive: true });
  const assets = createZafiroPwaAssets(sourceText);
  await Promise.all([
    fs.writeFile(path.join(output, 'zafiro-app.html'), html),
    fs.writeFile(path.join(output, 'manifest.webmanifest'), assets.manifest),
    fs.writeFile(path.join(output, 'icon.svg'), assets.icon),
    fs.writeFile(path.join(output, 'sw.js'), assets.serviceWorker)
  ]);
  console.log(`PWA compilada en ${output}`);
}

main().catch(error => fail(error.message));
