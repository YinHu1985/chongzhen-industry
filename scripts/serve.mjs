import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = { port: process.env.PORT ?? '4173', dir: '.' };
const args = process.argv.slice(2);

for (let index = 0; index < args.length; index += 1) {
  const [flag, inlineValue] = args[index].split('=', 2);
  if (flag === '--help' || flag === '-h') {
    console.log('Usage: node scripts/serve.mjs [--dir dist] [--port 4173]');
    process.exit(0);
  }
  if (flag !== '--port' && flag !== '--dir') {
    console.error(`Unknown option: ${flag}`);
    process.exit(1);
  }
  const value = inlineValue ?? args[++index];
  if (!value || value.startsWith('--')) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  options[flag.slice(2)] = value;
}

const port = Number(options.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

let root;
try {
  root = await realpath(path.resolve(projectRoot, options.dir));
  if (!(await stat(path.join(root, 'index.html'))).isFile()) throw new Error('No index.html');
} catch {
  console.error(`Cannot serve ${options.dir}: index.html is missing. For preview, run npm run build first.`);
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const server = createServer(async (request, response) => {
  const respond = (statusCode, body) => {
    response.writeHead(statusCode, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    respond(405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    respond(400, 'Invalid URL');
    return;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (pathname.includes('\0') || pathname.includes('\\') || segments.some((part) => part.startsWith('.'))) {
    respond(404, 'Not found');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  // Serve the same public surface as the build. Tooling, tests and local state stay private.
  if (pathname !== '/index.html' && !pathname.startsWith('/src/') && !pathname.startsWith('/assets/')) {
    respond(404, 'Not found');
    return;
  }

  try {
    const requestedPath = path.resolve(root, `.${pathname}`);
    const resolvedPath = await realpath(requestedPath);
    if (!resolvedPath.startsWith(`${root}${path.sep}`)) {
      respond(404, 'Not found');
      return;
    }
    const details = await stat(resolvedPath);
    if (!details.isFile()) {
      respond(404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': details.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(resolvedPath);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch {
    respond(404, 'Not found');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Try npm run dev -- --port ${port + 1}.`
    : error.message);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`崇祯工业 · ${options.dir === 'dist' ? 'production preview' : 'local development'}`);
  console.log(`Local: http://127.0.0.1:${port}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
