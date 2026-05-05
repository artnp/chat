$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Write-Host "========================================"
Write-Host "      สร้างลิงก์ข้อมูลติดต่อ (Contact Info)      "
Write-Host "========================================"
Write-Host ""
Write-Host "กำลังสร้างลิงก์..."

# สุ่ม Room ID อัตโนมัติ (8 ตัวอักษร)
$chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
$roomId = -join (1..8 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })

$domain = "https://artnp.github.io/chat"
$t = [int64]([datetime]::UtcNow - [datetime]'1970-01-01').TotalMilliseconds

# ลิงก์สำหรับลูกค้า (เปิด Modal ข้อมูลติดต่อ)
$url_customer = "$domain/?room=$roomId&line=1&t=$t&k=eworker"
# ลิงก์สำหรับคุณ (หน้าแชทปกติ)
$url_admin = "$domain/?room=$roomId"

$msg = "✅กดดูที่นี่: $url_customer"

Set-Clipboard -Value $msg

Write-Host "เสร็จเรียบร้อย! คัดลอกข้อความลงคลิปบอร์ดแล้ว" -ForegroundColor Green
Write-Host "คุณสามารถนำไปวาง (Ctrl+V) ให้ลูกค้าในแชทอื่นได้เลย"
Write-Host ""
Write-Host "ลิงก์แชทสำหรับคุณคือ: $url_admin" -ForegroundColor Cyan

Start-Sleep -Seconds 3
