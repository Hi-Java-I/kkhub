'use strict';
// 资源清单（与分组信息一一对应）+ 资源冗余推荐
const store = require('../store');
const { pickShared, sharedFieldError } = require('../services/sync');

const ADMIN_EDIT = { roles: ['admin'], denyMsg: '无权限：仅管理员可编辑资源清单' };

module.exports = r => r
  // 管理员看全部字段；技术人员只读且不含质量指标 / 填报人
  .get('/api/resources', { roles: ['admin', 'tech'] }, ctx => {
    const groups = store.listGroupInfos();
    const list = store.listResources().map(res => {
      const g = res.groupId ? groups.find(x => x.id === res.groupId) : null;
      const out = Object.assign({}, res, { modelIds: g ? g.modelIds : [], groupDesc: g ? g.groupDesc : '' });
      if (ctx.user.role === 'tech') { delete out.cacheHit; delete out.ttft; delete out.successRate; delete out.metricAmp; delete out.reportedBy; }
      return out;
    });
    return { data: list };
  })

  .post('/api/resources', ADMIN_EDIT, ctx =>
    ctx.fail(400, '资源清单与分组信息一一对应：请在「分组信息」里新增分组，资源清单会自动出现对应一行'))

  .post('/api/resources/batch', ADMIN_EDIT, async ctx => {
    const body = await ctx.body();
    const items = Array.isArray(body.items) ? body.items.slice(0, 1000) : [];
    if (!items.length) ctx.fail(400, '未提供任何资源行');
    const added = [], errors = [];
    items.forEach((it, i) => {
      if (!it.vendor || !it.group) { errors.push({ row: i + 1, reason: '缺少必填项(模型厂商/分组)' }); return; }
      const res = store.addResource(Object.assign({}, it, { createdBy: ctx.user.username }));
      if (res) added.push(res);
    });
    return { added: added.length, errors, data: added };
  })

  .put('/api/resources/:id', ADMIN_EDIT, async ctx => {
    const body = await ctx.body();
    const cur = store.listResources().find(x => x.id === ctx.params.id);
    if (!cur) ctx.fail(404, '资源不存在');
    const g = cur.groupId ? store.listGroupInfos().find(x => x.id === cur.groupId) : null;
    const err = g ? sharedFieldError(g, body) : null;
    if (err) ctx.fail(400, err);
    const res = store.updateResource(ctx.params.id, Object.assign({
      tpm: body.tpm, rpm: body.rpm, tpmTier: body.tpmTier, rpmTier: body.rpmTier,
      cacheHit: body.cacheHit, ttft: body.ttft, successRate: body.successRate, metricAmp: body.metricAmp,
      reportedBy: ctx.user.username
    }, pickShared(body)));
    return { data: res };
  })

  .del('/api/resources/:id', ADMIN_EDIT, ctx => ctx.fail(400, '资源清单随分组信息增删：请在「分组信息」里删除该分组'));
