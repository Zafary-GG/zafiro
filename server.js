import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_CODE = 16_000;
const TIMEOUT_MS = 5_000;

function run(command, args, code) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      child.kill();
      reject(new Error('Tiempo límite excedido (5 segundos).'));
    }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      if (!finished) { finished = true; clearTimeout(timer); reject(error); }
    });
    child.on('close', exitCode => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ output: stdout, error: stderr, exitCode });
      }
    });
    child.stdin.end(code);
  });
}

async function execute(language, code) {
  if (language === 'javascript') return run(process.execPath, ['-'], code);
  if (language === 'python') {
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    return run(python, ['-I', '-'], code);
  }
  throw new Error('Lenguaje no soportado. Usa javascript o python.');
}

const server = createServer(async (req, res) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, headers).end(JSON.stringify({ ok: true, service: 'zafiro-prototype', languages: ['javascript', 'python'] }));
    return;
  }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(path.join(root, 'site', 'index.html')));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/run') {
    res.writeHead(404, headers).end(JSON.stringify({ error: 'Ruta no encontrada.' }));
    return;
  }
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_CODE + 128) req.destroy();
  });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      if (typeof payload.code !== 'string' || payload.code.length > MAX_CODE) throw new Error('El código debe ser texto de hasta 16 KB.');
      if (!['javascript', 'python'].includes(payload.language)) throw new Error('Lenguaje no soportado.');
      const result = await execute(payload.language, payload.code);
      res.writeHead(200, headers).end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, headers).end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Zafiro listo en http://127.0.0.1:${PORT}`));
