$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Write-Host "========================================"
Write-Host "     สร้างสลิปโอนเงินพร้อมเพย์ (Offline)      "
Write-Host "========================================"
Write-Host ""

$amount = Read-Host "ใส่จำนวนเงิน (เช่น 250)"

if (-not $amount) {
    Write-Host "ข้อผิดพลาด: ไม่ได้ระบุจำนวนเงิน" -ForegroundColor Red
    Start-Sleep -Seconds 3
    exit
}

# Ensure amount contains only digits or decimals
if ($amount -notmatch '^\d+(\.\d{1,2})?$') {
    Write-Host "ข้อผิดพลาด: จำนวนเงินไม่ถูกต้อง" -ForegroundColor Red
    Start-Sleep -Seconds 3
    exit
}

Write-Host ""
Write-Host "กำลังสร้างรูปภาพสลิปโอนเงิน..."

$tempDir = [System.IO.Path]::GetTempPath()
$qrTempFile = Join-Path $tempDir "temp_qr_$amount.png"
$htmlPath = Join-Path $tempDir "temp_bill_$amount.html"
$outPng = Join-Path $tempDir "temp_slip_$amount.png"
$outLog = Join-Path $tempDir "temp_edge_out_$amount.log"
$errLog = Join-Path $tempDir "temp_edge_err_$amount.log"

try {
    # 1. Download PromptPay QR Code
    $uri = "https://promptpay.io/0988573074/$amount.png"
    Invoke-WebRequest -Uri $uri -OutFile $qrTempFile -TimeoutSec 10
    
    # 2. Convert QR code image to Base64 to prevent rendering race conditions in Edge
    $qrBytes = [System.IO.File]::ReadAllBytes($qrTempFile)
    $qrBase64 = [System.Convert]::ToBase64String($qrBytes)
    
    # 3. Generate HTML Content for the Slip Card
    $html = @"
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 280px;
    height: 350px;
    overflow: hidden;
    background: #ffffff;
    font-family: 'Kanit', 'Inter', sans-serif;
  }
  .promptpay-container {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 15px 15px 10px 15px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
  }
  .title-row {
    color: #1a1a1a;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 2px;
  }
  .title-row span.amount {
    color: #0046b8;
    font-size: 17px;
  }
  .qr-image {
    width: 190px;
    height: 190px;
    display: block;
  }
  .id-text {
    font-size: 11px;
    color: #666;
    font-weight: 500;
    margin-top: 2px;
  }
  .scan-desc {
    font-size: 11px;
    color: #666;
    margin-top: 2px;
  }
  hr {
    border: none;
    border-top: 1px solid #eee;
    width: 90%;
    margin: 6px 0;
  }
  .bank-logos {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 2px;
  }
  .bank-logos img {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <div class="promptpay-container">
    <div class="title-row">
      <span>💵 พร้อมเพย์ :</span> <span class="amount">$amount บาท</span>
    </div>
    <div class="qr-container">
      <img src="data:image/png;base64,$qrBase64" class="qr-image" alt="QR">
    </div>
    <div class="id-text">ID: 0988573074</div>
    <div class="scan-desc">สแกนเพื่อชำระเงินได้ทันที</div>
    <hr>
    <div class="bank-logos">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/KBANK.png" alt="KBANK">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/SCB.png" alt="SCB">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/BBL.png" alt="BBL">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/KTB.png" alt="KTB">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/BAY.png" alt="BAY">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/TTB.png" alt="TTB">
      <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/GSB.png" alt="GSB">
    </div>
  </div>
</body>
</html>
"@
    $html | Out-File -FilePath $htmlPath -Encoding utf8
    
    # 4. Use Microsoft Edge in headless mode to render the HTML and take a screenshot
    $edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    $args = @(
        "--headless",
        "--screenshot=$outPng",
        "--window-size=280,350",
        "--hide-scrollbars",
        "--log-level=3",
        $htmlPath
    )
    
    Write-Host "กำลังเรนเดอร์ภาพผ่าน Edge Headless..."
    $proc = Start-Process -FilePath $edgePath -ArgumentList $args -NoNewWindow -RedirectStandardError $errLog -RedirectStandardOutput $outLog -PassThru -Wait
    
    if (-not (Test-Path $outPng)) {
        throw "ไม่สามารถบันทึกภาพสกรีนช็อตจาก Edge ได้"
    }

    # 5. Load assemblies for Clipboard operations and copy the image
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    
    $img = [System.Drawing.Image]::FromFile($outPng)
    [System.Windows.Forms.Clipboard]::SetImage($img)
    $img.Dispose()
    
    Write-Host "เสร็จเรียบร้อย! คัดลอกรูปภาพสลิปโอนเงินพร้อมเพย์ลงคลิปบอร์ดแล้ว" -ForegroundColor Green
    Write-Host "จำนวนเงิน: $amount บาท" -ForegroundColor Cyan
    Write-Host "คุณสามารถกดวาง (Ctrl+V) ในแชท LINE/FB/Discord ได้ทันที" -ForegroundColor White
}
catch {
    Write-Host "เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}
finally {
    # 6. Clean up all temporary files
    if (Test-Path $qrTempFile) { Remove-Item $qrTempFile -Force }
    if (Test-Path $htmlPath) { Remove-Item $htmlPath -Force }
    if (Test-Path $outPng) { Remove-Item $outPng -Force }
    if (Test-Path $outLog) { Remove-Item $outLog -Force }
    if (Test-Path $errLog) { Remove-Item $errLog -Force }
}

Write-Host ""
Start-Sleep -Seconds 4
