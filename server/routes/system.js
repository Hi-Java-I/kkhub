'use strict';
// 系统：BI 看板、系统设置、登录日志、字典、文件下载、测试平台免密跳转、管理员使用说明
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const store = require('../store');
const auth = require('../auth');
const { SYNC_LABELS } = require('../services/sync');

module.exports = r => r
  // 前端共用的字典（档位、类型等），避免前后端各写一份
  .get('/api/meta', () => ({
    tpmTiers: store.TPM_TIERS.map(t => t.key),
    rpmTiers: store.RPM_TIERS.map(t => t.key),
    redundantTpmTiers: store.REDUNDANT_TPM_TIERS,
    syncLabels: SYNC_LABELS,
    noticeTypes: store.NOTICE_TYPES,
    feedbackTypes: store.FEEDBACK_TYPES,
    ssoEnabled: !!config.SSO_SECRET
  }))

  // 管理后台概览：各分组档位 / 填报情况 + 数据统计
  .get('/api/overview', { roles: ['admin'] }, () => ({ data: store.resourceOverview(), stats: store.getStatsFull(), hot: store.getHotModels() }))

  .get('/api/settings', () => ({ data: store.getSettings(), warnSeconds: auth.getWarnSeconds() }))
  .put('/api/settings', { roles: ['admin'], denyMsg: '无权限：仅管理员可修改设置' }, async ctx => {
    const body = await ctx.body();
    try { return { data: store.updateSettings(body) }; } catch (e) { ctx.fail(400, e.message); }
  })

  .get('/api/login-logs', { roles: ['admin'] }, () => ({ data: store.listLoginLogs() }))

  // 管理员版使用说明
  .get('/api/guide/admin', { roles: ['admin'] }, ctx => new Promise(resolve => {
    fs.readFile(path.join(config.DOCS_DIR, 'guide-admin.html'), (err, data) => {
      if (err) { ctx.send(404, { error: '文档不存在' }); return resolve(); }
      ctx.res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      ctx.res.end(data);
      resolve();
    });
  }))

  // 下载《快快AIHub-企业LLM统一接入解决方案》
  .get('/api/files/solution', ctx => new Promise(resolve => {
    const file = path.join(config.FILES_DIR, 'solution.pptx');
    fs.stat(file, (err, st) => {
      if (err) { ctx.send(404, { error: '文件暂未上传' }); return resolve(); }
      const name = encodeURIComponent('快快AIHub-企业LLM统一接入解决方案.pptx');
      ctx.res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Length': st.size,
        'Content-Disposition': `attachment; filename="solution.pptx"; filename*=UTF-8''${name}`,
        'Cache-Control': 'private, max-age=3600'
      });
      const s = fs.createReadStream(file);
      s.on('end', resolve); s.on('error', resolve);
      s.pipe(ctx.res);
    });
  }))

  // 跳转测试平台：BI 看板 → 测试平台单向免密，票据 60 秒有效（见 docs/sso-kkaicool.md）
  .get('/api/sso/kkaicool', ctx => {
    const target = config.KKAICOOL_URL, key = config.SSO_SECRET, u = ctx.user;
    if (!key) { ctx.res.writeHead(302, { Location: target }); ctx.res.end(); return; }
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ u: u.username, name: u.displayName || u.username, role: u.role, iat: now, exp: now + 60, nonce: crypto.randomBytes(12).toString('hex') })).toString('base64url');
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    const url = target + (target.includes('?') ? '&' : '?') + 'kk_ticket=' + encodeURIComponent(payload + '.' + sig);
    ctx.res.writeHead(302, { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    ctx.res.end();
  });
