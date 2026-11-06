'use strict';
// 会话（签名 Cookie + 无操作超时）与登录防暴力破解
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const { getCookies } = require('./http');

// 会话超时：环境变量 SESSION_TIMEOUT_MIN 优先，否则读系统设置
function getTimeoutMs() {
  const envMin = Number(process.env.SESSION_TIMEOUT_MIN);
  const mins = isFinite(envMin) && envMin > 0 ? envMin : (store.getSettings().sessionTimeoutMin || 5);
  return mins * 60 * 1000;
}
function getWarnSeconds() {
  const envWarn = Number(process.env.WARN_SECONDS);
  return isFinite(envWarn) && envWarn >= 0 ? envWarn : (store.getSettings().warnSeconds || 30);
}

function sign(val) {
  return val + '.' + crypto.createHmac('sha256', config.SECRET).update(val).digest('hex');
}
function unsign(signed) {
  if (!signed || signed.indexOf('.') < 0) return null;
  const idx = signed.lastIndexOf('.');
  const val = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', config.SECRET).update(val).digest('hex');
  const x = Buffer.from(sig), y = Buffer.from(expected);
  return x.length === y.length && crypto.timingSafeEqual(x, y) ? val : null;
}

function setSessionCookie(res, sid, req) {
  const secure = config.TRUST_PROXY && req && req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${config.COOKIE_NAME}=${sign(sid)}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${config.COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
const sessionId = req => unsign(getCookies(req)[config.COOKIE_NAME]);

function currentUser(req) {
  const sid = sessionId(req);
  if (!sid) return null;
  const sess = store.getSession(sid);
  if (!sess) return null;
  if (Date.now() - (sess.lastActivity || sess.createdAt) > getTimeoutMs()) {
    store.destroySession(sid);
    return null;
  }
  store.touchSession(sid); // 滑动续期
  return store.findUserById(sess.userId) || null;
}

// ---------- 登录防暴力破解：同一 IP 或同一用户名 15 分钟内失败 10 次锁定 15 分钟 ----------
const LOGIN_MAX_FAILS = 10, LOGIN_WINDOW = 15 * 60 * 1000;
const loginFails = new Map();
function loginLockedFor(ip, uname) {
  const now = Date.now();
  return Math.max(...['ip:' + ip, 'u:' + uname].map(k => { const r = loginFails.get(k); return r && r.lockedUntil > now ? r.lockedUntil - now : 0; }));
}
function recordLoginFail(ip, uname) {
  const now = Date.now();
  for (const k of ['ip:' + ip, 'u:' + uname]) {
    let r = loginFails.get(k);
    if (!r || now - r.first > LOGIN_WINDOW) r = { count: 0, first: now, lockedUntil: 0 };
    if (++r.count >= LOGIN_MAX_FAILS) r.lockedUntil = now + LOGIN_WINDOW;
    loginFails.set(k, r);
  }
}
function clearLoginFail(ip, uname) { loginFails.delete('ip:' + ip); loginFails.delete('u:' + uname); }
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of loginFails) if (now - r.first > LOGIN_WINDOW && r.lockedUntil < now) loginFails.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = {
  getTimeoutMs, getWarnSeconds, setSessionCookie, clearSessionCookie, sessionId, currentUser,
  loginLockedFor, recordLoginFail, clearLoginFail
};
