@echo off
:: JOOS v1.1 - Enable Debug Mode
:: This allows unsigned CEP extensions to run in After Effects

echo.
echo ========================================
echo   JOOS v1.1 - Debug Mode Enabler
echo ========================================
echo.
echo This will enable debug mode for Adobe CEP extensions.
echo After running this, restart After Effects.
echo.
pause

:: Set registry key for CEP debug mode
echo Adding registry key...
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f

echo.
echo ========================================
echo   Success!
echo ========================================
echo.
echo Debug mode enabled for CEP extensions.
echo Please restart After Effects.
echo.
pause
