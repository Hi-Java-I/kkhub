'use strict';
// 兼容入口：Docker 镜像 / start.bat 仍然运行 `node server.js`，实际代码在 server/ 目录
require('./server/index.js');
