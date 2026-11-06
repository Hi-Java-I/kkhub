'use strict';
// HTTP 小工具 + 极简路由（零依赖）
const config = require('./config');

function sendJSON(res, code, obj) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function getCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) {
      try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* 忽略坏 cookie */ }
    }
  });
  return out;
}

function getClientIp(req) {
  if (config.TRUST_PROXY && req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
// 限流用：X-Forwarded-For 可伪造，只信任 TCP 地址或（TRUST_PROXY 时）Nginx 写入的 X-Real-IP
const socketIp = req => (config.TRUST_PROXY && req.headers['x-real-ip']) || (req.socket && req.socket.remoteAddress) || 'unknown';

// 业务错误：throw new HttpError(400, '...') 会被路由统一转成 JSON
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * 路由表。每条路由：method + 路径模式（支持 :id 参数）+ 选项 + 处理函数
 *   opts.auth    默认 true，需要登录
 *   opts.roles   允许的角色数组；不在其中返回 403
 *   opts.denyMsg 403 时的提示
 * 处理函数 (ctx) => 返回值会作为 200 JSON；需要别的状态码用 ctx.send(code, obj)
 */
class Router {
  constructor() { this.routes = []; }
  add(method, pattern, opts, handler) {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '/?$');
    this.routes.push({ method, re, keys, opts, handler });
    return this;
  }
  get(p, o, h) { return this.add('GET', p, o, h); }
  post(p, o, h) { return this.add('POST', p, o, h); }
  put(p, o, h) { return this.add('PUT', p, o, h); }
  del(p, o, h) { return this.add('DELETE', p, o, h); }
  use(fn) { fn(this); return this; }

  match(method, pathname) {
    let pathHit = false;
    for (const r of this.routes) {
      const m = pathname.match(r.re);
      if (!m) continue;
      pathHit = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = Number(m[i + 1]); });
      return { route: r, params };
    }
    return { route: null, pathHit };
  }
}

module.exports = { sendJSON, readBody, getCookies, getClientIp, socketIp, HttpError, Router };
