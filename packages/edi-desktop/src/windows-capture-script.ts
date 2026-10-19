/** Fixed trusted source compiled by the child process. No reusable application cache is loaded. */
export function makeWindowsCaptureScript(persistent = false): string {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public static class EdiCaptureNative {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int x,y; }
 [StructLayout(LayoutKind.Sequential)] struct GuiInfo { public int size; public uint flags; public IntPtr active,focus,capture,menu,move,caret; public Rect rect; }
 [StructLayout(LayoutKind.Sequential)] struct CursorInfo { public int size; public uint flags; public IntPtr cursor; public Point position; }
 [StructLayout(LayoutKind.Sequential)] struct IconInfo { public bool icon; public uint x,y; public IntPtr mask,color; }
 [StructLayout(LayoutKind.Sequential)] struct BitmapInfo { public int type,width,height,stride; public ushort planes,bits; public IntPtr data; }
 public class Bounds { public int x,y,width,height; }
 public class Window { public string handle,identity; public Bounds bounds; }
 public class FocusResult { public Window window; public bool focused; }
 public class Cursor { public bool visible; public int x,y,hotspotX,hotspotY,width,height; public string blackPng,whitePng; }
 delegate bool EnumCallback(IntPtr window,IntPtr data);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
 [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,UIntPtr wp,IntPtr lp,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window,ref Point point);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent,EnumCallback callback,IntPtr data);
 [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int DwmRect(IntPtr window,int attribute,out Rect rect,int size);
 [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int DwmInt(IntPtr window,int attribute,out int value,int size);
 [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CursorInfo info);
 [DllImport("user32.dll")] static extern IntPtr CopyIcon(IntPtr icon);
 [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
 [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon,out IconInfo info);
 [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
 [DllImport("gdi32.dll")] static extern int GetObject(IntPtr obj,int size,out BitmapInfo info);
 [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr dc,int x,int y,IntPtr icon,int width,int height,int step,IntPtr brush,int flags);
 public static Window Read(string handle,bool child) {
  IntPtr w=new IntPtr(Int64.Parse(handle));
  if(!IsWindow(w)||!IsWindowVisible(w)||IsIconic(w)) throw new Exception("WINDOW_UNAVAILABLE");
  int cloaked;
  if(!child && DwmInt(w,14,out cloaked,4)==0 && cloaked!=0) throw new Exception("WINDOW_UNAVAILABLE");
  Rect r;
  if(child) { if(!GetWindowRect(w,out r)) throw new Exception("BOUNDS_UNAVAILABLE"); }
  else if(DwmRect(w,9,out r,Marshal.SizeOf(typeof(Rect)))!=0) throw new Exception("BOUNDS_UNAVAILABLE");
  if(r.right<=r.left||r.bottom<=r.top) throw new Exception("BOUNDS_UNAVAILABLE");
  uint process; uint thread=GetWindowThreadProcessId(w,out process);
  return new Window { handle=handle,identity=handle+":"+process+":"+thread,
   bounds=new Bounds { x=r.left,y=r.top,width=r.right-r.left,height=r.bottom-r.top } };
 }
 public static Window Check(Window expected) {
  Window actual=Read(expected.handle,false);
  if(actual.identity!=expected.identity || actual.bounds.x!=expected.bounds.x || actual.bounds.y!=expected.bounds.y || actual.bounds.width!=expected.bounds.width || actual.bounds.height!=expected.bounds.height) throw new Exception("TARGET_CHANGED");
  return actual;
 }
 public static FocusResult Focus(Window expected) {
  Window actual=Check(expected); IntPtr w=new IntPtr(Int64.Parse(actual.handle));
  if(GetForegroundWindow()!=w) SetForegroundWindow(w);
  return new FocusResult { window=Check(expected),focused=GetForegroundWindow()==w };
 }
 public static Window Wheel(Window expected,Bounds region,string axis,int delta) {
  Window actual=Check(expected); IntPtr w=new IntPtr(Int64.Parse(actual.handle));
  if(GetForegroundWindow()!=w || (axis!="vertical" && axis!="horizontal") || (delta!=120 && delta!=-120)) throw new Exception("TARGET_CHANGED");
  if(region.width<=0 || region.height<=0 || region.x<actual.bounds.x || region.y<actual.bounds.y || (long)region.x+region.width>(long)actual.bounds.x+actual.bounds.width || (long)region.y+region.height>(long)actual.bounds.y+actual.bounds.height) throw new Exception("TARGET_CHANGED");
  Point point=new Point { x=region.x+region.width/2, y=region.y+region.height/2 };
  // Wheel messages use signed 16-bit screen coordinates; never truncate another location.
  if(point.x<Int16.MinValue || point.x>Int16.MaxValue || point.y<Int16.MinValue || point.y>Int16.MaxValue) throw new Exception("TARGET_CHANGED");
  IntPtr hit=WindowFromPoint(point);
  if(hit!=w && !IsChild(w,hit)) throw new Exception("TARGET_CHANGED");
  // Address the eligible focused recipient, not an intermediate hit-test HWND
  // that may forward and then propagate the same wheel twice (Chromium).
  uint owner; uint thread=GetWindowThreadProcessId(w,out owner);
  GuiInfo info=new GuiInfo(); info.size=Marshal.SizeOf(typeof(GuiInfo));
  if(thread==0 || !GetGUIThreadInfo(thread,ref info) || info.active!=w || info.focus==IntPtr.Zero || (info.focus!=w && !IsChild(w,info.focus))) throw new Exception("TARGET_CHANGED");
  uint recipientOwner; uint recipientThread=GetWindowThreadProcessId(info.focus,out recipientOwner);
  if(recipientOwner!=owner || recipientThread!=thread) throw new Exception("TARGET_CHANGED");
  Window recipient=Read(info.focus.ToInt64().ToString(),true);
  Bounds rb=recipient.bounds;
  if(region.x<rb.x || region.y<rb.y || (long)region.x+region.width>(long)rb.x+rb.width || (long)region.y+region.height>(long)rb.y+rb.height) throw new Exception("TARGET_CHANGED");
  Check(expected);
  GuiInfo latest=new GuiInfo(); latest.size=Marshal.SizeOf(typeof(GuiInfo));
  if(GetForegroundWindow()!=w || !GetGUIThreadInfo(thread,ref latest) || latest.active!=w || latest.focus!=info.focus || WindowFromPoint(point)!=hit) throw new Exception("TARGET_CHANGED");
  Window finalRecipient=Read(info.focus.ToInt64().ToString(),true);
  if(finalRecipient.identity!=recipient.identity || finalRecipient.bounds.x!=rb.x || finalRecipient.bounds.y!=rb.y || finalRecipient.bounds.width!=rb.width || finalRecipient.bounds.height!=rb.height) throw new Exception("TARGET_CHANGED");
  UIntPtr result;
  uint wp=unchecked((uint)(delta << 16));
  int lp=unchecked((point.y << 16) | (point.x & 0xffff));
  // Address the eligible HWND, never global SendInput. UIPI/timeout failures stop automation.
  if(SendMessageTimeout(info.focus,axis=="vertical"?0x020Au:0x020Eu,new UIntPtr(wp),new IntPtr(lp),0x0002u|0x0020u,200,out result)==IntPtr.Zero) throw new Exception("TARGET_CHANGED");
  return Check(expected);
 }
 public static Window[] Children(string handle) {
  Window parent=Read(handle,false); IntPtr w=new IntPtr(Int64.Parse(handle));
  var result=new List<Window>(); bool overflow=false;
  EnumChildWindows(w,delegate(IntPtr child,IntPtr ignored) {
   if(!IsChild(w,child)||!IsWindowVisible(child)) return true;
   if(result.Count>=256) {overflow=true;return false;}
   try {
    Window item=Read(child.ToInt64().ToString(),true);
    int left=Math.Max(item.bounds.x,parent.bounds.x), top=Math.Max(item.bounds.y,parent.bounds.y);
    int right=Math.Min(item.bounds.x+item.bounds.width,parent.bounds.x+parent.bounds.width), bottom=Math.Min(item.bounds.y+item.bounds.height,parent.bounds.y+parent.bounds.height);
    IntPtr ancestor=GetParent(child); int depth=0;
    while(ancestor!=IntPtr.Zero) {
     if(++depth>64 || !IsWindowVisible(ancestor)) throw new Exception("BOUNDS_UNAVAILABLE");
     Rect client; Point origin=new Point();
     if(!GetClientRect(ancestor,out client)||!ClientToScreen(ancestor,ref origin)) throw new Exception("BOUNDS_UNAVAILABLE");
     left=Math.Max(left,origin.x+client.left);top=Math.Max(top,origin.y+client.top);
     right=Math.Min(right,origin.x+client.right);bottom=Math.Min(bottom,origin.y+client.bottom);
     if(ancestor==w) break; ancestor=GetParent(ancestor);
    }
    if(ancestor!=w) throw new Exception("TARGET_CHANGED");
    if(right>left && bottom>top) {item.bounds=new Bounds{x=left,y=top,width=right-left,height=bottom-top};result.Add(item);}
   }
   catch(Exception e) { if(e.Message!="WINDOW_UNAVAILABLE"&&e.Message!="BOUNDS_UNAVAILABLE") throw; }
   return true;
  },IntPtr.Zero);
  if(overflow) throw new Exception("CONTROL_LIMIT");
  Window after=Read(handle,false);
  if(parent.identity!=after.identity || parent.bounds.x!=after.bounds.x || parent.bounds.y!=after.bounds.y || parent.bounds.width!=after.bounds.width || parent.bounds.height!=after.bounds.height) throw new Exception("TARGET_CHANGED");
  return result.ToArray();
 }
 public static Cursor ReadCursor() {
  var c=new CursorInfo(); c.size=Marshal.SizeOf(typeof(CursorInfo));
  if(!GetCursorInfo(ref c)) throw new Exception("CURSOR_UNAVAILABLE");
  var result=new Cursor {visible=(c.flags&1)!=0,x=c.position.x,y=c.position.y,blackPng=null,whitePng=null};
  if(!result.visible) return result;
  IntPtr copy=CopyIcon(c.cursor); if(copy==IntPtr.Zero) throw new Exception("CURSOR_UNAVAILABLE");
  IconInfo info=new IconInfo();
  try {
   if(!GetIconInfo(copy,out info)) throw new Exception("CURSOR_UNAVAILABLE");
   BitmapInfo b; IntPtr bitmap=info.color!=IntPtr.Zero?info.color:info.mask;
   if(GetObject(bitmap,Marshal.SizeOf(typeof(BitmapInfo)),out b)==0) throw new Exception("CURSOR_UNAVAILABLE");
   int width=b.width,height=info.color!=IntPtr.Zero?b.height:b.height/2;
   if(width<1||height<1||width>512||height>512) throw new Exception("CURSOR_LIMIT");
   result.width=width;result.height=height;result.hotspotX=(int)info.x;result.hotspotY=(int)info.y;
   // Preserve both backgrounds. Consumers interpolate per channel, including legacy XOR inversion.
   using(var black=new Bitmap(width,height,PixelFormat.Format32bppArgb))
   using(var white=new Bitmap(width,height,PixelFormat.Format32bppArgb)) {
    Paint(black,Color.Black,copy);Paint(white,Color.White,copy);
    using(var stream=new MemoryStream()) {black.Save(stream,ImageFormat.Png);result.blackPng=Convert.ToBase64String(stream.ToArray());}
    using(var stream=new MemoryStream()) {white.Save(stream,ImageFormat.Png);result.whitePng=Convert.ToBase64String(stream.ToArray());}
   }
   return result;
  } finally {if(info.mask!=IntPtr.Zero) DeleteObject(info.mask);if(info.color!=IntPtr.Zero) DeleteObject(info.color);DestroyIcon(copy);}
 }
 static void Paint(Bitmap bitmap,Color background,IntPtr cursor) {
  using(var graphics=Graphics.FromImage(bitmap)) {graphics.Clear(background);IntPtr dc=graphics.GetHdc();
   try {if(!DrawIconEx(dc,0,0,cursor,bitmap.Width,bitmap.Height,0,IntPtr.Zero,3)) throw new Exception("CURSOR_UNAVAILABLE");}
   finally {graphics.ReleaseHdc(dc);}
  }
 }
}
'@
${persistent ? '[Console]::WriteLine("READY")\nwhile ($null -ne ($line = [Console]::ReadLine())) {\n$request = $line | ConvertFrom-Json' : "$request = [Console]::ReadLine() | ConvertFrom-Json"}
$previous = [EdiCaptureNative]::SetThreadDpiAwarenessContext([IntPtr](-4))
if ($previous -eq [IntPtr]::Zero) { throw 'DPI_UNAVAILABLE' }
try {
 switch ($request.op) {
  'foreground' { $result = [EdiCaptureNative]::Read([EdiCaptureNative]::GetForegroundWindow().ToInt64().ToString(),$false) }
  'bounds' { $result = [EdiCaptureNative]::Read($request.handle,$false) }
  'controls' { $result = @([EdiCaptureNative]::Children($request.handle)) }
  'windows' {
   $result = @(); foreach ($handle in $request.handles) {
    try { $result += [EdiCaptureNative]::Read($handle,$false) }
    catch { if ($_.Exception.GetBaseException().Message -notin @('WINDOW_UNAVAILABLE','BOUNDS_UNAVAILABLE')) { throw } }
   }
  }
  'cursor' { $result = [EdiCaptureNative]::ReadCursor() }
  'focus' {
   $target = [EdiCaptureNative+Window]@{ handle=$request.target.handle; identity=$request.target.identity; bounds=[EdiCaptureNative+Bounds]@{ x=$request.target.bounds.x; y=$request.target.bounds.y; width=$request.target.bounds.width; height=$request.target.bounds.height } }
   $result = [EdiCaptureNative]::Focus($target)
  }
  'wheel' {
   $target = [EdiCaptureNative+Window]@{ handle=$request.target.handle; identity=$request.target.identity; bounds=[EdiCaptureNative+Bounds]@{ x=$request.target.bounds.x; y=$request.target.bounds.y; width=$request.target.bounds.width; height=$request.target.bounds.height } }
   $region = [EdiCaptureNative+Bounds]@{ x=$request.region.x; y=$request.region.y; width=$request.region.width; height=$request.region.height }
   $result = [EdiCaptureNative]::Wheel($target,$region,$request.axis,[int]$request.delta)
  }
  default { throw 'INVALID_ACTION' }
 }
 [Console]::WriteLine((@{ok=$true;result=$result} | ConvertTo-Json -Compress -Depth 8))
} finally { [void][EdiCaptureNative]::SetThreadDpiAwarenessContext($previous) }
${persistent ? "}" : ""}
} catch {
 $code = $_.Exception.GetBaseException().Message
 if ($code -notmatch '^(WINDOW_UNAVAILABLE|BOUNDS_UNAVAILABLE|CURSOR_UNAVAILABLE|CURSOR_LIMIT|CONTROL_LIMIT|TARGET_CHANGED|DPI_UNAVAILABLE|INVALID_ACTION)$') { $code = 'NATIVE_FAILURE' }
 [Console]::WriteLine((@{ok=$false;error=$code} | ConvertTo-Json -Compress))
 exit 1
}
`;
}
export const windowsCaptureScript = makeWindowsCaptureScript();
