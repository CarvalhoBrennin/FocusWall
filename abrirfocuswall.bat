@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
call "%ROOT%abrir-dashboard.bat" %*
exit /b %ERRORLEVEL%
