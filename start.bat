@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js 16+ : https://nodejs.org/
  pause
  exit /b 1
)
if "%PORT%"=="" set PORT=3000
echo 正在启动 KK AI Hub 资源看板 ... 主界面 http://localhost:%PORT%   管理后台 http://localhost:%PORT%/admin
start "" http://localhost:%PORT%
node server.js
pause
