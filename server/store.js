'use strict';
// 轻量级 JSON 文件存储（零依赖，无需数据库安装即可运行）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_ADMIN = { username: 'admin', password: 'admin123', role: 'admin', displayName: '系统管理员' };

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function emptyDb() {
  return {
    users: [],
    resources: [],
    opportunities: [],
    loginLogs: [],
    suppliers: [], // 外部供应商账号（独立填报密码）
    groupInfos: [], // 分组信息展示表（管理员编辑，普通用户只读）
    feedbacks: [], // BD有话说：商务提交的需求 / 行业了解 / 资源了解
    settings: { sessionTimeoutMin: 5, warnSeconds: 30 }, // 系统设置：会话超时/提前提醒秒数
    sessions: {}, // sid -> { userId, createdAt }
    seq: { resources: 1, opportunities: 1, suppliers: 1, groupInfos: 1 }
  };
}

let db = load();

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // 补齐可能缺失的字段
    const base = emptyDb();
    return Object.assign(base, parsed);
  } catch (e) {
    return emptyDb();
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // 先写临时文件再改名：写入中途崩溃也不会把 db.json 写坏
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('保存数据库失败:', e.message);
  }
}

// 首次启动注入默认管理员、演示普通用户与演示数据
function initSeed() {
  const hasAdmin = db.users.some(u => u.role === 'admin');
  if (!hasAdmin) {
    db.users.push({
      id: 1,
      username: DEFAULT_ADMIN.username,
      displayName: DEFAULT_ADMIN.displayName,
      role: DEFAULT_ADMIN.role,
      passwordHash: hashPassword(DEFAULT_ADMIN.password),
      createdAt: Date.now()
    });
  }
  // 演示普通用户：供体验「普通用户登录」使用（管理员可在用户管理中删除/改名）
  const hasNormal = db.users.some(u => u.role === 'user');
  if (!hasNormal) {
    createUser({ username: 'user01', password: 'user0123', displayName: '演示普通用户', role: 'user' });
  }
  // 对外填报已下线：清掉供应商账号（含演示账号 demo供应商/demo123）
  db.suppliers = [];
  // 清理已过期 / 很久未活动的会话（会话超时最长 240 分钟）
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [sid, s] of Object.entries(db.sessions)) if ((s.lastActivity || s.createdAt) < cutoff) delete db.sessions[sid];
  // 分组信息表：首次启用时按现有资源去重生成初始数据（之后由管理员维护，清空也不再重新生成）
  if (!db.groupInfosSeeded) {
    db.groupInfosSeeded = true;
    if (!db.seq.groupInfos) db.seq.groupInfos = 1;
    const seen = new Set();
    for (const r of db.resources) {
      const k = [r.vendor, r.group, r.modelId, r.source].join('|');
      if (seen.has(k) || findGroupInfo(r.vendor, r.group)) continue;
      seen.add(k);
      addGroupInfo({ vendor: r.vendor, group: r.group, modelId: r.modelId, source: r.source, groupDesc: r.groupDesc, updatedBy: 'system' }, true);
    }
  }
  // 分组信息：同一 模型厂商 + 分组 合并为一条（模型ID 合并在一起）
  migrateGroupInfos();
  // 资源清单：关联分组信息、去掉上线时间
  migrateResources();
  save();
}

// ---------- 密码哈希 ----------
function hashPassword(pw, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, s, 64).toString('hex');
  return `${s}:${h}`;
}
function verifyPassword(pw, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [s, h] = stored.split(':');
  const hh = crypto.scryptSync(pw, s, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hh, 'hex'));
  } catch (e) {
    return false;
  }
}

// ---------- 用户 ----------
function findUserByUsername(username) {
  return db.users.find(u => u.username === username);
}
function findUserById(id) {
  return db.users.find(u => u.id === id);
}
function createUser({ username, password, displayName, role }) {
  if (findUserByUsername(username)) throw new Error('用户名已存在');
  const user = {
    id: (db.users.reduce((m, u) => Math.max(m, u.id), 0)) + 1,
    username,
    displayName: displayName || username,
    role: ['admin', 'tech'].includes(role) ? role : 'user',
    passwordHash: hashPassword(password),
    createdAt: Date.now()
  };
  db.users.push(user);
  save();
  return user;
}
function updateUser(id, { displayName, role, password }) {
  const u = findUserById(id);
  if (!u) return null;
  if (displayName !== undefined && displayName !== '') u.displayName = String(displayName).trim();
  if (role !== undefined) u.role = ['admin', 'tech'].includes(role) ? role : 'user';
  if (password !== undefined && password !== '') u.passwordHash = hashPassword(password);
  save();
  return u;
}
function deleteUser(id) {
  const idx = db.users.findIndex(u => u.id === id);
  if (idx < 0) return false;
  db.users.splice(idx, 1);
  save();
  return true;
}

// ---------- 供应商（外部填报账号，独立密码） ----------
function findSupplierByName(name) {
  return db.suppliers.find(s => s.name === name);
}
function findSupplierById(id) {
  return db.suppliers.find(s => s.id === id);
}
function createSupplier({ name, password, displayName, active }) {
  if (!name || !password) throw new Error('供应商名称与密码为必填');
  if (findSupplierByName(String(name).trim())) throw new Error('供应商名称已存在');
  if (String(password).length < 4) throw new Error('供应商密码至少 4 位');
  const s = {
    id: (db.seq.suppliers || 1),
    name: String(name).trim(),
    displayName: displayName ? String(displayName).trim() : String(name).trim(),
    passwordHash: hashPassword(password),
    active: active !== false,
    createdAt: Date.now()
  };
  db.seq.suppliers = (db.seq.suppliers || 1) + 1;
  db.suppliers.push(s);
  save();
  return s;
}
function updateSupplier(id, { displayName, password, active }) {
  const s = findSupplierById(id);
  if (!s) return null;
  if (displayName !== undefined && displayName !== '') s.displayName = String(displayName).trim();
  if (password !== undefined && password !== '') {
    if (String(password).length < 4) throw new Error('供应商密码至少 4 位');
    s.passwordHash = hashPassword(password);
  }
  if (active !== undefined) s.active = !!active;
  save();
  return s;
}
function deleteSupplier(id) {
  const idx = db.suppliers.findIndex(s => s.id === id);
  if (idx < 0) return false;
  db.suppliers.splice(idx, 1);
  save();
  return true;
}
function listSuppliers() {
  return db.suppliers.map(s => ({ id: s.id, name: s.name, displayName: s.displayName, active: s.active, createdAt: s.createdAt }));
}
function verifySupplier(name, password) {
  const s = findSupplierByName(name);
  if (!s || !s.active) return null;
  return store_verify(s, password) ? s : null;
}
// 独立校验（避免与用户校验重名冲突）
function store_verify(s, password) {
  return verifyPassword(password, s.passwordHash);
}

// ---------- 系统设置 ----------
function getSettings() {
  if (!db.settings) db.settings = { sessionTimeoutMin: 5, warnSeconds: 30 };
  return db.settings;
}
function updateSettings(partial) {
  const cur = getSettings();
  if (partial.sessionTimeoutMin !== undefined) {
    const v = Number(partial.sessionTimeoutMin);
    if (!isFinite(v) || v < 1 || v > 240) throw new Error('超时分钟数需在 1-240 之间');
    cur.sessionTimeoutMin = v;
  }
  if (partial.warnSeconds !== undefined) {
    const v = Number(partial.warnSeconds);
    if (!isFinite(v) || v < 0 || v > 600) throw new Error('提前提醒秒数需在 0-600 之间');
    cur.warnSeconds = v;
  }
  save();
  return cur;
}

// ---------- 会话 ----------
function createSession(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.sessions[sid] = { userId, createdAt: now, lastActivity: now };
  save();
  return sid;
}
function getSession(sid) {
  return db.sessions[sid] || null;
}
// 滑动续期：每次活动刷新 lastActivity（节流落盘，避免频繁写文件）
let lastTouchSave = 0;
function touchSession(sid) {
  const s = db.sessions[sid];
  if (!s) return;
  s.lastActivity = Date.now();
  if (Date.now() - lastTouchSave > 60000) { save(); lastTouchSave = Date.now(); }
}
function destroySession(sid) {
  delete db.sessions[sid];
  save();
}

// ---------- 登录日志 ----------
function logLogin({ username, ip, userAgent, result }) {
  db.loginLogs.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    username,
    ip: ip || 'unknown',
    userAgent: userAgent || 'unknown',
    result: result || 'success',
    time: Date.now()
  });
  if (db.loginLogs.length > 500) db.loginLogs.length = 500;
  save();
}

// ---------- 资源量档位（w = 万）：资源清单按档位填写 TPM / RPM ----------
// capacity：用于折线图 / 匹配计算的容量值，取档位上限（「以上」档取下限）
const TPM_TIERS = [
  { key: '500w-1000w', min: 5e6, max: 1e7 },
  { key: '1000w-2000w', min: 1e7, max: 2e7 },
  { key: '2000w-3000w', min: 2e7, max: 3e7 },
  { key: '3000w-5000w', min: 3e7, max: 5e7 },
  { key: '5000w以上', min: 5e7, max: Infinity }
];
const RPM_TIERS = [
  { key: '500-1000', min: 500, max: 1000 },
  { key: '1000-2000', min: 1000, max: 2000 },
  { key: '2000-3000', min: 2000, max: 3000 },
  { key: '3000-5000', min: 3000, max: 5000 },
  { key: '5000以上', min: 5000, max: Infinity }
];
// 「资源冗余，可尽快挖掘商机」的 TPM 档位
const REDUNDANT_TPM_TIERS = ['3000w-5000w', '5000w以上'];
const tierCapacity = t => (isFinite(t.max) ? t.max : t.min);
// 接受档位名（如「1000w-2000w」「5000w以上」）或数字；数字按「≤ 档位上限」归档，低于最低档归入最低档
function toTier(v, tiers) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const str = String(v).trim().replace(/\s+/g, '').replace(/万/g, 'w').replace(/[－—~～]/g, '-').replace(/\+$/, '以上');
  const byKey = tiers.find(t => t.key.toLowerCase() === str.toLowerCase());
  if (byKey) return byKey;
  const n = Number(str);
  if (!isFinite(n) || n <= 0) return null;
  return tiers.find(t => n <= t.max) || tiers[tiers.length - 1];
}

// ---------- 资源清单（与分组信息一一对应：每个分组一行，只需选 TPM / RPM 档位） ----------
// 模型厂商 / 分组 / 资源来源 以分组信息为准（两边任一修改都同步）；填报日期 = 实际填写 TPM/RPM 的当天
const resourceOfGroup = gid => db.resources.find(r => r.groupId === gid);
// 每个分组保证有且只有一行资源（新分组默认 TPM/RPM 为 0、未填报）
function ensureGroupResource(g, by) {
  let r = resourceOfGroup(g.id);
  if (!r) {
    r = { id: db.seq.resources++, groupId: g.id, vendor: g.vendor, group: g.group, source: g.source,
      tpm: 0, rpm: 0, tpmTier: '', rpmTier: '', cacheHit: null, ttft: null, successRate: null, metricsHistory: [], reportDate: '', reportedBy: '', createdBy: by || 'system', createdAt: Date.now() };
    db.resources.push(r);
  }
  return r;
}
// 按「模型厂商 + 分组」填报 TPM/RPM（批量上传 / 对外填报用）：分组不存在则在分组信息里新建，模型ID 追加到分组
function addResource(data, skipSave) {
  let g = data.groupId ? db.groupInfos.find(x => x.id === Number(data.groupId)) : findGroupInfo(data.vendor, data.group);
  if (!g && data.vendor && data.group) g = addGroupInfo({ vendor: data.vendor, group: data.group, modelIds: [], source: data.source, groupDesc: data.groupDesc, updatedBy: data.createdBy }, true);
  if (!g) return null;
  toModelIds(data.modelIds !== undefined ? data.modelIds : data.modelId).forEach(m => { if (!g.modelIds.includes(m)) g.modelIds.push(m); });
  if (String(data.source || '').trim()) g.source = String(data.source).trim();
  syncResourcesFromGroup(g);
  const r = ensureGroupResource(g, data.createdBy);
  setResourceTiers(r, data.tpmTier !== undefined ? data.tpmTier : data.tpm, data.rpmTier !== undefined ? data.rpmTier : data.rpm);
  const m = {}; METRIC_KEYS.forEach(k => { if (String(data[k] == null ? '' : data[k]).trim() !== '') m[k] = data[k]; });
  setResourceMetrics(r, m);
  r.reportDate = todayStr();
  r.reportedBy = data.createdBy || 'unknown';
  if (!skipSave) save();
  return r;
}
// 资源侧只改 TPM / RPM；模型厂商 / 分组 / 资源来源 的修改写回分组信息，再同步回资源
function updateResource(id, data) {
  const r = db.resources.find(x => x.id === id);
  if (!r) return null;
  let filled = false;
  const tpmIn = data.tpmTier !== undefined ? data.tpmTier : data.tpm;
  const rpmIn = data.rpmTier !== undefined ? data.rpmTier : data.rpm;
  if (tpmIn !== undefined || rpmIn !== undefined) {
    setResourceTiers(r, tpmIn !== undefined ? tpmIn : r.tpmTier, rpmIn !== undefined ? rpmIn : r.rpmTier);
    filled = true;
  }
  if (setResourceMetrics(r, data)) filled = true;
  if (filled) { r.reportDate = todayStr(); r.reportedBy = data.reportedBy || r.reportedBy; }
  const g = db.groupInfos.find(x => x.id === r.groupId);
  const shared = {};
  ['vendor', 'group', 'source'].forEach(k => { if (data[k] !== undefined) shared[k] = String(data[k]).trim(); });
  if (g && Object.keys(shared).length) updateGroupInfo(g.id, shared, true);
  save();
  return r;
}
// 写入档位，同时把容量数值设为档位对应值（用于折线图 / 资源紧张度计算）
function setResourceTiers(r, tpmInput, rpmInput) {
  const t = toTier(tpmInput, TPM_TIERS), q = toTier(rpmInput, RPM_TIERS);
  r.tpmTier = t ? t.key : '';
  r.rpmTier = q ? q.key : '';
  r.tpm = t ? tierCapacity(t) : 0;
  r.rpm = q ? tierCapacity(q) : 0;
}
const METRIC_KEYS = ['cacheHit', 'ttft', 'successRate'];
function toMetric(v, key) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[%％s秒\s]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  if (key !== 'ttft' && n > 100) return null;
  return Math.round(n * 100) / 100;
}
const METRIC_AMPS = [1, 5]; // 每小时波动上下幅度（%，相对基准值）
function setResourceMetrics(r, data) {
  if (!METRIC_KEYS.some(k => data[k] !== undefined) && data.metricAmp === undefined) return false;
  if (data.metricAmp !== undefined) r.metricAmp = METRIC_AMPS.includes(Number(data.metricAmp)) ? Number(data.metricAmp) : (r.metricAmp || 1);
  // 留空 = 清除；填了非法值（负数、百分比超过 100）则保持原值
  METRIC_KEYS.forEach(k => {
    if (data[k] === undefined) return;
    const blank = data[k] === null || String(data[k]).trim() === '';
    const v = toMetric(data[k], k);
    if (blank || v !== null) r[k] = v;
  });
  const now = Date.now(), hour = Math.floor(now / 3600000);
  r.metricsHistory = (r.metricsHistory || []).filter(h => Math.floor(h.ts / 3600000) !== hour);
  r.metricsHistory.push({ ts: now, date: todayStr(), cacheHit: r.cacheHit, ttft: r.ttft, successRate: r.successRate, amp: r.metricAmp || 1 });
  r.metricsHistory.sort((a, b) => a.ts - b.ts);
  if (r.metricsHistory.length > 200) r.metricsHistory = r.metricsHistory.slice(-200);
  return true;
}
// 分组信息变化后，把 模型厂商 / 分组 / 资源来源 同步到对应资源
function syncResourcesFromGroup(g) {
  for (const r of db.resources) {
    if (r.groupId !== g.id) continue;
    r.vendor = g.vendor; r.group = g.group; r.source = g.source;
  }
}
// 资源清单整理（每次启动执行，可重复）：
// 去掉不属于任何分组的资源（旧演示数据）、去掉旧字段，每个分组只保留一行，再给没有资源行的分组补一行
function migrateResources() {
  const seen = new Set();
  db.resources = db.resources.filter(r => {
    const g = db.groupInfos.find(x => x.id === r.groupId);
    if (!g || seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
  for (const r of db.resources) {
    delete r.onlineTime; delete r.groupDesc; delete r.modelId; delete r.linked;
    if (r.reportedBy === undefined) r.reportedBy = r.reportDate ? r.createdBy : '';
    METRIC_KEYS.forEach(k => { if (r[k] === undefined) r[k] = null; });
    if (!Array.isArray(r.metricsHistory)) r.metricsHistory = [];
    if (!r.metricAmp) r.metricAmp = 1;
    r.metricsHistory.forEach(h => { if (!h.ts) h.ts = Date.parse(h.date + 'T00:00:00+08:00'); if (!h.amp) h.amp = r.metricAmp; });
    if (r.tpmTier === undefined) {
      if (r.reportDate) setResourceTiers(r, r.tpm, r.rpm);
      else { r.tpmTier = ''; r.rpmTier = ''; }
    }
    syncResourcesFromGroup(db.groupInfos.find(x => x.id === r.groupId));
  }
  db.groupInfos.forEach(g => ensureGroupResource(g));
}
// 资源按模型展开：一个分组的 TPM/RPM 计入它的每个模型（某模型的容量 = 所有含该模型的分组之和）
// ---------- 分组信息（模型厂商 / 分组 / 模型ID / 资源来源 / 分组说明 / 参数说明） ----------
// 管理员同步给商机的资源情况：资源紧张 / 资源充足 / 资源冗余
const SYNC_STATUSES = ['tight', 'sufficient', 'redundant'];
const pick = (v, allowed) => (allowed.includes(String(v || '').trim()) ? String(v).trim() : '');
function addGroupInfo(data, skipSave) {
  if (!db.seq.groupInfos) db.seq.groupInfos = 1;
  const g = {
    id: db.seq.groupInfos++,
    vendor: String(data.vendor || '').trim(),
    group: String(data.group || '').trim(),
    modelIds: toModelIds(data.modelIds !== undefined ? data.modelIds : data.modelId),
    source: String(data.source || '').trim(),
    groupDesc: String(data.groupDesc || '').trim(),
    paramDesc: String(data.paramDesc || '').trim(),
    resourceStatus: pick(data.resourceStatus, SYNC_STATUSES) || 'sufficient',
    updatedBy: data.updatedBy || 'unknown',
    updatedAt: Date.now()
  };
  db.groupInfos.push(g);
  ensureGroupResource(g, data.updatedBy);
  if (!skipSave) save();
  return g;
}
// 模型ID 列表：接受数组或字符串（换行 / 逗号 / 分号 / 顿号分隔），去空去重
function toModelIds(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[\r\n,，;；、]+/);
  return [...new Set(arr.map(s => String(s).trim()).filter(Boolean))];
}
const findGroupInfo = (vendor, group) => db.groupInfos.find(g => g.vendor === String(vendor || '').trim() && g.group === String(group || '').trim());
// 批量上新：同一 模型厂商 + 分组 已存在则合并模型ID（并用新填的非空字段覆盖），否则新建
function upsertGroupInfo(data) {
  const g = findGroupInfo(data.vendor, data.group);
  if (!g) return { g: addGroupInfo(data, true), merged: false };
  g.modelIds = toModelIds(g.modelIds.concat(toModelIds(data.modelIds !== undefined ? data.modelIds : data.modelId)));
  ['source', 'groupDesc', 'paramDesc'].forEach(k => { if (String(data[k] || '').trim()) g[k] = String(data[k]).trim(); });
  if (pick(data.resourceStatus, SYNC_STATUSES)) g.resourceStatus = data.resourceStatus;
  if (data.updatedBy) g.updatedBy = data.updatedBy;
  g.updatedAt = Date.now();
  syncResourcesFromGroup(g);
  return { g, merged: true };
}
// 旧数据（每行一个 modelId）迁移：同一 模型厂商 + 分组 合并成一条，模型ID 合并去重
function migrateGroupInfos() {
  if (!db.groupInfos.some(g => !Array.isArray(g.modelIds))) return;
  const merged = [];
  for (const g of db.groupInfos) {
    const ids = toModelIds(g.modelIds !== undefined ? g.modelIds : g.modelId);
    const same = merged.find(x => x.vendor === g.vendor && x.group === g.group);
    if (same) {
      same.modelIds = toModelIds(same.modelIds.concat(ids));
      ['source', 'groupDesc', 'paramDesc'].forEach(k => { if (!same[k] && g[k]) same[k] = g[k]; });
      continue;
    }
    const n = Object.assign({}, g, { modelIds: ids });
    delete n.modelId;
    merged.push(n);
  }
  db.groupInfos = merged;
}
function updateGroupInfo(id, data, skipSave) {
  const g = db.groupInfos.find(x => x.id === id);
  if (!g) return null;
  ['vendor', 'group', 'source', 'groupDesc', 'paramDesc'].forEach(k => {
    if (data[k] !== undefined) g[k] = String(data[k]).trim();
  });
  if (data.modelIds !== undefined || data.modelId !== undefined) g.modelIds = toModelIds(data.modelIds !== undefined ? data.modelIds : data.modelId);
  if (data.resourceStatus !== undefined) g.resourceStatus = pick(data.resourceStatus, SYNC_STATUSES) || 'sufficient';
  if (data.updatedBy) g.updatedBy = data.updatedBy;
  g.updatedAt = Date.now();
  syncResourcesFromGroup(g);
  if (!skipSave) save();
  return g;
}
function deleteGroupInfo(id) {
  const idx = db.groupInfos.findIndex(x => x.id === id);
  if (idx < 0) return false;
  db.groupInfos.splice(idx, 1);
  db.resources = db.resources.filter(r => r.groupId !== id);
  save();
  return true;
}

// ---------- BD有话说 ----------
const FEEDBACK_TYPES = { bd: ['需求反馈', '行业了解', '资源了解'], product: ['产品需求', '问题反馈', '优化建议'] };
function addFeedback({ channel, category, content, createdBy }) {
  const ch = FEEDBACK_TYPES[channel] ? channel : 'bd';
  if (!Array.isArray(db.feedbacks)) db.feedbacks = [];
  if (!db.seq.feedbacks) db.seq.feedbacks = 1;
  const f = {
    id: db.seq.feedbacks++,
    channel: ch,
    category: FEEDBACK_TYPES[ch].includes(category) ? category : FEEDBACK_TYPES[ch][0],
    content: String(content || '').trim().slice(0, 2000),
    createdBy: createdBy || 'unknown',
    date: todayStr(),
    createdAt: Date.now()
  };
  db.feedbacks.push(f);
  save();
  return f;
}
function deleteFeedback(id) {
  const idx = (db.feedbacks || []).findIndex(f => f.id === id);
  if (idx < 0) return false;
  db.feedbacks.splice(idx, 1);
  save();
  return true;
}

// ---------- 公告栏（管理员填写，技术人员查看）：平台新功能 / 问题汇总 ----------
const NOTICE_TYPES = ['新功能', '问题汇总'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function noticeFields(data) {
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  return {
    type: NOTICE_TYPES.includes(data.type) ? data.type : NOTICE_TYPES[0],
    title: s(data.title, 100),
    content: s(data.content, 3000),
    vendor: s(data.vendor, 100),
    group: s(data.group, 100),
    date: DATE_RE.test(String(data.date || '')) ? String(data.date) : todayStr()
  };
}
function listNotices() {
  if (!Array.isArray(db.notices)) db.notices = [];
  return db.notices;
}
function addNotice(data) {
  if (!db.seq.notices) db.seq.notices = 1;
  const n = Object.assign({ id: db.seq.notices++ }, noticeFields(data), { createdBy: data.createdBy || 'admin', createdAt: Date.now(), updatedAt: Date.now() });
  listNotices().push(n);
  save();
  return n;
}
function updateNotice(id, data) {
  const n = listNotices().find(x => x.id === id);
  if (!n) return null;
  Object.assign(n, noticeFields(data), { updatedBy: data.updatedBy, updatedAt: Date.now() });
  save();
  return n;
}
function deleteNotice(id) {
  const idx = listNotices().findIndex(x => x.id === id);
  if (idx < 0) return false;
  db.notices.splice(idx, 1);
  save();
  return true;
}

// ---------- 上周热销模型排行榜（管理员维护） ----------
const DATE_OK = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v));
function getHotModels() {
  return db.hotModels || { from: '', to: '', unit: '调用量', items: [], updatedAt: 0, updatedBy: '' };
}
function setHotModels(data, by) {
  const items = (Array.isArray(data.items) ? data.items : []).map(it => ({
    model: String(it.model || '').trim().slice(0, 120),
    vendor: String(it.vendor || '').trim().slice(0, 60),
    value: Math.max(0, Number(String(it.value == null ? '' : it.value).replace(/[,，\s]/g, '')) || 0)
  })).filter(it => it.model && it.value > 0);
  const seen = new Set();
  const uniqItems = items.filter(it => (seen.has(it.model) ? false : seen.add(it.model))).sort((a, b) => b.value - a.value).slice(0, 50);
  db.hotModels = {
    from: DATE_OK(data.from) ? data.from : '', to: DATE_OK(data.to) ? data.to : '',
    unit: String(data.unit || '调用量').trim().slice(0, 20) || '调用量',
    items: uniqItems, updatedAt: Date.now(), updatedBy: by || ''
  };
  save();
  return db.hotModels;
}

// ---------- 资源概览（管理员）：按分组列出档位与填报情况 ----------
function resourceOverview() {
  return db.resources.map(r => {
    const g = db.groupInfos.find(x => x.id === r.groupId);
    return g ? { id: r.id, groupId: g.id, vendor: g.vendor, group: g.group, modelCount: g.modelIds.length, tpmTier: r.tpmTier, rpmTier: r.rpmTier,
      tpm: r.tpm, rpm: r.rpm, cacheHit: r.cacheHit, ttft: r.ttft, successRate: r.successRate, reportDate: r.reportDate, reportedBy: r.reportedBy } : null;
  }).filter(Boolean);
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}

function listUsers() {
  return db.users.map(u => Object.assign({ createdAt: u.createdAt }, publicUser(u)));
}

module.exports = {
  initSeed,
  // user
  findUserByUsername, findUserById, createUser, updateUser, deleteUser, verifyPassword, publicUser,
  // session
  createSession, getSession, destroySession, touchSession,
  // login logs
  logLogin,
  // resources
  listResources: () => db.resources,
  addResource, updateResource,
  listFeedbacks: () => (db.feedbacks || []).map(f => (f.channel ? f : Object.assign(f, { channel: 'bd' }))), addFeedback, deleteFeedback, FEEDBACK_TYPES,
  listNotices, addNotice, updateNotice, deleteNotice, NOTICE_TYPES,
  getHotModels, setHotModels, resourceOverview,
  // group infos
  listGroupInfos: () => db.groupInfos,
  TPM_TIERS, RPM_TIERS, REDUNDANT_TPM_TIERS, toTier, SYNC_STATUSES, DATA_DIR,
  findGroupInfo,
  addGroupInfo, updateGroupInfo, deleteGroupInfo, upsertGroupInfo, toModelIds, saveNow: () => save(),
  // bi
  // suppliers
  findSupplierByName, findSupplierById, createSupplier, updateSupplier, deleteSupplier,
  listSuppliers, verifySupplier,
  // settings
  getSettings, updateSettings,
  listLoginLogs: () => db.loginLogs,
  getStatsFull: () => ({ users: db.users.length, groups: db.groupInfos.length, resources: db.resources.length, filled: db.resources.filter(r => r.reportDate).length, notices: (db.notices || []).length, feedbacks: (db.feedbacks || []).length }),
  listUsers,
  getStats: () => ({ users: db.users.length, resources: db.resources.length })
};
