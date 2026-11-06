'use strict';
// 重置账户：清空所有用户/会话/登录日志，只保留一个管理员。
// 用法（必须先关闭正在运行的看板服务，否则会被内存中的旧数据覆盖）：
//   node reset-admin.js            → 随机生成密码
//   node reset-admin.js 你的密码    → 使用指定密码
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'db.json');
const d = JSON.parse(fs.readFileSync(DB, 'utf8'));

const bak = path.join(path.dirname(DB), `db.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.copyFileSync(DB, bak);

let pw = process.argv[2];
if (!pw) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  pw = Array.from(crypto.randomBytes(12), b => a[b % a.length]).join('');
}
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64).toString('hex');

d.users = [{ id: 1, username: 'admin', displayName: '系统管理员', role: 'admin', passwordHash: `${salt}:${hash}`, createdAt: Date.now() }];
d.sessions = {};
d.loginLogs = [];
d.suppliers = [];
fs.writeFileSync(DB, JSON.stringify(d, null, 2), 'utf8');

console.log('\n  账户已重置（旧数据备份: ' + path.basename(bak) + '）');
console.log('  管理员账号: admin');
console.log('  管理员密码: ' + pw + '\n');
