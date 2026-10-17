param([switch]$Check)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class GuidedInput {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int x,y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public int dx,dy; public uint data,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Key { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Mouse mouse; [FieldOffset(0)] public Key key; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr w,uint flag);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr w,out Rect r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr w,StringBuilder t,int max);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n,Input[] data,int size);
  public static string Title(IntPtr w) { var s=new StringBuilder(512); GetWindowText(w,s,512); return s.ToString(); }
  public static void Click(bool right) {
    var down=new Input(); down.data.mouse.flags=right?8u:2u;
    var up=new Input(); up.data.mouse.flags=right?16u:4u;
    if(SendInput(2,new[]{down,up},Marshal.SizeOf(typeof(Input)))!=2) throw new Exception("Windows recusou o clique.");
  }
  public static void Press(int value,bool unicode) {
    var down=new Input(); down.type=1; down.data.key.vk=unicode?(ushort)0:(ushort)value;
    down.data.key.scan=unicode?(ushort)value:(ushort)0; down.data.key.flags=unicode?4u:0u;
    var up=down; up.data.key.flags|=2;
    if(SendInput(2,new[]{down,up},Marshal.SizeOf(typeof(Input)))!=2) throw new Exception("Windows recusou a tecla.");
  }
}
'@
if ($Check) { Write-Output 'COMPILED'; exit }
[void][GuidedInput]::SetProcessDpiAwarenessContext([IntPtr](-4))
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::ReadLine())) {
  try {
    $c = $line | ConvertFrom-Json
    $result = $null
    switch ($c.op) {
      'sample' {
        $p = New-Object GuidedInput+Point
        [void][GuidedInput]::GetCursorPos([ref]$p)
        if ($null -ne $c.x) { $p.x=$c.x; $p.y=$c.y }
        $w = [GuidedInput]::GetAncestor([GuidedInput]::WindowFromPoint($p),2)
        $r = New-Object GuidedInput+Rect
        [void][GuidedInput]::GetWindowRect($w,[ref]$r)
        $result = @{x=$p.x;y=$p.y;window=$w.ToInt64().ToString();title=[GuidedInput]::Title($w);left=$r.left;top=$r.top;width=$r.right-$r.left;height=$r.bottom-$r.top}
      }
      'verify' {
        $p = New-Object GuidedInput+Point; $p.x=$c.x; $p.y=$c.y
        $w = [GuidedInput]::GetAncestor([GuidedInput]::WindowFromPoint($p),2)
        $r = New-Object GuidedInput+Rect
        [void][GuidedInput]::GetWindowRect($w,[ref]$r)
        if ($w.ToInt64().ToString() -ne $c.window -or $r.left -ne $c.left -or $r.top -ne $c.top -or ($r.right-$r.left) -ne $c.width -or ($r.bottom-$r.top) -ne $c.height) { throw 'O alvo mudou de janela ou posição. Revise a etapa antes de continuar.' }
        if ($c.focus -and [GuidedInput]::GetForegroundWindow() -ne $w) { throw 'A janela do alvo não está ativa. Não enviei a tecla.' }
        if ($c.cursor) {
          $actual = New-Object GuidedInput+Point
          [void][GuidedInput]::GetCursorPos([ref]$actual)
          if ([Math]::Abs($actual.x-$c.x) -gt 2 -or [Math]::Abs($actual.y-$c.y) -gt 2) { throw 'O mouse foi movido durante a espera. Não executei o clique.' }
        }
      }
      'move' { if (![GuidedInput]::SetCursorPos($c.x,$c.y)) { throw 'Não foi possível mover o cursor.' } }
      'click' { [GuidedInput]::Click([bool]$c.right) }
      'key' { [GuidedInput]::Press($c.value,[bool]$c.unicode) }
      default { throw 'Comando inválido.' }
    }
    [Console]::WriteLine((@{id=$c.id;ok=$true;result=$result} | ConvertTo-Json -Compress))
  } catch { [Console]::WriteLine((@{id=$c.id;ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress)) }
}
