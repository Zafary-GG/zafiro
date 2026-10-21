import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local-only documentation portal. Do not add a public code-execution endpoint here.
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const FILES = new Map([
  ['/', ['zafiro.html', 'text/html; charset=utf-8']],
  ['/zafiro.css', ['zafiro.css', 'text/css; charset=utf-8']],
  ['/zafiro.js', ['zafiro.js', 'text/javascript; charset=utf-8']]
]);

const server = http.createServer({ maxHeaderSize: 8 * 1024 }, (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end('Method Not Allowed');
  }

  let pathname;
  try { pathname = new URL(request.url, `http://${HOST}`).pathname; }
  catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Bad Request');
  }
  const entry = FILES.get(pathname);
  if (!entry) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not Found');
  }
  try {
    const body = fs.readFileSync(path.join(ROOT, entry[0]));
    response.writeHead(200, { 'Content-Type': entry[1] });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No se pudo leer un archivo de Zafiro.');
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 30;
server.listen(PORT, HOST, () => console.log(`Portal Zafiro activo en http://${HOST}:${PORT}`));
