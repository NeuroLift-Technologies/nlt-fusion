@echo off
node --check src\materials\pbr.js > chk2.txt 2>&1
echo pbr:%ERRORLEVEL% >> chk2.txt
node --check src\world\terrain.js >> chk2.txt 2>&1
echo terrain:%ERRORLEVEL% >> chk2.txt
node --check src\world\vegetation.js >> chk2.txt 2>&1
echo veg:%ERRORLEVEL% >> chk2.txt
node --check src\world\settlement.js >> chk2.txt 2>&1
echo sett:%ERRORLEVEL% >> chk2.txt
node --check src\world\water.js >> chk2.txt 2>&1
echo water:%ERRORLEVEL% >> chk2.txt
node --check src\character\Character.js >> chk2.txt 2>&1
echo char:%ERRORLEVEL% >> chk2.txt
node --check src\main.js >> chk2.txt 2>&1
echo main:%ERRORLEVEL% >> chk2.txt
echo DONE >> chk2.txt
