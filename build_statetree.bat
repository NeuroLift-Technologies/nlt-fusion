@echo off
setlocal EnableDelayedExpansion
set "UE_DIR=%UE_DIR%"
if "%UE_DIR%"=="" set "UE_DIR=C:\Program Files\Epic Games\UE_5.8"
set "PROJECT=%~dp0WorldEngine\WorldEngine.uproject"
echo Building WorldEngineEditor Win64 Development...
"%UE_DIR%\Engine\Build\BatchFiles\Build.bat" WorldEngineEditor Win64 Development -Project="%PROJECT%"
exit /b %ERRORLEVEL%