@echo off
REM Verifies lod_sweep.py after the missing-object fix.
REM  1. happy path  -> 7 levels, JSON emitted
REM  2. empty blend  -> RuntimeError naming the missing object, non-zero exit

set BLENDER="C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
set PROBE=D:\nlt-repos\nlt-world-engine\world-engine-godot\assets\characters\_pipeline_probe
set LOGS=D:\nlt-repos\nlt-world-engine\world-engine-godot\assets\characters\_pipeline_probe\verify
set SRC=D:\nlt-repos\_scratch_lods\lods.blend

if not exist "%LOGS%" mkdir "%LOGS%"

echo === TEST 1: happy path, full ladder ===
%BLENDER% -b "%SRC%" --python "%PROBE%\lod_sweep.py" -- --out "%LOGS%" > "%LOGS%\pass.log" 2>&1
findstr /C:"LODSWEEP_JSON_START" "%LOGS%\pass.log" > nul && echo TEST1_MARKER_OK || echo TEST1_MARKER_MISSING
findstr /R /C:"^\[{" "%LOGS%\pass.log"

echo.
echo === TEST 2: empty blend must fail loudly ===
%BLENDER% -b --factory-startup --python "%PROBE%\lod_sweep.py" -- --out "%LOGS%\empty" > "%LOGS%\fail.log" 2>&1
set RC=%ERRORLEVEL%
findstr /C:"LODSWEEP_ERROR: Required LOD object is missing" "%LOGS%\fail.log" > nul && echo TEST2_GUARD_FIRED || echo TEST2_GUARD_DID_NOT_FIRE
if "%RC%"=="0" (echo TEST2_EXIT_BAD: exit 0, expected non-zero) else (echo TEST2_EXIT_OK: exit %RC%)