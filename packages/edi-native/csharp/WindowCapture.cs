using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Informach.Edi.Native
{
    /// <summary>
    /// The Windows side of @informach/edi-desktop/windows-capture: fixed Win32 queries (foreground
    /// window, visible bounds, child HWNDs, cursor) and the closed focus and wheel actions. Requests are
    /// JSON lines on stdin, already validated by the Node side and validated again here; every answer
    /// is one line, {"ok":true,"result":...} or {"ok":false,"error":"CODE"} with a closed set of codes.
    ///   capture            one request, one answer, then exit (1 after a failure)
    ///   capture --session  READY, then one answer per request until stdin closes; a failure answers
    ///                      and ends the session (exit 1), as the caller closes it anyway
    /// Coordinates are physical pixels: each request runs under the per-monitor v2 DPI context.
    /// </summary>
    internal static class WindowCapture
    {
        private const int MaxRequest = 65536;
        private const int MaxHandles = 128;
        private const int MaxControls = 256;
        private const int MaxCursorSide = 512;
        private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;
        private static readonly Regex HandlePattern = new Regex("^[1-9][0-9]{0,18}$");
        private static readonly Regex IdentityPattern = new Regex("^[0-9]+:[0-9]+:[0-9]+$");

        public static int Run(bool session)
        {
            LineWriter output = LineWriter.StandardOutput();
            StreamReader input = LineWriter.StandardInput();
            JavaScriptSerializer parser = new JavaScriptSerializer();
            try
            {
                if (session) output.Write("READY", true);
                while (true)
                {
                    string line = input.ReadLine();
                    if (line == null)
                    {
                        if (session) return 0;
                        throw new CaptureFailure("INVALID_ACTION");
                    }
                    output.Write(Answer(Parse(parser, line)), true);
                    if (!session) return 0;
                }
            }
            catch (Exception error)
            {
                // Native diagnostics may contain paths or titles: only the closed code leaves the process.
                CaptureFailure failure = error as CaptureFailure;
                output.Write("{\"ok\":false,\"error\":\"" + (failure != null ? failure.Code : "NATIVE_FAILURE") + "\"}", true);
                return 1;
            }
        }

        private sealed class CaptureFailure : Exception
        {
            public readonly string Code;

            public CaptureFailure(string code) : base(code)
            {
                Code = code;
            }
        }

        private sealed class Bounds
        {
            public int X, Y, Width, Height;
        }

        private sealed class Window
        {
            public string Handle, Identity;
            public Bounds Bounds;
        }

        private sealed class Request
        {
            public string Op, Handle, Axis;
            public List<string> Handles;
            public Window Target;
            public Bounds Region;
            public int Delta;
        }

        private static Request Parse(JavaScriptSerializer parser, string line)
        {
            try
            {
                if (line.Length > MaxRequest) throw new FormatException("Pedido longo demais.");
                Dictionary<string, object> d = Json.Parse(parser, line);
                Request r = new Request();
                r.Op = Json.Text(d, "op");
                switch (r.Op)
                {
                    case "foreground":
                    case "cursor":
                        break;
                    case "bounds":
                    case "controls":
                        r.Handle = HandleText(Json.Text(d, "handle"));
                        break;
                    case "windows":
                        object[] handles = Json.Array(d, "handles");
                        if (handles.Length > MaxHandles) throw new FormatException("Janelas demais.");
                        r.Handles = new List<string>(handles.Length);
                        foreach (object handle in handles)
                        {
                            string text = handle as string;
                            if (text == null) throw new FormatException("Janela inválida.");
                            r.Handles.Add(HandleText(text));
                        }
                        break;
                    case "focus":
                        r.Target = ParseWindow(Json.Object(d, "target"));
                        break;
                    case "wheel":
                        r.Target = ParseWindow(Json.Object(d, "target"));
                        r.Region = ParseBounds(Json.Object(d, "region"));
                        r.Axis = Json.Text(d, "axis");
                        r.Delta = Json.Int(d, "delta");
                        if ((r.Axis != "vertical" && r.Axis != "horizontal") || (r.Delta != 120 && r.Delta != -120)) throw new FormatException("Roda inválida.");
                        break;
                    default:
                        throw new FormatException("Ação desconhecida.");
                }
                return r;
            }
            catch (FormatException)
            {
                throw new CaptureFailure("INVALID_ACTION");
            }
            catch (ArgumentException)
            {
                // The framework serializer reports malformed JSON this way.
                throw new CaptureFailure("INVALID_ACTION");
            }
            catch (InvalidOperationException)
            {
                throw new CaptureFailure("INVALID_ACTION");
            }
        }

        private static string HandleText(string text)
        {
            long value;
            if (!HandlePattern.IsMatch(text) || !long.TryParse(text, NumberStyles.None, Invariant, out value)) throw new FormatException("Janela inválida.");
            return text;
        }

        private static Window ParseWindow(Dictionary<string, object> d)
        {
            Window w = new Window();
            w.Handle = HandleText(Json.Text(d, "handle"));
            w.Identity = Json.Text(d, "identity");
            if (w.Identity.Length > 64 || !IdentityPattern.IsMatch(w.Identity)) throw new FormatException("Identidade inválida.");
            w.Bounds = ParseBounds(Json.Object(d, "bounds"));
            if (w.Bounds.Width <= 0 || w.Bounds.Height <= 0) throw new FormatException("Janela vazia.");
            return w;
        }

        private static Bounds ParseBounds(Dictionary<string, object> d)
        {
            Bounds b = new Bounds();
            b.X = Json.Int(d, "x");
            b.Y = Json.Int(d, "y");
            b.Width = Json.Int(d, "width");
            b.Height = Json.Int(d, "height");
            return b;
        }

        private static string Answer(Request r)
        {
            IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
            if (previous == IntPtr.Zero) throw new CaptureFailure("DPI_UNAVAILABLE");
            StringBuilder b = new StringBuilder(256);
            b.Append("{\"ok\":true,\"result\":");
            try
            {
                switch (r.Op)
                {
                    case "foreground":
                        WriteWindow(b, Read(Json.HandleText(GetForegroundWindow()), false));
                        break;
                    case "bounds":
                        WriteWindow(b, Read(r.Handle, false));
                        break;
                    case "controls":
                        WriteWindows(b, Children(r.Handle));
                        break;
                    case "windows":
                        List<Window> windows = new List<Window>();
                        foreach (string handle in r.Handles)
                        {
                            try
                            {
                                windows.Add(Read(handle, false));
                            }
                            catch (CaptureFailure failure)
                            {
                                if (failure.Code != "WINDOW_UNAVAILABLE" && failure.Code != "BOUNDS_UNAVAILABLE") throw;
                            }
                        }
                        WriteWindows(b, windows);
                        break;
                    case "cursor":
                        WriteCursor(b, ReadCursor());
                        break;
                    case "focus":
                        bool focused;
                        Window window = Focus(r.Target, out focused);
                        b.Append("{\"window\":");
                        WriteWindow(b, window);
                        b.Append(",\"focused\":").Append(Json.Bool(focused)).Append('}');
                        break;
                    case "wheel":
                        WriteWindow(b, Wheel(r.Target, r.Region, r.Axis, r.Delta));
                        break;
                    default:
                        throw new CaptureFailure("INVALID_ACTION");
                }
            }
            finally
            {
                SetThreadDpiAwarenessContext(previous);
            }
            return b.Append('}').ToString();
        }

        private static IntPtr Pointer(string handle)
        {
            return new IntPtr(long.Parse(handle, NumberStyles.AllowLeadingSign, Invariant));
        }

        private static Window Read(string handle, bool child)
        {
            IntPtr w = Pointer(handle);
            if (!IsWindow(w) || !IsWindowVisible(w) || IsIconic(w)) throw new CaptureFailure("WINDOW_UNAVAILABLE");
            int cloaked;
            if (!child && DwmInt(w, 14, out cloaked, 4) == 0 && cloaked != 0) throw new CaptureFailure("WINDOW_UNAVAILABLE");
            NativeRect r;
            if (child)
            {
                if (!GetWindowRect(w, out r)) throw new CaptureFailure("BOUNDS_UNAVAILABLE");
            }
            else if (DwmRect(w, 9, out r, Marshal.SizeOf(typeof(NativeRect))) != 0) throw new CaptureFailure("BOUNDS_UNAVAILABLE");
            if (r.Right <= r.Left || r.Bottom <= r.Top) throw new CaptureFailure("BOUNDS_UNAVAILABLE");
            uint process;
            uint thread = GetWindowThreadProcessId(w, out process);
            Window result = new Window();
            result.Handle = handle;
            result.Identity = handle + ":" + process.ToString(Invariant) + ":" + thread.ToString(Invariant);
            result.Bounds = new Bounds { X = r.Left, Y = r.Top, Width = r.Right - r.Left, Height = r.Bottom - r.Top };
            return result;
        }

        private static bool Same(Window a, Window b)
        {
            return a.Identity == b.Identity && a.Bounds.X == b.Bounds.X && a.Bounds.Y == b.Bounds.Y && a.Bounds.Width == b.Bounds.Width && a.Bounds.Height == b.Bounds.Height;
        }

        private static Window Check(Window expected)
        {
            Window actual = Read(expected.Handle, false);
            if (!Same(actual, expected)) throw new CaptureFailure("TARGET_CHANGED");
            return actual;
        }

        private static Window Focus(Window expected, out bool focused)
        {
            Window actual = Check(expected);
            IntPtr w = Pointer(actual.Handle);
            if (GetForegroundWindow() != w) SetForegroundWindow(w);
            Window after = Check(expected);
            focused = GetForegroundWindow() == w;
            return after;
        }

        private static bool Inside(Bounds region, Bounds outer)
        {
            return region.X >= outer.X && region.Y >= outer.Y && (long)region.X + region.Width <= (long)outer.X + outer.Width && (long)region.Y + region.Height <= (long)outer.Y + outer.Height;
        }

        private static Window Wheel(Window expected, Bounds region, string axis, int delta)
        {
            Window actual = Check(expected);
            IntPtr w = Pointer(actual.Handle);
            if (GetForegroundWindow() != w || (axis != "vertical" && axis != "horizontal") || (delta != 120 && delta != -120)) throw new CaptureFailure("TARGET_CHANGED");
            if (region.Width <= 0 || region.Height <= 0 || !Inside(region, actual.Bounds)) throw new CaptureFailure("TARGET_CHANGED");
            NativePoint point = new NativePoint { X = region.X + region.Width / 2, Y = region.Y + region.Height / 2 };
            // Wheel messages use signed 16-bit screen coordinates; never truncate another location.
            if (point.X < short.MinValue || point.X > short.MaxValue || point.Y < short.MinValue || point.Y > short.MaxValue) throw new CaptureFailure("TARGET_CHANGED");
            IntPtr hit = WindowFromPoint(point);
            if (hit != w && !IsChild(w, hit)) throw new CaptureFailure("TARGET_CHANGED");
            // Address the eligible focused recipient, not an intermediate hit-test HWND
            // that may forward and then propagate the same wheel twice (Chromium).
            uint owner;
            uint thread = GetWindowThreadProcessId(w, out owner);
            GuiInfo info = new GuiInfo();
            info.Size = Marshal.SizeOf(typeof(GuiInfo));
            if (thread == 0 || !GetGUIThreadInfo(thread, ref info) || info.Active != w || info.Focus == IntPtr.Zero || (info.Focus != w && !IsChild(w, info.Focus))) throw new CaptureFailure("TARGET_CHANGED");
            uint recipientOwner;
            uint recipientThread = GetWindowThreadProcessId(info.Focus, out recipientOwner);
            if (recipientOwner != owner || recipientThread != thread) throw new CaptureFailure("TARGET_CHANGED");
            Window recipient = Read(Json.HandleText(info.Focus), true);
            if (!Inside(region, recipient.Bounds)) throw new CaptureFailure("TARGET_CHANGED");
            Check(expected);
            GuiInfo latest = new GuiInfo();
            latest.Size = Marshal.SizeOf(typeof(GuiInfo));
            if (GetForegroundWindow() != w || !GetGUIThreadInfo(thread, ref latest) || latest.Active != w || latest.Focus != info.Focus || WindowFromPoint(point) != hit) throw new CaptureFailure("TARGET_CHANGED");
            Window finalRecipient = Read(Json.HandleText(info.Focus), true);
            if (!Same(finalRecipient, recipient)) throw new CaptureFailure("TARGET_CHANGED");
            UIntPtr result;
            uint wp = unchecked((uint)(delta << 16));
            int lp = unchecked((point.Y << 16) | (point.X & 0xffff));
            // Address the eligible HWND, never global SendInput. UIPI/timeout failures stop automation.
            if (SendMessageTimeout(info.Focus, axis == "vertical" ? 0x020Au : 0x020Eu, new UIntPtr(wp), new IntPtr(lp), 0x0002u | 0x0020u, 200, out result) == IntPtr.Zero) throw new CaptureFailure("TARGET_CHANGED");
            return Check(expected);
        }

        private static List<Window> Children(string handle)
        {
            Window parent = Read(handle, false);
            IntPtr w = Pointer(handle);
            List<Window> result = new List<Window>();
            bool overflow = false;
            // Exceptions never cross the native enumeration: the first one stops it and is thrown after.
            Exception failure = null;
            EnumCallback callback = delegate(IntPtr child, IntPtr ignored)
            {
                if (!IsChild(w, child) || !IsWindowVisible(child)) return true;
                if (result.Count >= MaxControls)
                {
                    overflow = true;
                    return false;
                }
                try
                {
                    Window item = Read(Json.HandleText(child), true);
                    int left = Math.Max(item.Bounds.X, parent.Bounds.X), top = Math.Max(item.Bounds.Y, parent.Bounds.Y);
                    int right = Math.Min(item.Bounds.X + item.Bounds.Width, parent.Bounds.X + parent.Bounds.Width);
                    int bottom = Math.Min(item.Bounds.Y + item.Bounds.Height, parent.Bounds.Y + parent.Bounds.Height);
                    IntPtr ancestor = GetParent(child);
                    int depth = 0;
                    while (ancestor != IntPtr.Zero)
                    {
                        if (++depth > 64 || !IsWindowVisible(ancestor)) throw new CaptureFailure("BOUNDS_UNAVAILABLE");
                        NativeRect client;
                        NativePoint origin = new NativePoint();
                        if (!GetClientRect(ancestor, out client) || !ClientToScreen(ancestor, ref origin)) throw new CaptureFailure("BOUNDS_UNAVAILABLE");
                        left = Math.Max(left, origin.X + client.Left);
                        top = Math.Max(top, origin.Y + client.Top);
                        right = Math.Min(right, origin.X + client.Right);
                        bottom = Math.Min(bottom, origin.Y + client.Bottom);
                        if (ancestor == w) break;
                        ancestor = GetParent(ancestor);
                    }
                    if (ancestor != w) throw new CaptureFailure("TARGET_CHANGED");
                    if (right > left && bottom > top)
                    {
                        item.Bounds = new Bounds { X = left, Y = top, Width = right - left, Height = bottom - top };
                        result.Add(item);
                    }
                }
                catch (CaptureFailure e)
                {
                    if (e.Code == "WINDOW_UNAVAILABLE" || e.Code == "BOUNDS_UNAVAILABLE") return true;
                    failure = e;
                    return false;
                }
                catch (Exception e)
                {
                    failure = e;
                    return false;
                }
                return true;
            };
            EnumChildWindows(w, callback, IntPtr.Zero);
            GC.KeepAlive(callback);
            if (failure != null) throw failure;
            if (overflow) throw new CaptureFailure("CONTROL_LIMIT");
            Window after = Read(handle, false);
            if (!Same(after, parent)) throw new CaptureFailure("TARGET_CHANGED");
            return result;
        }

        private sealed class Cursor
        {
            public bool Visible;
            public int X, Y, HotspotX, HotspotY, Width, Height;
            public string BlackPng, WhitePng;
        }

        private static Cursor ReadCursor()
        {
            CursorInfo c = new CursorInfo();
            c.Size = Marshal.SizeOf(typeof(CursorInfo));
            if (!GetCursorInfo(ref c)) throw new CaptureFailure("CURSOR_UNAVAILABLE");
            Cursor result = new Cursor { Visible = (c.Flags & 1) != 0, X = c.Position.X, Y = c.Position.Y };
            if (!result.Visible) return result;
            IntPtr copy = CopyIcon(c.Cursor);
            if (copy == IntPtr.Zero) throw new CaptureFailure("CURSOR_UNAVAILABLE");
            IconInfo info = new IconInfo();
            try
            {
                if (!GetIconInfo(copy, out info)) throw new CaptureFailure("CURSOR_UNAVAILABLE");
                BitmapInfo bitmap;
                IntPtr source = info.Color != IntPtr.Zero ? info.Color : info.Mask;
                if (GetObject(source, Marshal.SizeOf(typeof(BitmapInfo)), out bitmap) == 0) throw new CaptureFailure("CURSOR_UNAVAILABLE");
                // Monochrome cursors keep the AND plane above the XOR plane in one mask.
                int width = bitmap.Width, height = info.Color != IntPtr.Zero ? bitmap.Height : bitmap.Height / 2;
                if (width < 1 || height < 1 || width > MaxCursorSide || height > MaxCursorSide) throw new CaptureFailure("CURSOR_LIMIT");
                result.Width = width;
                result.Height = height;
                result.HotspotX = (int)info.X;
                result.HotspotY = (int)info.Y;
                // Preserve both backgrounds. Consumers interpolate per channel, including legacy XOR inversion.
                using (Bitmap black = new Bitmap(width, height, PixelFormat.Format32bppArgb))
                using (Bitmap white = new Bitmap(width, height, PixelFormat.Format32bppArgb))
                {
                    Paint(black, Color.Black, copy);
                    Paint(white, Color.White, copy);
                    result.BlackPng = Png(black);
                    result.WhitePng = Png(white);
                }
                return result;
            }
            finally
            {
                if (info.Mask != IntPtr.Zero) DeleteObject(info.Mask);
                if (info.Color != IntPtr.Zero) DeleteObject(info.Color);
                DestroyIcon(copy);
            }
        }

        private static void Paint(Bitmap bitmap, Color background, IntPtr cursor)
        {
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.Clear(background);
                IntPtr dc = graphics.GetHdc();
                try
                {
                    if (!DrawIconEx(dc, 0, 0, cursor, bitmap.Width, bitmap.Height, 0, IntPtr.Zero, 3)) throw new CaptureFailure("CURSOR_UNAVAILABLE");
                }
                finally
                {
                    graphics.ReleaseHdc(dc);
                }
            }
        }

        private static string Png(Bitmap bitmap)
        {
            using (MemoryStream stream = new MemoryStream())
            {
                bitmap.Save(stream, ImageFormat.Png);
                return Convert.ToBase64String(stream.ToArray());
            }
        }

        private static void WriteWindow(StringBuilder b, Window w)
        {
            b.Append("{\"handle\":");
            Json.Str(b, w.Handle);
            b.Append(",\"identity\":");
            Json.Str(b, w.Identity);
            b.Append(",\"bounds\":{\"x\":");
            Json.Integer(b, w.Bounds.X);
            b.Append(",\"y\":");
            Json.Integer(b, w.Bounds.Y);
            b.Append(",\"width\":");
            Json.Integer(b, w.Bounds.Width);
            b.Append(",\"height\":");
            Json.Integer(b, w.Bounds.Height);
            b.Append("}}");
        }

        private static void WriteWindows(StringBuilder b, List<Window> windows)
        {
            b.Append('[');
            for (int i = 0; i < windows.Count; i++)
            {
                if (i > 0) b.Append(',');
                WriteWindow(b, windows[i]);
            }
            b.Append(']');
        }

        private static void WriteCursor(StringBuilder b, Cursor c)
        {
            b.Append("{\"visible\":").Append(Json.Bool(c.Visible));
            b.Append(",\"x\":");
            Json.Integer(b, c.X);
            b.Append(",\"y\":");
            Json.Integer(b, c.Y);
            b.Append(",\"hotspotX\":");
            Json.Integer(b, c.HotspotX);
            b.Append(",\"hotspotY\":");
            Json.Integer(b, c.HotspotY);
            b.Append(",\"width\":");
            Json.Integer(b, c.Width);
            b.Append(",\"height\":");
            Json.Integer(b, c.Height);
            b.Append(",\"blackPng\":");
            Json.Str(b, c.BlackPng);
            b.Append(",\"whitePng\":");
            Json.Str(b, c.WhitePng);
            b.Append('}');
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativeRect
        {
            public int Left, Top, Right, Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativePoint
        {
            public int X, Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct GuiInfo
        {
            public int Size;
            public uint Flags;
            public IntPtr Active, Focus, Capture, Menu, Move, Caret;
            public NativeRect Rect;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CursorInfo
        {
            public int Size;
            public uint Flags;
            public IntPtr Cursor;
            public NativePoint Position;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IconInfo
        {
            public bool Icon;
            public uint X, Y;
            public IntPtr Mask, Color;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BitmapInfo
        {
            public int Type, Width, Height, Stride;
            public ushort Planes, Bits;
            public IntPtr Data;
        }

        private delegate bool EnumCallback(IntPtr window, IntPtr data);

        [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(NativePoint point);
        [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wp, IntPtr lp, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);
        [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr window);
        [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out NativeRect rect);
        [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref NativePoint point);
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
        [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumCallback callback, IntPtr data);
        [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] private static extern int DwmRect(IntPtr window, int attribute, out NativeRect rect, int size);
        [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] private static extern int DwmInt(IntPtr window, int attribute, out int value, int size);
        [DllImport("user32.dll")] private static extern bool GetCursorInfo(ref CursorInfo info);
        [DllImport("user32.dll")] private static extern IntPtr CopyIcon(IntPtr icon);
        [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
        [DllImport("user32.dll")] private static extern bool GetIconInfo(IntPtr icon, out IconInfo info);
        [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] private static extern int GetObject(IntPtr obj, int size, out BitmapInfo info);
        [DllImport("user32.dll")] private static extern bool DrawIconEx(IntPtr dc, int x, int y, IntPtr icon, int width, int height, int step, IntPtr brush, int flags);
    }
}
