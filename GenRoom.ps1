$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Write-Host "========================================"
Write-Host "         สร้างห้องแชท (GenRoom)           "
Write-Host "========================================"
Write-Host ""
Write-Host "กำลังสร้างห้องแชทใหม่..."

# สุ่ม Room ID อัตโนมัติ (8 ตัวอักษร)
$chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
$roomId = -join (1..8 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })

$publicDomain = "https://artnp.github.io/chat"
$publicUrl = "$publicDomain/?room=$roomId"
$localUrl = "http://127.0.0.1/chat/?room=$roomId"

$msg = "✅คุยกันในนี้นะ ปลอดภัยกว่า!`r`n$publicUrl"

Set-Clipboard -Value $msg

Write-Host "เสร็จเรียบร้อย! คัดลอกข้อความลงคลิปบอร์ดแล้ว" -ForegroundColor Green
Write-Host "คุณสามารถนำไปวาง (Ctrl+V) ให้ลูกค้าในแชทอื่นได้เลย: $publicUrl"
Write-Host ""
Write-Host "กำลังเปิดหน้าต่าง Edge ไปที่: $localUrl" -ForegroundColor Cyan

Start-Process "msedge.exe" $localUrl

Start-Sleep -Seconds 3
