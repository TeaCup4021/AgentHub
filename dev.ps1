$croot = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Backend window ---
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Backend starting on :8080...' -ForegroundColor Cyan; uvicorn app.main:app --reload --port 8080" -WorkingDirectory "$croot\backend"

# --- Frontend window ---
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Frontend starting on :5173...' -ForegroundColor Green; npm run dev" -WorkingDirectory "$croot\agenthub-web"

Write-Host "Two terminals launched!" -ForegroundColor Yellow
Write-Host "  Backend : http://localhost:8080" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Green