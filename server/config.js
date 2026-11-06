'use strict';
// 运行配置：全部来自环境变量，便于前后端分开部署
const path = require('path');

const ROOT = path.join(__dirname, '..');

const config = {
  ROOT,
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  SECRET: process.env.KK_SECRET || 'kk-ai-hub-secret-change-me',
  IS_PROD: process.env.NODE_ENV === 'production',
  // 部署在 Nginx 后面时设为 1：限流 / 登录日志取 Nginx 写入的 X-Real-IP
  TRUST_PROXY: process.env.TRUST_PROXY === '1',
  // 前端静态目录；SERVE_WEB=0 时后端只提供 /api（前端交给 Nginx 等独立托管）
  WEB_DIR: process.env.WEB_DIR || path.join(ROOT, 'web'),
  SERVE_WEB: process.env.SERVE_WEB !== '0',
  DOCS_DIR: path.join(ROOT, 'docs'),
  FILES_DIR: path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'files'),
  COOKIE_NAME: 'kk_session',
  KKAICOOL_URL: process.env.KKAICOOL_URL || 'http://kkaicool.northsea.site/sso/kk',
  // 「密钥查模型」转发的上游地址（OpenAI 兼容 /v1/models）
  MODELS_API_URL: process.env.MODELS_API_URL || 'https://ai-api.kkidc.com/v1/models',
  SSO_SECRET: process.env.SSO_SECRET || ''
};

if (!process.env.KK_SECRET && config.IS_PROD) {
  console.error('生产环境必须设置 KK_SECRET 环境变量（用于签名登录会话），已拒绝启动');
  process.exit(1);
}

module.exports = config;
