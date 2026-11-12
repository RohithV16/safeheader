import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4321);

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) return [part, ''];
        return [part.slice(0, eqIdx).trim(), part.slice(eqIdx + 1).trim()];
      })
  );
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/set-test-cookie') {
    res.setHeader('Set-Cookie', 'server_cookie=from_echo_server; Path=/; HttpOnly');
  }

  const payload = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: url.pathname + url.search,
    headers: req.headers,
    parsedCookies: parseCookies(req.headers.cookie),
  };

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Echo-Server': 'safeheader-test',
  });
  res.end(JSON.stringify(payload, null, 2));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SafeHeader echo server listening at http://127.0.0.1:${PORT}`);
  console.log('Open that URL in Chrome to inspect actual wire Request Headers & Cookies.');
});
