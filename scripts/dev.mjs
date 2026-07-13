import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function resolvePath(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') p = '/index.html';
  // data/ lives outside site/; everything else is served from site/
  const inData = p.startsWith('/data/');
  const root = path.resolve(inData ? 'data' : 'site');
  const resolved = path.resolve(root, (inData ? p.slice('/data/'.length) : p.slice(1)));
  // Containment check: reject anything that resolves outside the root dir.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const file = resolvePath(req.url || '/');
  try {
    if (!file) throw new Error('outside root');
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}/`);
  console.log('Run "npm run scrape" first if data/lotteries.json is missing.');
});
