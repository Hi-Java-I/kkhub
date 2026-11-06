'use strict';
// 分组信息：所有登录用户可看；新增 / 修改 / 删除仅管理员
const store = require('../store');
const { SYNC_LABELS, stripGroupStatus, sharedFieldError } = require('../services/sync');

const ADMIN_EDIT = { roles: ['admin'], denyMsg: '无权限：仅管理员可编辑分组信息' };
const hasModels = b => store.toModelIds(b.modelIds !== undefined ? b.modelIds : b.modelId).length > 0;

module.exports = r => r
  // 「同步资源情况」是管理员设置，非管理员不返回
  .get('/api/groups', ctx => {
    const list = store.listGroupInfos();
    return { data: ctx.user.role === 'admin' ? list : list.map(stripGroupStatus) };
  })

  .post('/api/groups', ADMIN_EDIT, async ctx => {
    const body = await ctx.body();
    if (!String(body.vendor || '').trim() || !String(body.group || '').trim() || !hasModels(body)) ctx.fail(400, '模型厂商 / 分组 / 模型ID 为必填');
    if (store.findGroupInfo(body.vendor, body.group)) ctx.fail(400, `分组信息里已存在「${String(body.vendor).trim()} · ${String(body.group).trim()}」，不能重名`);
    return ctx.send(201, { data: store.addGroupInfo(Object.assign({}, body, { updatedBy: ctx.user.username })) });
  })

  // 批量上新：同一「模型厂商 + 分组」已存在则合并模型ID，否则新建；同步资源情况可填中文或英文 key
  .post('/api/groups/batch', ADMIN_EDIT, async ctx => {
    const body = await ctx.body();
    const items = Array.isArray(body.items) ? body.items.slice(0, 1000) : [];
    if (!items.length) ctx.fail(400, '未提供任何分组行');
    const statusOf = v => {
      const s = String(v || '').trim();
      return Object.keys(SYNC_LABELS).find(k => k === s || SYNC_LABELS[k] === s) || 'sufficient';
    };
    let created = 0, merged = 0;
    const errors = [];
    items.forEach((it, i) => {
      if (!it.vendor || !it.group || !hasModels(it)) { errors.push({ row: i + 1, reason: '缺少必填项(模型厂商/分组/模型ID)' }); return; }
      const status = String(it.resourceStatus || '').trim() ? statusOf(it.resourceStatus) : undefined;
      const res = store.upsertGroupInfo(Object.assign({}, it, { resourceStatus: status, updatedBy: ctx.user.username }));
      if (res.merged) merged++; else created++;
    });
    store.saveNow();
    return { added: created + merged, created, merged, errors };
  })

  .put('/api/groups/:id', ADMIN_EDIT, async ctx => {
    const body = await ctx.body();
    const cur = store.listGroupInfos().find(x => x.id === ctx.params.id);
    if (!cur) ctx.fail(404, '分组信息不存在');
    const err = sharedFieldError(cur, body);
    if (err) ctx.fail(400, err);
    if ((body.modelIds !== undefined || body.modelId !== undefined) && !hasModels(body)) ctx.fail(400, '模型ID 至少填写一个');
    const g = store.updateGroupInfo(ctx.params.id, Object.assign({}, body, { updatedBy: ctx.user.username }));
    return { data: g };
  })

  .del('/api/groups/:id', ADMIN_EDIT, ctx => {
    if (!store.deleteGroupInfo(ctx.params.id)) ctx.fail(404, '分组信息不存在');
    return { ok: true };
  });
