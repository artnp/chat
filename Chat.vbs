Dim shell, fso, tempFile, psCode, file
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

tempFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\minichat_launcher.ps1"

psCode = "Add-Type -TypeDefinition @'" & vbCrLf & _
         "using System;" & vbCrLf & _
         "using System.Runtime.InteropServices;" & vbCrLf & _
         "using System.Text;" & vbCrLf & _
         "public class W32 {" & vbCrLf & _
         "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);" & vbCrLf & _
         "    [DllImport(""user32.dll"")]" & vbCrLf & _
         "    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);" & vbCrLf & _
         "    [DllImport(""user32.dll"", CharSet = CharSet.Unicode)]" & vbCrLf & _
         "    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);" & vbCrLf & _
         "    [DllImport(""user32.dll"")]" & vbCrLf & _
         "    public static extern bool IsWindowVisible(IntPtr hWnd);" & vbCrLf & _
         "    [DllImport(""user32.dll"")]" & vbCrLf & _
         "    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);" & vbCrLf & _
         "    [DllImport(""user32.dll"")]" & vbCrLf & _
         "    public static extern bool SetForegroundWindow(IntPtr hWnd);" & vbCrLf & _
         "    [DllImport(""user32.dll"")]" & vbCrLf & _
         "    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);" & vbCrLf & _
         "}" & vbCrLf & _
         "'@" & vbCrLf & _
         "Add-Type -AssemblyName System.Windows.Forms" & vbCrLf & _
         "$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea" & vbCrLf & _
         "$w = 420; $h = 380" & vbCrLf & _
         "$x = $screen.Width - $w; $y = $screen.Height - $h" & vbCrLf & _
         "$TOPMOST = [IntPtr]::new(-1)" & vbCrLf & _
         "$url = 'https://artnp.github.io/chat/?mini=1'" & vbCrLf & _
         "$tempProf = $env:TEMP + '\MiniChatEdge'" & vbCrLf & _
         "Start-Process 'msedge.exe' ""--app=$url"",""--window-size=$w,$h"",""--window-position=$x,$y"",""--user-data-dir=$tempProf""" & vbCrLf & _
         "$hwnd = [IntPtr]::Zero" & vbCrLf & _
         "for ($i = 0; $i -lt 150; $i++) {" & vbCrLf & _
         "    Start-Sleep -Milliseconds 100" & vbCrLf & _
         "    [W32]::EnumWindows({" & vbCrLf & _
         "        param($h, $l)" & vbCrLf & _
         "        if ([W32]::IsWindowVisible($h)) {" & vbCrLf & _
         "            $sb = [System.Text.StringBuilder]::new(256)" & vbCrLf & _
         "            [W32]::GetWindowText($h, $sb, 256) | Out-Null" & vbCrLf & _
         "            if ($sb.ToString() -eq 'MiniChat') {" & vbCrLf & _
         "                $script:hwnd = $h" & vbCrLf & _
         "                return $false" & vbCrLf & _
         "            }" & vbCrLf & _
         "        }" & vbCrLf & _
         "        return $true" & vbCrLf & _
         "    }, [IntPtr]::Zero) | Out-Null" & vbCrLf & _
         "    if ($hwnd -ne [IntPtr]::Zero) { break }" & vbCrLf & _
         "}" & vbCrLf & _
         "if ($hwnd -ne [IntPtr]::Zero) {" & vbCrLf & _
         "    [W32]::ShowWindow($hwnd, 6) | Out-Null" & vbCrLf & _
         "    Start-Sleep -Milliseconds 100" & vbCrLf & _
         "    [W32]::SetWindowPos($hwnd, $TOPMOST, $x, $y, $w, $h, 0x0040) | Out-Null" & vbCrLf & _
         "    [W32]::ShowWindow($hwnd, 9) | Out-Null" & vbCrLf & _
         "    [W32]::SetForegroundWindow($hwnd) | Out-Null" & vbCrLf & _
         "    Start-Sleep -Milliseconds 400" & vbCrLf & _
         "    [W32]::SetWindowPos($hwnd, $TOPMOST, $x, $y, $w, $h, 0x0040) | Out-Null" & vbCrLf & _
         "}"

Set file = fso.CreateTextFile(tempFile, True, False)
file.Write psCode
file.Close

shell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & tempFile & """", 0, False
