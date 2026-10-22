import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseZafiroWebScript } from '../site/zafiro-webscript.js';

const REGISTRY_URL = 'https://raw.githubusercontent.com/Zafary-GG/zafiro/refs/heads/main/packages/index.json';
const REGISTRY_PACKAGE_PREFIX = '/Zafary-GG/zafiro/refs/heads/main/packages/';
const PACKAGE_FORMAT = 'zafiro-package-v1';
const packageNamePattern = /^@[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z][a-z0-9-]{0,48}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function digest(value) { return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`; }
function validPackageName(value) {
  if (!packageNamePattern.test(value)) throw new Error(`Nombre de paquete inválido: ${value}. Usa @autor/nombre.`);
  return value;
}
function validVersion(value) {
  if (!versionPattern.test(value)) throw new Error(`Versión inválida: ${value}. Usa el formato mayor.menor.parche.`);
  return value;
}
function packageScopePath(name) { return name.split('/').join(path.sep); }

function inspectModule(source, expectedName) {
  if (Buffer.byteLength(source, 'utf8') > 64 * 1024) throw new Error('Un módulo .zfm no puede superar 64 KB.');
  if (/^\s*usar\s+"/m.test(source)) throw new Error('Los paquetes .zfm no pueden importar otros módulos todavía.');
  const moduleName = source.match(/^\s*modulo\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/m)?.[1];
  if (!moduleName) throw new Error('El archivo debe declarar modulo nombre { ... }.');
  if (expectedName && moduleName !== expectedName) throw new Error(`El paquete declara el módulo "${moduleName}"; se esperaba "${expectedName}".`);
  const validation = `${source.trim()}\naplicacion "Validacion" {\n usar ${moduleName}\n titulo "Paquete"\n descripcion "Validación"\n tema oscuro\n boton "Ubicación" {\n permiso ubicacion al_pulsar\n mostrar coordenadas\n }\n}\n`;
  try { parseZafiroWebScript(validation); }
  catch (error) { throw new Error(`El módulo no es válido para WebScript: ${error.message}`); }
  return moduleName;
}

function decodePackage(text) {
  let artifact;
  try { artifact = JSON.parse(text); } catch { throw new Error('El archivo .zfpkg no contiene JSON válido.'); }
  if (artifact?.format !== PACKAGE_FORMAT) throw new Error('Formato de paquete Zafiro desconocido.');
  validPackageName(artifact.name);
  validVersion(artifact.version);
  if (typeof artifact.module !== 'string' || typeof artifact.integrity !== 'string') throw new Error('El paquete está incompleto.');
  if (digest(Buffer.from(artifact.module, 'utf8')) !== artifact.integrity) throw new Error('La integridad del módulo no coincide; el archivo pudo cambiar.');
  const moduleName = inspectModule(artifact.module, artifact.moduleName);
  return { ...artifact, moduleName };
}

async function readLimitedResponse(response, limit, label) {
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}.`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error(`${label}: respuesta mayor al límite de ${limit} bytes.`);
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error(`${label}: respuesta mayor al límite de ${limit} bytes.`); }
    chunks.push(Buffer.from(part.value));
  }
  return Buffer.concat(chunks, size);
}

async function fetchText(url, limit, label) {
  let response;
  try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } }); }
  catch (error) { throw new Error(`${label}: no se pudo descargar desde el registro HTTPS (${error.message}).`); }
  return (await readLimitedResponse(response, limit, label)).toString('utf8');
}

async function registryIndex() {
  let url;
  try { url = new URL(REGISTRY_URL); } catch { throw new Error('La dirección del registro de Zafiro no es válida.'); }
  const text = await fetchText(url, 2 * 1024 * 1024, 'Registro de paquetes');
  let index;
  try { index = JSON.parse(text); } catch { throw new Error('El índice del registro no contiene JSON válido.'); }
  if (index?.schemaVersion !== 1 || !index.packages || typeof index.packages !== 'object' || Array.isArray(index.packages)) throw new Error('El índice del registro tiene un formato no compatible.');
  return { url, index };
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function parsePackageSpec(spec) {
  const marker = spec.lastIndexOf('@');
  if (marker > 0) return { name: validPackageName(spec.slice(0, marker)), version: validVersion(spec.slice(marker + 1)) };
  return { name: validPackageName(spec), version: null };
}

async function projectState(root) {
  const configFile = path.join(root, 'zafiro.json');
  let config;
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('No hay zafiro.json; ejecuta este comando desde un proyecto Zafiro.'); throw new Error(`No se pudo leer zafiro.json: ${error.message}`); }
  if (config.dependencies !== undefined && (!config.dependencies || typeof config.dependencies !== 'object' || Array.isArray(config.dependencies))) throw new Error('zafiro.json debe contener dependencies como objeto.');
  let lock = { lockfileVersion: 1, packages: {} };
  try { lock = JSON.parse(await fs.readFile(path.join(root, 'zafiro.lock'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`zafiro.lock no es válido: ${error.message}`); }
  if (lock.lockfileVersion !== 1 || !lock.packages || typeof lock.packages !== 'object') throw new Error('zafiro.lock tiene un formato no compatible.');
  if (Array.isArray(lock.packages)) throw new Error('zafiro.lock tiene un formato no compatible.');
  return { config, lock };
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, file);
}

async function installArtifact(root, artifact, source, packageIntegrity = null) {
  const projectRoot = await fs.realpath(root);
  const scopePath = packageScopePath(artifact.name);
  const relativePath = path.posix.join('modules', 'packages', ...scopePath.split(path.sep), `${artifact.version}.zfm`);
  const moduleFile = path.resolve(projectRoot, relativePath);
  if (moduleFile !== projectRoot && !moduleFile.startsWith(projectRoot + path.sep)) throw new Error('La ruta de instalación sale de la carpeta del proyecto.');
  await fs.mkdir(path.dirname(moduleFile), { recursive: true });
  const actualDirectory = await fs.realpath(path.dirname(moduleFile));
  if (actualDirectory !== projectRoot && !actualDirectory.startsWith(projectRoot + path.sep)) throw new Error('La carpeta de paquetes sale de la carpeta del proyecto.');
  try { const existing = await fs.lstat(moduleFile); if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('La ruta de destino del módulo debe ser un archivo regular, no un enlace simbólico.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { config, lock } = await projectState(projectRoot);
  config.dependencies = { ...(config.dependencies ?? {}), [artifact.name]: artifact.version };
  lock.packages[artifact.name] = {
    version: artifact.version,
    moduleName: artifact.moduleName,
    modulePath: relativePath.split(path.sep).join('/'),
    integrity: artifact.integrity,
    packageIntegrity,
    source
  };
  await fs.writeFile(moduleFile, artifact.module, { flag: 'w' });
  await writeJsonAtomic(path.join(projectRoot, 'zafiro.lock'), lock);
  await writeJsonAtomic(path.join(projectRoot, 'zafiro.json'), config);
  console.log(`Instalado ${artifact.name}@${artifact.version} (${artifact.moduleName})`);
}

async function resolveRegistryPackage(spec) {
  const { name, version: requestedVersion } = parsePackageSpec(spec);
  const { url: indexUrl, index } = await registryIndex();
  const entry = index.packages[name];
  if (!entry || !entry.versions || typeof entry.versions !== 'object') throw new Error(`No se encontró ${name} en el registro de Zafiro.`);
  const versions = Object.keys(entry.versions).filter(item => versionPattern.test(item)).sort(compareVersions);
  const version = requestedVersion ?? versions.at(-1);
  if (!version || !entry.versions[version]) throw new Error(`No hay una versión ${version ?? 'estable'} publicada de ${name}.`);
  const metadata = entry.versions[version];
  if (typeof metadata.path !== 'string' || typeof metadata.integrity !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(metadata.integrity)) throw new Error('Los metadatos del paquete no tienen ruta o integridad válidas.');
  const packageUrl = new URL(metadata.path, indexUrl);
  if (packageUrl.origin !== 'https://raw.githubusercontent.com' || packageUrl.username || packageUrl.password || !packageUrl.pathname.startsWith(REGISTRY_PACKAGE_PREFIX) || packageUrl.search || packageUrl.hash) throw new Error('El paquete apunta fuera del registro HTTPS oficial de Zafiro.');
  const bytes = Buffer.from(await fetchText(packageUrl, 128 * 1024, `Paquete ${name}@${version}`), 'utf8');
  if (digest(bytes) !== metadata.integrity) throw new Error(`La integridad de ${name}@${version} no coincide con el índice.`);
  const artifact = decodePackage(bytes.toString('utf8'));
  if (artifact.name !== name || artifact.version !== version) throw new Error('El nombre o la versión del archivo no coinciden con el registro.');
  return { artifact, packageIntegrity: metadata.integrity };
}

export async function installPackage(root, spec) {
  const projectRoot = path.resolve(root);
  let localPath = null;
  if (spec.endsWith('.zfpkg') || spec.startsWith('.') || path.isAbsolute(spec)) {
    const candidate = path.resolve(projectRoot, spec);
    try { if ((await fs.stat(candidate)).isFile()) localPath = candidate; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (localPath) {
    const artifact = decodePackage(await fs.readFile(localPath, 'utf8'));
    await installArtifact(projectRoot, artifact, `file:${path.basename(localPath)}`);
    return;
  }
  const { artifact, packageIntegrity } = await resolveRegistryPackage(spec);
  await installArtifact(projectRoot, artifact, REGISTRY_URL, packageIntegrity);
}

export async function updatePackages(root, requestedName) {
  const { config, lock } = await projectState(path.resolve(root));
  const dependencies = config.dependencies ?? {};
  const names = requestedName ? [validPackageName(requestedName)] : Object.keys(dependencies).filter(name => lock.packages[name]?.source === REGISTRY_URL);
  if (!names.length) throw new Error('No hay paquetes instalados para actualizar.');
  for (const name of names) {
    if (!dependencies[name]) throw new Error(`El paquete ${name} no está registrado en zafiro.json.`);
    if (lock.packages[name]?.source !== REGISTRY_URL) throw new Error(`${name} se instaló desde un archivo local; instala manualmente su nuevo .zfpkg.`);
    const { artifact, packageIntegrity } = await resolveRegistryPackage(name);
    await installArtifact(path.resolve(root), artifact, REGISTRY_URL, packageIntegrity);
  }
}

export async function listPackages(search = '') {
  const { index } = await registryIndex();
  const query = search.toLocaleLowerCase('en');
  const rows = Object.entries(index.packages).filter(([name]) => name.toLocaleLowerCase('en').includes(query)).sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) { console.log('No hay paquetes que coincidan.'); return; }
  for (const [name, entry] of rows) {
    const versions = Object.keys(entry.versions ?? {}).filter(version => versionPattern.test(version)).sort(compareVersions);
    if (versions.length) console.log(`${name}  ${versions.join(', ')}`);
  }
}

export async function packModule(inputFile, name, version, outputFile) {
  validPackageName(name);
  validVersion(version);
  const module = await fs.readFile(inputFile, 'utf8');
  const moduleName = inspectModule(module);
  const artifact = { format: PACKAGE_FORMAT, name, version, moduleName, integrity: digest(Buffer.from(module, 'utf8')), module };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const out = path.resolve(outputFile ?? `${name.replace(/^@/, '').replace('/', '-')}-${version}.zfpkg`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, serialized, { flag: 'wx' });
  console.log(`Paquete creado: ${out}`);
  console.log(`Integridad para el índice: ${digest(Buffer.from(serialized, 'utf8'))}`);
}

export async function resolvePackageImport(root, reference, config, lock) {
  const name = validPackageName(reference);
  const installed = lock.packages[name];
  if (!installed || config.dependencies?.[name] !== installed.version) throw new Error(`El paquete ${name} no está instalado o zafiro.json y zafiro.lock no coinciden. Ejecuta zafiro install ${name}.`);
  const projectRoot = await fs.realpath(root);
  const moduleFile = path.resolve(projectRoot, installed.modulePath);
  if (moduleFile !== projectRoot && !moduleFile.startsWith(projectRoot + path.sep)) throw new Error(`La ruta bloqueada del paquete ${name} sale de la carpeta del proyecto.`);
  const resolved = await fs.realpath(moduleFile);
  if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) throw new Error(`El paquete ${name} sale de la carpeta del proyecto.`);
  const module = await fs.readFile(resolved, 'utf8');
  if (digest(Buffer.from(module, 'utf8')) !== installed.integrity) throw new Error(`La integridad instalada de ${name} cambió. Reinstala el paquete.`);
  const moduleName = inspectModule(module, installed.moduleName);
  return { resolved, module, moduleName };
}

