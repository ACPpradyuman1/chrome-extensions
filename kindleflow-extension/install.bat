@echo off
rem KindleFlow 1-Click Native Host Installer for Windows
setlocal enabledelayedexpansion

set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"

echo === KindleFlow Setup ===

rem 1. Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is required but not found in PATH.
    echo Please install Python (https://www.python.org/) and ensure "Add to PATH" is checked.
    pause
    exit /b 1
)

rem 2. Install Dependencies
echo Checking Python dependencies...
python -c "import ebooklib, PIL, markdown, lxml" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -q -r "%DIR%\requirements.txt"
) else (
    echo Python dependencies already satisfied.
)

rem 3. Generate Host JSON Manifest
set "MANIFEST=%DIR%\com.kindleflow.host.json"
(
echo {
echo   "name": "com.kindleflow.host",
echo   "description": "KindleFlow Native Messaging Host",
echo   "path": "%DIR:\=\\%\\native_host.py",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://caonpbhbkpngfnfjleigonphfobjbkil/"
echo   ]
echo }
) > "%MANIFEST%"

rem 4. Register in Windows Registry for Chrome, Brave, and Edge
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.kindleflow.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul 2>&1
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.kindleflow.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.kindleflow.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul 2>&1

echo.
echo === Setup Complete ===
echo.
echo Next step (load into Chrome):
echo 1. Open chrome://extensions
echo 2. Enable 'Developer mode' (toggle in top right)
echo 3. Click 'Load unpacked' and select:
echo    %DIR%
echo.
pause
