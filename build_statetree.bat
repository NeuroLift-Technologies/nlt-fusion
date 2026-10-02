@echo off
setlocal
set "UE_DIR=C:\Program Files\Epic Games\UE_5.8"
set "PROJECT=D:\nlt-repos\nlt-world-engine\WorldEngine\WorldEngine.uproject"
echo Building WorldEngineEditor Win64 Development...
"%UE_DIR%\Engine\Build\BatchFiles\Build.bat" WorldEngineEditor Win64 Development -Project="%PROJECT%" -NoFail
echo Exit code: %ERRORLEVEL%