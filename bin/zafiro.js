#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileZafiroWebScript, createZafiroPwaAssets } from '../site/zafiro-webscript.js';

const usage = `Zafiro WebScript CLI

Comandos:
  zafiro create <nombre>       Crea un proyecto con un módulo externo de ejemplo
  zafiro build [proyecto]      Compila el proyecto a una PWA en dist/
  zafiro check [proyecto]      Valida el programa sin generar archivos

Opciones de build:
  --out <carpeta>              Carpeta de salida (predeterminado: dist)
  --entry <archivo>            Archivo de entrada (predeterminado: src/main.zafiro)
`;

function fail(message) { console.error(`Zafiro: ${message}`); process.exitCode = 1; }

async function loadProject(root, entry) {
  const projectRoot = await fs.realpath(root);
  const entryPath = path.resolve(projectRoot, entry);
  const source = await fs.readFile(entryPath, 'utf8');
  const visited = new Set();
  const importPattern = /^\s*usar\s+"([^"\r\n]+\.zfm)"\s*$/gm;
  const modules = [];
  let expanded = source;
  for (const match of source.matchAll(importPattern)) {
    const relative = match[1];
    const candidate = path.resolve(path.dirname(entryPath), relative);
    if (candidate !== projectRoot && !candidate.startsWith(projectRoot + path.sep)) throw new Error(`El módulo ${relative} sale de la carpeta del proyecto.`);
    let resolved;
    try { resolved = await fs.realpath(candidate); }
    catch { throw new Error(`No se encontró el módulo ${relative}.`); }
    if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) throw new Error(`El módulo ${relative} sale de la carpeta del proyecto.`);
    if (visited.has(resolved)) throw new Error(`El módulo ${relative} está importado más de una vez.`);
    visited.add(resolved);
    const moduleSource = await fs.readFile(resolved, 'utf8');
    const declaredName = moduleSource.match(/^\s*modulo\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/m)?.[1];
    if (!declaredName) throw new Error(`El módulo ${relative} debe declarar un bloque modulo nombre { ... }.`);
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
  await fs.mkdir(path.join(root, 'site'));
  await fs.copyFile(fileURLToPath(import.meta.url), path.join(root, 'bin', 'zafiro.js'));
  await fs.copyFile(fileURLToPath(new URL('../site/zafiro-webscript.js', import.meta.url)), path.join(root, 'site', 'zafiro-webscript.js'));
  await fs.writeFile(path.join(root, 'zafiro.json'), `${JSON.stringify({ name, entry: 'src/main.zafiro', output: 'dist' }, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'), private: true, type: 'module', scripts: { check: 'node bin/zafiro.js check', build: 'node bin/zafiro.js build' } }, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'modules', 'saludos.zfm'), `modulo saludos {\n  funcion bienvenida(persona) = "Bienvenido, " + persona\n}\n`);
  await fs.writeFile(path.join(root, 'src', 'main.zafiro'), `aplicacion "${name}" {\n  usar "../modules/saludos.zfm"\n  variable nombre: texto = "Zafiro"\n  variable intentos: numero = 0\n  titulo {{ bienvenida(nombre) }}\n  descripcion "App web compilada con Zafiro WebScript."\n  tema oscuro\n  repetir i desde 1 hasta 3 entonces variable intentos = intentos + 1\n  boton "Compartir ubicación" {\n    permiso ubicacion al_pulsar\n    mostrar coordenadas\n  }\n}\n`);
  await fs.writeFile(path.join(root, 'README.md'), `# ${name}\n\nRequiere Node.js 22 o posterior. Desde esta carpeta ejecuta:\n\n\`npm run check\` valida el proyecto.\n\n\`npm run build\` compila la PWA en \`dist/\`.\n\nEl proyecto incluye la CLI local, el compilador y el módulo de ejemplo. Publica juntos los archivos generados bajo HTTPS para instalar la app.\n`);
  console.log(`Proyecto creado en ${root}`);
  console.log(`Siguiente paso: cd ${name}; npx zafiro-webscript check`);
}

async function projectConfig(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, 'zafiro.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error(`zafiro.json no es JSON válido: ${error.message}`); }
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) { console.log(usage); return; }
  if (command === 'create') { await createProject(args[0]); return; }
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
  const sourceText = await loadProject(root, entryOverride ?? config.entry ?? 'src/main.zafiro');
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
