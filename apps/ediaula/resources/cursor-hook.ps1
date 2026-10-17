# EdiAula cursor recorder. Prints the monitors, then every mouse move, click and wheel with the
# cursor shape, timestamped in milliseconds of the QueryPerformanceCounter clock (the same clock as
# Node's process.hrtime), so the main process can line the events up with the screen video.
#   -List   print the monitors and exit
#   -Keys   also log shortcut keys. Privacy: plain typing is never logged, only combinations with
#           Ctrl/Alt/Win and navigation keys (arrows, Enter, Tab, Esc, Space, Backspace, Delete, F1-F12).
# Output lines:
#   MON <left> <top> <width> <height> <primary 0|1>     (physical pixels)
#   READY <ms>
#   M <ms> <x> <y> <shape>    D|U <ms> <x> <y> <button>    W <ms> <x> <y> <delta>
#   K <ms> <virtual key> <modifiers: c a s w as 0/1>
param([switch]$List, [switch]$Keys)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class CursorHook {
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int l, t, r, b; }
  [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public int mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr hCursor; public POINT pt; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)] struct MONITORINFO { public int cbSize; public RECT rc, work; public uint flags; }

  delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  delegate bool MonitorEnum(IntPtr h, IntPtr dc, ref RECT r, IntPtr data);

  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
  [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO ci);
  [DllImport("user32.dll")] static extern IntPtr LoadCursor(IntPtr inst, int id);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorEnum fn, IntPtr data);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFO mi);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public int vk, scan, flags, time; public IntPtr extra; }

  static HookProc proc;
  static HookProc keyProc;
  static readonly Dictionary<IntPtr, string> shapes = new Dictionary<IntPtr, string>();
  static double lastMove;
  static string lastShape = "";

  static double Now() { return Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency; }
  static void Out(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }

  static string Shape() {
    CURSORINFO ci = new CURSORINFO(); ci.cbSize = Marshal.SizeOf(ci);
    if (!GetCursorInfo(ref ci)) return "arrow";
    if ((ci.flags & 1) == 0) return "hidden";
    string s; return shapes.TryGetValue(ci.hCursor, out s) ? s : "other";
  }

  public static void Monitors() {
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate (IntPtr h, IntPtr dc, ref RECT r, IntPtr d) {
      MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
      GetMonitorInfo(h, ref mi);
      Out(string.Format("MON {0} {1} {2} {3} {4}", mi.rc.l, mi.rc.t, mi.rc.r - mi.rc.l, mi.rc.b - mi.rc.t, (mi.flags & 1) == 1 ? 1 : 0));
      return true;
    }, IntPtr.Zero);
  }

  public static void Init() {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: physical pixels everywhere
    Console.Out.NewLine = "\n";
  }

  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

  static IntPtr KeyHook(int code, IntPtr w, IntPtr l) {
    int msg = w.ToInt32();
    if (code >= 0 && (msg == 0x100 || msg == 0x104)) {
      KBDLLHOOKSTRUCT k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(l, typeof(KBDLLHOOKSTRUCT));
      int vk = k.vk;
      bool ctrl = Down(0x11), alt = Down(0x12), shift = Down(0x10), win = Down(0x5B) || Down(0x5C);
      bool isModifier = (vk >= 0x10 && vk <= 0x12) || (vk >= 0xA0 && vk <= 0xA5) || vk == 0x5B || vk == 0x5C;
      bool navigation = vk == 8 || vk == 9 || vk == 13 || vk == 27 || vk == 32 || (vk >= 33 && vk <= 40) || vk == 46 || (vk >= 112 && vk <= 123);
      // Never log plain typing: only shortcuts (with Ctrl/Alt/Win) and navigation keys.
      if (!isModifier && (ctrl || alt || win || navigation))
        Out("K " + Now().ToString("F2", System.Globalization.CultureInfo.InvariantCulture) + " " + vk + " " + (ctrl ? 1 : 0) + (alt ? 1 : 0) + (shift ? 1 : 0) + (win ? 1 : 0));
    }
    return CallNextHookEx(IntPtr.Zero, code, w, l);
  }

  public static void HookKeys() {
    keyProc = KeyHook;
    SetWindowsHookEx(13 /* WH_KEYBOARD_LL */, keyProc, GetModuleHandle(null), 0);
  }

  public static void Run() {
    int[] ids = { 32512, 32513, 32514, 32515, 32649, 32646, 32642, 32643, 32644, 32645, 32648, 32650 };
    string[] names = { "arrow", "text", "wait", "cross", "hand", "move", "nwse", "nesw", "ew", "ns", "no", "busy" };
    for (int i = 0; i < ids.Length; i++) { IntPtr h = LoadCursor(IntPtr.Zero, ids[i]); if (!shapes.ContainsKey(h)) shapes[h] = names[i]; }
    proc = Hook;
    SetWindowsHookEx(14 /* WH_MOUSE_LL */, proc, GetModuleHandle(null), 0);
    Out("READY " + Now().ToString("F2", System.Globalization.CultureInfo.InvariantCulture));
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
  }

  static IntPtr Hook(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      MSLLHOOKSTRUCT h = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(l, typeof(MSLLHOOKSTRUCT));
      double t = Now();
      string ts = t.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
      int msg = w.ToInt32();
      string p = h.pt.x + " " + h.pt.y;
      switch (msg) {
        case 0x200: {
          string s = Shape();
          if (t - lastMove >= 8 || s != lastShape) { Out("M " + ts + " " + p + " " + s); lastMove = t; lastShape = s; }
          break;
        }
        case 0x201: Out("D " + ts + " " + p + " left"); break;
        case 0x202: Out("U " + ts + " " + p + " left"); break;
        case 0x204: Out("D " + ts + " " + p + " right"); break;
        case 0x205: Out("U " + ts + " " + p + " right"); break;
        case 0x207: Out("D " + ts + " " + p + " middle"); break;
        case 0x208: Out("U " + ts + " " + p + " middle"); break;
        case 0x20A: Out("W " + ts + " " + p + " " + (short)((h.mouseData >> 16) & 0xffff)); break;
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, w, l);
  }
}
'@

[CursorHook]::Init()
[CursorHook]::Monitors()
if ($List) { exit 0 }
if ($Keys) { [CursorHook]::HookKeys() }
[CursorHook]::Run()
