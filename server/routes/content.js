'use strict';
// 公告栏 + BD有话说 / 产品有话说
const store = require('../store');

// 频道：bd = BD有话说（普通用户提交）；product = 产品有话说（技术人员提交）；管理员两个都能看
const channelFor = u => (u.role === 'tech' ? 'product' : 'bd');
const noticeCheck = (ctx, body) => {
  if (!String(body.title || '').trim() || !String(body.content || '').trim()) ctx.fail(400, '请填写标题和内容');
};

module.exports = r => r
  // 公告：管理员发布 / 编辑 / 删除；技术人员只读；普通用户不可见
  .get('/api/notices', { roles: ['admin', 'tech'] }, () => ({
    data: store.listNotices().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt),
    types: store.NOTICE_TYPES
  }))
  .post('/api/notices', { roles: ['admin'], denyMsg: '公告栏由管理员填写' }, async ctx => {
    const body = await ctx.body();
    noticeCheck(ctx, body);
    return ctx.send(201, { data: store.addNotice(Object.assign({}, body, { createdBy: ctx.user.username })) });
  })
  .put('/api/notices/:id', { roles: ['admin'], denyMsg: '公告栏由管理员填写' }, async ctx => {
    const body = await ctx.body();
    noticeCheck(ctx, body);
    const n = store.updateNotice(ctx.params.id, Object.assign({}, body, { updatedBy: ctx.user.username }));
    if (!n) ctx.fail(404, '公告不存在');
    return { data: n };
  })
  .del('/api/notices/:id', { roles: ['admin'], denyMsg: '公告栏由管理员填写' }, ctx => {
    if (!store.deleteNotice(ctx.params.id)) ctx.fail(404, '公告不存在');
    return { ok: true };
  })

  // 反馈：所有登录用户可提交；非管理员只看自己的
  .get('/api/feedbacks', ctx => {
    const ch = ctx.user.role === 'admin' ? (ctx.query.channel === 'product' ? 'product' : 'bd') : channelFor(ctx.user);
    let list = store.listFeedbacks().filter(f => f.channel === ch);
    if (ctx.user.role !== 'admin') list = list.filter(f => f.createdBy === ctx.user.username);
    return { data: list.slice().sort((a, b) => b.createdAt - a.createdAt), types: store.FEEDBACK_TYPES };
  })
  .post('/api/feedbacks', async ctx => {
    const body = await ctx.body();
    if (!String(body.content || '').trim()) ctx.fail(400, '请填写内容');
    const recent = store.listFeedbacks().filter(f => f.createdBy === ctx.user.username && Date.now() - f.createdAt < 60000).length;
    if (recent >= 10) ctx.fail(429, '提交太频繁，请稍后再试');
    const ch = ctx.user.role === 'admin' ? (body.channel === 'product' ? 'product' : 'bd') : channelFor(ctx.user);
    return ctx.send(201, { data: store.addFeedback({ channel: ch, category: body.category, content: body.content, createdBy: ctx.user.username }) });
  })
  .del('/api/feedbacks/:id', ctx => {
    const f = store.listFeedbacks().find(x => x.id === ctx.params.id);
    if (!f) ctx.fail(404, '内容不存在');
    if (ctx.user.role !== 'admin' && f.createdBy !== ctx.user.username) ctx.fail(403, '只能删除自己提交的内容');
    store.deleteFeedback(f.id);
    return { ok: true };
  });
