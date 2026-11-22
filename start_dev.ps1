Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd e:\NotebookMyBuild\backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd e:\NotebookMyBuild\frontend; pnpm dev"
Write-Host "已启动后端 (http://localhost:8000) 与前端 (http://localhost:5173)" -ForegroundColor Green
