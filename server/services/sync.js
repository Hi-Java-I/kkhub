'use strict';
// 资源清单 ↔ 分组信息 共享字段的校验
const store = require('../store');

const SYNC_LABELS = { tight: '资源紧张', sufficient: '资源充足', redundant: '资源冗余' };

// 分组的「资源情况」是管理员内部标记，非管理员不返回
function stripGroupStatus(g) {
  const out = Object.assign({}, g);
  delete out.resourceStatus;
  return out;
}
// 资源清单与分组信息共享的字段：模型厂商 / 分组 / 资源来源
function pickShared(body) {
  const out = {};
  ['vendor', 'group', 'source'].forEach(k => { if (body[k] !== undefined) out[k] = String(body[k]).trim(); });
  return out;
}
// 改名后不能与另一个已存在的「模型厂商 + 分组」重名，厂商 / 分组也不能改成空
function sharedFieldError(g, body) {
  const vendor = body.vendor !== undefined ? String(body.vendor).trim() : g.vendor;
  const group = body.group !== undefined ? String(body.group).trim() : g.group;
  if (!vendor || !group) return '模型厂商 / 分组 不能为空';
  const other = store.findGroupInfo(vendor, group);
  if (other && other.id !== g.id) return `分组信息里已存在「${vendor} · ${group}」，不能重名`;
  return null;
}

module.exports = { SYNC_LABELS, stripGroupStatus, pickShared, sharedFieldError };
