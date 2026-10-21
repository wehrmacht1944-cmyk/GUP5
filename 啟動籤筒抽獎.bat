@echo off
rem ============================================================
rem  Senshado Lottery - offline launcher
rem  - Opens index.html in Microsoft Edge (or Chrome) app window
rem  - Allows BGM / video autoplay without clicking first
rem  - Keeps all lottery data inside the "browser-data" folder
rem    next to this file, so the data moves with the folder/USB.
rem ============================================================
setlocal
set "APPDIR=%~dp0"
set "PROFILE=%APPDIR%browser-data"
set "PAGE=%APPDIR%index.html"
set "FLAGS=--user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --disable-features=Translate --start-maximized"

set "BROWSER="
for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)

if not defined BROWSER (
  echo Edge / Chrome not found. Opening index.html with the default browser...
  start "" "%PAGE%"
  goto :eof
)

start "" "%BROWSER%" %FLAGS% --app="file:///%PAGE:\=/%"
endlocal
