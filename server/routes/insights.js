'use strict';
// 热销模型排行榜 + 密钥查模型
const http = require('http');
const https = require('https');
const config = require('../config');
const store = require('../store');

// 调上游 /v1/models：密钥只在内存里转发一次，不落盘、不写日志
function fetchModels(key) {
  return new Promise((resolve, reject) => {
    const u = new URL(config.MODELS_API_URL);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, { method: 'GET', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json', 'User-Agent': 'kk-ai-hub-bi' }, timeout: 12000 }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; if (data.length > 5e6) req.destroy(new Error('响应过大')); });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

// 每个账号 10 分钟内最多查 30 次，防止被拿来批量撞密钥
const lookups = new Map();
function tooMany(uid) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const arr = (lookups.get(uid) || []).filter(t => now - t < win);
  if (arr.length >= 30) return true;
  arr.push(now); lookups.set(uid, arr);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of lookups) if (!a.some(t => now - t < 600000)) lookups.delete(k); }, 600000).unref();

module.exports = r => r
  .get('/api/hot-models', () => ({ data: store.getHotModels() }))

  .put('/api/hot-models', { roles: ['admin'], denyMsg: '热销榜由管理员维护' }, async ctx => {
    const body = await ctx.body();
    if (!Array.isArray(body.items)) ctx.fail(400, '请提供排行数据');
    return { data: store.setHotModels(body, ctx.user.username) };
  })

  // 输入 API 密钥，返回该密钥可用的模型，并标注各模型所在的分组
  .post('/api/key-models', async ctx => {
    const body = await ctx.body();
    const key = String(body.key || '').trim().replace(/^Bearer\s+/i, '');
    if (!/^[\x21-\x7e]{8,256}$/.test(key)) ctx.fail(400, '密钥格式不正确，请粘贴完整的 API 密钥（如 sk-xxxx）');
    if (tooMany(ctx.user.id)) ctx.fail(429, '查询太频繁，请 10 分钟后再试');
    let up;
    try { up = await fetchModels(key); } catch (e) { ctx.fail(502, '暂时连不上模型服务，请稍后再试'); }
    let json = null;
    try { json = JSON.parse(up.body); } catch (e) { /* 非 JSON */ }
    if (up.status === 401 || up.status === 403) ctx.fail(400, '密钥无效、已过期或已被禁用');
    if (up.status !== 200 || !json || !Array.isArray(json.data)) {
      const msg = json && json.error && json.error.message ? String(json.error.message).replace(/\(request id:[^)]*\)/, '').trim() : '';
      ctx.fail(502, '模型服务返回异常' + (msg ? '：' + msg.slice(0, 120) : `（${up.status}）`));
    }
    const groups = store.listGroupInfos();
    const ids = [...new Set(json.data.map(m => String(m && m.id || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      count: ids.length,
      data: ids.map(id => ({ id, groups: groups.filter(g => (g.modelIds || []).includes(id)).map(g => ({ vendor: g.vendor, group: g.group })) }))
    };
  });
