@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 请确认已关闭正在运行的看板服务窗口（start.bat / node server.js）！
pause
node reset-admin.js %*
pause
