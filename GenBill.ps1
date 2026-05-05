$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Write-Host "========================================"
Write-Host "      สร้างลิงก์เรียกเก็บเงิน (Billing)      "
Write-Host "========================================"
Write-Host ""

$amount = Read-Host "ใส่จำนวนเงิน (เช่น 250)"

Write-Host ""
Write-Host "กำลังสร้างลิงก์..."

# สุ่ม Room ID อัตโนมัติ (8 ตัวอักษร)
$chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
$roomId = -join (1..8 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })

$domain = "https://artnp.github.io/chat"
$t = [int64]([datetime]::UtcNow - [datetime]'1970-01-01').TotalMilliseconds

# ลิงก์สำหรับลูกค้า (มีบิล)
$url_customer = "$domain/?room=$roomId&bill=$amount&t=$t&k=eworker"
# ลิงก์สำหรับคุณ (หน้าแชทปกติ)
$url_admin = "$domain/?room=$roomId"

$msg = "✅ในนี้ให้คิดแพงมาก!! 🤑เพื่อผลประโยชน์ลูกค้าที่น่ารัก ไปชำระช่องทางนี้กัน: $url_customer"

Set-Clipboard -Value $msg

Write-Host "เสร็จเรียบร้อย! คัดลอกข้อความลงคลิปบอร์ดแล้ว" -ForegroundColor Green
Write-Host "คุณสามารถนำไปวาง (Ctrl+V) ให้ลูกค้าในแชทอื่น (เช่น LINE/FB) ได้เลย"
Write-Host ""
Write-Host "ลิงก์แชทสำหรับคุณคือ: $url_admin" -ForegroundColor Cyan

Start-Sleep -Seconds 3
