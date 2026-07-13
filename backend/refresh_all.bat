@echo off
REM Daily cache refresh — launched by Windows Task Scheduler at 7 AM.
cd /d "C:\Users\Asus\OneDrive\Desktop\primebook_v2\backend"
set SCRAPE_HEADLESS=0
set AUTO_PUSH=1
if not exist logs mkdir logs
echo ================================================== >> logs\refresh.log
"C:\Users\Asus\AppData\Local\Programs\Python\Python314\python.exe" refresh_all.py >> logs\refresh.log 2>&1
