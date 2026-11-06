'use strict';
// KK AI Hub 资源看板 · 后端入口（纯 API；可选顺带托管前端静态文件）
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const { sendJSON, readBody, HttpError, Router } = require('./http');

store.initSeed();

const router = new Router()
  .use(require('./routes/auth'))
  .use(require('./routes/system'))
  .use(require('./routes/resources'))
  .use(require('./routes/groups'))
  .use(require('./routes/content'))
  .use(require('./routes/users'))
  .use(require('./routes/insights'));

async function handleApi(req, res, pathname, query) {
  const method = req.method;
  // 写操作只接受 JSON（顺带挡掉跨站表单提交）
  if (!['GET', 'HEAD'].includes(method) && !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return sendJSON(res, 415, { error: '请求格式不正确' });
  }
  const { route, params, pathHit } = router.match(method, pathname);
  if (!route) return sendJSON(res, pathHit ? 405 : 404, { error: pathHit ? '不支持该请求方法' : '接口不存在' });

  const opts = route.opts || {};
  let user = null;
  if (opts.auth !== false) {
    user = auth.currentUser(req);
    if (!user) return sendJSON(res, 401, { error: '未登录或登录已过期' });
    if (opts.roles && !opts.roles.includes(user.role)) return sendJSON(res, 403, { error: opts.denyMsg || '无权限' });
  }
  let bodyCache;
  const ctx = {
    req, res, user, params, query,
    body: async () => (bodyCache !== undefined ? bodyCache : (bodyCache = await readBody(req))),
    send: (code, obj) => { sendJSON(res, code, obj); return undefined; },
    fail: (code, msg) => { throw new HttpError(code, msg); }
  };
  try {
    const out = await route.handler(ctx);
    if (out !== undefined && !res.headersSent) sendJSON(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return sendJSON(res, e.status, { error: e.message });
    throw e;
  }
}

// ---------- 前端静态文件 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2'
};
const PAGE_ALIAS = { '/': '/index.html', '/admin': '/admin.html', '/admin/': '/admin.html', '/guide': '/guide.html' };
function serveStatic(req, res, pathname) {
  if (!config.SERVE_WEB) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('API only'); return; }
  let rel;
  try { rel = decodeURIComponent(PAGE_ALIAS[pathname] || pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  const filePath = path.normalize(path.join(config.WEB_DIR, rel));
  if (!filePath.startsWith(config.WEB_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    // 页面与脚本不缓存，避免发版后用户还在用旧脚本；图片缓存 1 天
    const cache = ['.png', '.jpg', '.jpeg', '.webp', '.ico', '.svg', '.woff2'].includes(ext) ? 'public, max-age=86400' : 'no-store';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';
  if (pathname === '/healthz') return sendJSON(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, parsed.query).catch(err => {
      console.error('API 错误:', err);
      sendJSON(res, 500, { error: '服务器内部错误' });
    });
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(config.PORT, config.HOST, () => {
  const st = store.getSettings();
  console.log('\n  KK AI Hub 资源 BI 看板已启动');
  console.log(`  主界面:   http://localhost:${config.PORT}/`);
  console.log(`  管理后台: http://localhost:${config.PORT}/admin`);
  console.log(`  前端托管: ${config.SERVE_WEB ? config.WEB_DIR : '关闭（SERVE_WEB=0，仅提供 /api）'}`);
  console.log(`  会话超时: ${st.sessionTimeoutMin} 分钟无操作自动退出\n`);
});

module.exports = server;
