'use strict';
// 登录 / 登出 / 当前用户 / 改密码
const store = require('../store');
const auth = require('../auth');
const { getClientIp, socketIp } = require('../http');

module.exports = r => r
  .post('/api/login', { auth: false }, async ctx => {
    const body = await ctx.body();
    const ip = socketIp(ctx.req);
    const uname = String(body.username || '').trim().slice(0, 64);
    const wait = auth.loginLockedFor(ip, uname);
    if (wait) return ctx.send(429, { error: `登录失败次数过多，请 ${Math.ceil(wait / 60000)} 分钟后再试` });
    const u = store.findUserByUsername(uname);
    const ok = !!u && store.verifyPassword(String(body.password || ''), u.passwordHash);
    store.logLogin({ username: uname, ip: getClientIp(ctx.req), userAgent: ctx.req.headers['user-agent'], result: ok ? 'success' : 'fail' });
    if (!ok) { auth.recordLoginFail(ip, uname); return ctx.send(401, { error: '用户名或密码错误' }); }
    auth.clearLoginFail(ip, uname);
    auth.setSessionCookie(ctx.res, store.createSession(u.id), ctx.req);
    return { user: store.publicUser(u) };
  })

  .post('/api/logout', { auth: false }, ctx => {
    const sid = auth.sessionId(ctx.req);
    if (sid) store.destroySession(sid);
    auth.clearSessionCookie(ctx.res);
    return { ok: true };
  })

  .get('/api/me', { auth: false }, ctx => {
    const u = auth.currentUser(ctx.req);
    if (!u) return ctx.send(401, { error: '未登录' });
    return { user: store.publicUser(u) };
  })

  // 修改自己的密码：仅管理员（普通用户 / 技术人员的密码由管理员重置）
  .post('/api/me/password', { roles: ['admin'], denyMsg: '普通用户不能自行修改密码，请联系管理员' }, async ctx => {
    const body = await ctx.body();
    if (!store.verifyPassword(String(body.currentPassword || ''), ctx.user.passwordHash)) ctx.fail(400, '原密码不正确');
    const np = String(body.newPassword || '');
    if (np.length < 8) ctx.fail(400, '新密码至少 8 位');
    if (np === String(body.currentPassword)) ctx.fail(400, '新密码不能与原密码相同');
    store.updateUser(ctx.user.id, { password: np });
    return { ok: true };
  });
