'use strict';
// 用户管理（仅管理员）
const store = require('../store');

const ADMIN = { roles: ['admin'], denyMsg: '无权限：仅管理员可管理用户' };
const roleOf = v => {
  const t = String(v || '').trim();
  if (['admin', '管理员'].includes(t)) return 'admin';
  if (['tech', '技术人员'].includes(t)) return 'tech';
  return 'user';
};

module.exports = r => r
  .get('/api/users', ADMIN, () => ({ data: store.listUsers() }))

  .post('/api/users', ADMIN, async ctx => {
    const body = await ctx.body();
    const username = String(body.username || '').trim();
    if (!username || !body.password) ctx.fail(400, '用户名与密码为必填');
    if (String(body.password).length < 6) ctx.fail(400, '密码至少 6 位');
    try {
      const u = store.createUser({ username, password: String(body.password), displayName: body.displayName ? String(body.displayName).trim() : undefined, role: roleOf(body.role) });
      return ctx.send(201, { data: store.publicUser(u) });
    } catch (e) { ctx.fail(400, e.message); }
  })

  // 批量新增：用户名已存在 / 密码不足 6 位的行跳过并报告
  .post('/api/users/batch', ADMIN, async ctx => {
    const body = await ctx.body();
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    if (!items.length) ctx.fail(400, '未提供任何用户行');
    let added = 0; const errors = [];
    items.forEach((it, i) => {
      const username = String(it.username || '').trim(), password = String(it.password || '');
      if (!username || !password) { errors.push({ row: i + 1, reason: '用户名和密码为必填' }); return; }
      if (password.length < 6) { errors.push({ row: i + 1, reason: username + '：密码至少 6 位' }); return; }
      try {
        store.createUser({ username, password, displayName: String(it.displayName || '').trim() || undefined, role: roleOf(it.role) });
        added++;
      } catch (e) { errors.push({ row: i + 1, reason: username + '：' + e.message }); }
    });
    return { added, errors };
  })

  .put('/api/users/:id', ADMIN, async ctx => {
    const body = await ctx.body();
    const uid = ctx.params.id, self = uid === ctx.user.id;
    // 不能改自己的角色（防止把自己降级后锁死）
    if (self && body.role !== undefined && body.role !== ctx.user.role) ctx.fail(400, '不能修改自己的角色（防止锁死）');
    if (body.password && String(body.password).length < 6) ctx.fail(400, '密码至少 6 位');
    const target = store.findUserById(uid);
    if (!target) ctx.fail(404, '用户不存在');
    if (!self && target.role === 'admin' && body.role !== undefined && roleOf(body.role) !== 'admin' &&
        store.listUsers().filter(x => x.role === 'admin').length <= 1) ctx.fail(400, '至少保留一个管理员账号');
    const u = store.updateUser(uid, { displayName: body.displayName, role: self || body.role === undefined ? undefined : roleOf(body.role), password: body.password || undefined });
    return { data: store.publicUser(u) };
  })

  .del('/api/users/:id', ADMIN, ctx => {
    const uid = ctx.params.id;
    if (uid === ctx.user.id) ctx.fail(400, '不能删除自己的账号');
    const target = store.findUserById(uid);
    if (!target) ctx.fail(404, '用户不存在');
    if (target.role === 'admin' && store.listUsers().filter(x => x.role === 'admin').length <= 1) ctx.fail(400, '至少保留一个管理员账号');
    store.deleteUser(uid);
    return { ok: true };
  });
