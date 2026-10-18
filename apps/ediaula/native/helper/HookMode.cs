using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace EdiAula.Helper
{
    internal enum EventKind : byte
    {
        Line,
        Move,
        Down,
        Up,
        Wheel,
        HorizontalWheel,
        Key,
        Shape,
        Pause,
        Resume,
    }

    /// <summary>What the hook callback copies; everything else happens on the writer thread.</summary>
    internal struct RawEvent
    {
        public EventKind Kind;
        public double T;
        public int X;
        public int Y;
        /// <summary>Button index, wheel delta or virtual key with modifiers in the high word.</summary>
        public int Data;
        public IntPtr Cursor;
        public bool Showing;
        public bool Ui;
        public bool Polled;
        /// <summary>Synthetic input (SendInput), such as the guided recording's own moves and clicks.</summary>
        public bool Injected;
        public string Line;
    }

    /// <summary>
    /// Hook mode. The low-level hooks run on their own thread and only copy the event into a queue:
    /// Windows silently removes a hook whose callback is slow (finding G2), so formatting and cursor
    /// capture happen on the writer thread, the journal has a thread of its own, and a blocked
    /// stdout only blocks the thread that writes it. A watchdog reinstalls the hooks and polls the
    /// pointer if they die. While paused (between recorded segments) nothing but the cursor shape
    /// is kept, and keys are dropped inside the callback.
    /// </summary>
    internal static unsafe class HookMode
    {
        private const int Capacity = 65536;
        private const uint WM_APP_REINSTALL = NativeMethods.WM_APP + 1;
        private const double MoveInterval = 8;

        private static readonly ConcurrentQueue<RawEvent> queue = new ConcurrentQueue<RawEvent>();
        private static readonly AutoResetEvent wake = new AutoResetEvent(false);
        private static readonly ManualResetEvent installed = new ManualResetEvent(false);
        private static readonly long frequency = Stopwatch.Frequency;

        private static int queued;
        private static long coalesced;
        private static long reinstalls;
        private static long lastMouseTicks;
        private static long lastKeyTicks;
        private static object pendingMove;
        private static volatile bool hookDead;
        private static volatile bool stopping;
        private static volatile bool writerDone;
        private static volatile bool keysPaused;
        private static bool readyWritten;

        private static bool keys;
        private static uint uiPid;
        private static ulong testTag;
        private static uint hookThreadId;
        private static IntPtr mouseHook;
        private static IntPtr keyHook;
        private static string installError;
        private static HookProc mouseProc;
        private static HookProc keyProc;

        // Swapped by reference from the command thread; the callbacks only read them.
        private static volatile int[] excluded = new int[0];
        private static volatile HashSet<int> blockedKeys = new HashSet<int>();
        private static volatile HashSet<long> allowedWindows = new HashSet<long>();
        // Only the hook thread touches this cache.
        private static readonly Dictionary<IntPtr, bool> altGrLayouts = new Dictionary<IntPtr, bool>();

        private static StdoutPump stdout;
        private static Journal journal;
        private static CursorCatalog catalog;

        public static int Run(Options options)
        {
            keys = options.Keys;
            uiPid = options.UiPid;
            testTag = options.TestTag;
            keysPaused = options.Paused;
            stdout = new StdoutPump();
            if (options.Journal != null) journal = Journal.Open(options.Journal, stdout.Enqueue);
            catalog = new CursorCatalog(options.Journal, Emit);
            long start = Stopwatch.GetTimestamp();
            Interlocked.Exchange(ref lastMouseTicks, start);
            Interlocked.Exchange(ref lastKeyTicks, start);
            // Started before the first segment: nothing but the shape until "resume".
            paused = options.Paused;

            Thread writer = Start(WriterLoop, "writer", ThreadPriority.AboveNormal);
            mouseProc = MouseCallback;
            keyProc = KeyCallback;
            Thread hook = Start(HookLoop, "hook", ThreadPriority.Highest);
            installed.WaitOne();
            if (installError != null)
            {
                Console.Error.WriteLine("ediaula-helper: " + installError);
                stopping = true;
                writerDone = true;
                wake.Set();
                writer.Join(2000);
                if (journal != null) journal.Finish(2000);
                stdout.Finish(2000);
                return 1;
            }
            Thread watchdog = Start(WatchdogLoop, "watchdog", ThreadPriority.AboveNormal);
            if (options.Caret) Caret.Start();

            JavaScriptSerializer parser = new JavaScriptSerializer();
            using (StreamReader input = LineWriter.StandardInput())
            {
                string line;
                while ((line = input.ReadLine()) != null)
                {
                    if (line.Trim().Length == 0) continue;
                    Command(parser, line);
                }
            }

            // End of stdin: the app closed us or died. Save what is left and leave.
            stopping = true;
            Caret.Stop();
            WindowWatch.Stop();
            WindowWatch.RestoreAll();
            NativeMethods.PostThreadMessage(hookThreadId, NativeMethods.WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            hook.Join(2000);
            watchdog.Join(1000);
            EnqueueLine("{\"e\":\"bye\",\"t\":" + Json.Time(Program.Now()) + ",\"drop\":" + Interlocked.Read(ref coalesced) + "}");
            writerDone = true;
            wake.Set();
            writer.Join(10000);
            if (journal != null) journal.Finish(10000);
            stdout.Finish(3000);
            return 0;
        }

        private static Thread Start(ThreadStart body, string name, ThreadPriority priority)
        {
            Thread thread = new Thread(body);
            thread.Name = name;
            thread.IsBackground = true;
            thread.Priority = priority;
            thread.Start();
            return thread;
        }

        // ---- hook thread ------------------------------------------------------------------

        private static void HookLoop()
        {
            hookThreadId = NativeMethods.GetCurrentThreadId();
            MSG msg;
            NativeMethods.PeekMessage(out msg, IntPtr.Zero, 0, 0, 0); // creates this thread's message queue
            installError = Install();
            if (installError == null)
            {
                // Hooks are called from this thread's message loop: no event can precede this line,
                // and the writer holds its heartbeat until it has written it. The time is taken
                // last, so the app can compare it with its own clock.
                StringBuilder b = new StringBuilder(128);
                b.Append("{\"e\":\"ready\",\"pid\":").Append(NativeMethods.GetCurrentProcessId());
                b.Append(",\"v\":");
                Json.Str(b, Program.Version);
                b.Append(",\"keys\":").Append(Json.Bool(keys)).Append(",\"t\":").Append(Json.Time(Program.Now())).Append('}');
                EnqueueLine(b.ToString());
            }
            installed.Set();
            if (installError != null) return;
            while (NativeMethods.GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
            {
                if (msg.Hwnd != IntPtr.Zero || msg.Message != WM_APP_REINSTALL) continue;
                Uninstall();
                string error = Install();
                Interlocked.Increment(ref reinstalls);
                if (error != null) EnqueueLine(ErrorLine("hook", error));
            }
            Uninstall();
        }

        private static string Install()
        {
            IntPtr module = NativeMethods.GetModuleHandle(null);
            mouseHook = NativeMethods.SetWindowsHookEx(NativeMethods.WH_MOUSE_LL, mouseProc, module, 0);
            if (mouseHook == IntPtr.Zero) return "SetWindowsHookEx(WH_MOUSE_LL) falhou: " + Marshal.GetLastWin32Error();
            if (!keys) return null;
            keyHook = NativeMethods.SetWindowsHookEx(NativeMethods.WH_KEYBOARD_LL, keyProc, module, 0);
            if (keyHook == IntPtr.Zero) return "SetWindowsHookEx(WH_KEYBOARD_LL) falhou: " + Marshal.GetLastWin32Error();
            return null;
        }

        private static void Uninstall()
        {
            if (mouseHook != IntPtr.Zero) NativeMethods.UnhookWindowsHookEx(mouseHook);
            if (keyHook != IntPtr.Zero) NativeMethods.UnhookWindowsHookEx(keyHook);
            mouseHook = IntPtr.Zero;
            keyHook = IntPtr.Zero;
        }

        private static IntPtr MouseCallback(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                MSLLHOOKSTRUCT* data = (MSLLHOOKSTRUCT*)lParam;
                long ticks = Stopwatch.GetTimestamp();
                Interlocked.Exchange(ref lastMouseTicks, ticks);
                RawEvent e = new RawEvent();
                e.T = ticks * 1000.0 / frequency;
                e.X = data->Pt.X;
                e.Y = data->Pt.Y;
                e.Injected = (data->Flags & 0x01) != 0; // LLMHF_INJECTED
                bool known = true;
                switch ((uint)wParam.ToInt64())
                {
                    case NativeMethods.WM_MOUSEMOVE:
                        e.Kind = EventKind.Move;
                        CURSORINFO info = new CURSORINFO();
                        info.Size = sizeof(CURSORINFO);
                        if (NativeMethods.GetCursorInfo(ref info))
                        {
                            e.Cursor = info.Cursor;
                            e.Showing = (info.Flags & NativeMethods.CURSOR_SHOWING) != 0;
                        }
                        else e.Showing = true;
                        break;
                    case NativeMethods.WM_LBUTTONDOWN: e.Kind = EventKind.Down; e.Data = 0; break;
                    case NativeMethods.WM_LBUTTONUP: e.Kind = EventKind.Up; e.Data = 0; break;
                    case NativeMethods.WM_RBUTTONDOWN: e.Kind = EventKind.Down; e.Data = 1; break;
                    case NativeMethods.WM_RBUTTONUP: e.Kind = EventKind.Up; e.Data = 1; break;
                    case NativeMethods.WM_MBUTTONDOWN: e.Kind = EventKind.Down; e.Data = 2; break;
                    case NativeMethods.WM_MBUTTONUP: e.Kind = EventKind.Up; e.Data = 2; break;
                    case NativeMethods.WM_XBUTTONDOWN: e.Kind = EventKind.Down; e.Data = (data->MouseData >> 16) == 1 ? 3 : 4; break;
                    case NativeMethods.WM_XBUTTONUP: e.Kind = EventKind.Up; e.Data = (data->MouseData >> 16) == 1 ? 3 : 4; break;
                    case NativeMethods.WM_MOUSEWHEEL: e.Kind = EventKind.Wheel; e.Data = (short)(data->MouseData >> 16); break;
                    case NativeMethods.WM_MOUSEHWHEEL: e.Kind = EventKind.HorizontalWheel; e.Data = (short)(data->MouseData >> 16); break;
                    default: known = false; break;
                }
                if (known)
                {
                    e.Ui = Excluded(e.X, e.Y);
                    Enqueue(ref e);
                    if (testTag != 0 && data->ExtraInfo.ToUInt64() == testTag) return new IntPtr(1);
                }
            }
            return NativeMethods.CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
        }

        private static bool Excluded(int x, int y)
        {
            int[] rects = excluded;
            for (int i = 0; i + 3 < rects.Length; i += 4)
                if (x >= rects[i] && y >= rects[i + 1] && x < rects[i + 2] && y < rects[i + 3]) return true;
            return false;
        }

        private static bool Pressed(int vk)
        {
            return (NativeMethods.GetAsyncKeyState(vk) & 0x8000) != 0;
        }

        private static IntPtr KeyCallback(int code, IntPtr wParam, IntPtr lParam)
        {
            uint message = (uint)wParam.ToInt64();
            if (code >= 0)
            {
                Interlocked.Exchange(ref lastKeyTicks, Stopwatch.GetTimestamp());
                if ((message == NativeMethods.WM_KEYDOWN || message == NativeMethods.WM_SYSKEYDOWN) && !keysPaused)
                {
                    KBDLLHOOKSTRUCT* data = (KBDLLHOOKSTRUCT*)lParam;
                    int vk = (int)data->VkCode;
                    if (!KeyRule.IsModifier(vk))
                    {
                        bool ctrl = Pressed(0x11), alt = Pressed(0x12), win = Pressed(0x5B) || Pressed(0x5C);
                        int mods = (ctrl ? KeyRule.Ctrl : 0) | (alt ? KeyRule.Alt : 0) | (Pressed(0x10) ? KeyRule.Shift : 0) | (win ? KeyRule.Win : 0);
                        bool extended = (data->Flags & 0x01) != 0; // LLKHF_EXTENDED
                        bool rightAlt = Pressed(0xA5);
                        IntPtr layout = ForegroundLayout();
                        bool altGr = (rightAlt || (ctrl && alt)) && LayoutHasAltGr(layout);
                        // Only Ctrl+Alt can turn a key into a character here; ask the layout then.
                        bool printable = ctrl && alt && Printable(vk, (int)data->ScanCode, layout);
                        if (KeyRule.ShouldLog(vk, mods, extended, rightAlt, altGr, printable) &&
                            !blockedKeys.Contains(vk | (mods << 16)) && !ForegroundIsRecorder())
                        {
                            RawEvent e = new RawEvent();
                            e.Kind = EventKind.Key;
                            e.T = Program.Now();
                            e.Data = vk | (mods << 16);
                            e.Injected = (data->Flags & 0x10) != 0; // LLKHF_INJECTED
                            Enqueue(ref e);
                        }
                    }
                }
            }
            return NativeMethods.CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
        }

        private static IntPtr ForegroundLayout()
        {
            uint pid;
            return NativeMethods.GetKeyboardLayout(NativeMethods.GetWindowThreadProcessId(NativeMethods.GetForegroundWindow(), out pid));
        }

        /// <summary>The flag 4 keeps ToUnicodeEx from touching the dead-key state the user is typing with.</summary>
        private static bool Printable(int vk, int scan, IntPtr layout)
        {
            byte[] state = new byte[256];
            for (int key = 0; key < 256; key++)
                if (Pressed(key)) state[key] = 0x80;
            if ((NativeMethods.GetKeyState(0x14) & 1) != 0) state[0x14] |= 1; // Caps Lock
            StringBuilder text = new StringBuilder(8);
            int count = NativeMethods.ToUnicodeEx((uint)vk, (uint)scan, state, text, text.Capacity, 4, layout);
            return count > 0 && text.Length > 0 && text[0] >= 0x20 && text[0] != 0x7F;
        }

        /// <summary>Whether Ctrl+Alt (AltGr) types characters with this layout; measured once per layout.</summary>
        private static bool LayoutHasAltGr(IntPtr layout)
        {
            bool known;
            if (altGrLayouts.TryGetValue(layout, out known)) return known;
            byte[] state = new byte[256];
            state[0x11] = state[0xA2] = state[0x12] = state[0xA5] = 0x80;
            StringBuilder text = new StringBuilder(8);
            bool found = false;
            for (int vk = 0x30; vk <= 0xE2 && !found; vk++)
            {
                if (vk > 0x5A && vk < 0xBA) continue;
                uint scan = NativeMethods.MapVirtualKeyEx((uint)vk, 0, layout);
                if (scan == 0) continue;
                text.Length = 0;
                int count = NativeMethods.ToUnicodeEx((uint)vk, scan, state, text, text.Capacity, 4, layout);
                found = count > 0 && text.Length > 0 && text[0] >= 0x20 && text[0] != 0x7F;
            }
            altGrLayouts[layout] = found;
            return found;
        }

        private static bool ForegroundIsRecorder()
        {
            if (uiPid == 0) return false;
            IntPtr foreground = NativeMethods.GetForegroundWindow();
            if (allowedWindows.Contains(foreground.ToInt64())) return false;
            uint pid;
            NativeMethods.GetWindowThreadProcessId(foreground, out pid);
            return pid == uiPid;
        }

        // ---- queue ------------------------------------------------------------------------

        private sealed class Boxed
        {
            public RawEvent Value;
        }

        private static void Enqueue(ref RawEvent e)
        {
            if (e.Kind == EventKind.Move && Volatile.Read(ref queued) >= Capacity)
            {
                // Full queue: keep only the latest position; clicks and keys are never dropped.
                Boxed box = new Boxed();
                box.Value = e;
                Interlocked.Exchange(ref pendingMove, box);
                Interlocked.Increment(ref coalesced);
            }
            else
            {
                Interlocked.Increment(ref queued);
                queue.Enqueue(e);
            }
            wake.Set();
        }

        public static void EnqueueLine(string line)
        {
            RawEvent e = new RawEvent();
            e.Kind = EventKind.Line;
            e.T = Program.Now();
            e.Line = line;
            Enqueue(ref e);
        }

        // ---- writer thread ----------------------------------------------------------------

        private static string shape;
        private static double lastMoveAt = double.MinValue;
        private static bool holding;
        private static RawEvent held;
        private static bool paused;

        private static void WriterLoop()
        {
            long tick = frequency / 1000;
            long nextBeat = Stopwatch.GetTimestamp() + 500 * tick;
            for (;;)
            {
                long now = Stopwatch.GetTimestamp();
                long due = nextBeat;
                if (holding) due = Math.Min(due, (long)((held.T + MoveInterval) * frequency / 1000));
                int timeout = (int)Math.Max(0, Math.Min(500, (due - now) / tick));
                wake.WaitOne(timeout);
                RawEvent e;
                while (queue.TryDequeue(out e))
                {
                    Interlocked.Decrement(ref queued);
                    Boxed early = Volatile.Read(ref pendingMove) as Boxed;
                    if (early != null && early.Value.T <= e.T && Interlocked.CompareExchange(ref pendingMove, null, early) == early)
                        Process(early.Value);
                    Process(e);
                }
                Boxed late = Interlocked.Exchange(ref pendingMove, null) as Boxed;
                if (late != null) Process(late.Value);
                now = Stopwatch.GetTimestamp();
                if (holding && Program.Now() >= held.T + MoveInterval) Release();
                if (readyWritten && now >= nextBeat)
                {
                    nextBeat = now + 500 * tick;
                    Emit("{\"e\":\"hb\",\"t\":" + Json.Time(Program.Now()) + ",\"q\":" + Volatile.Read(ref queued) +
                        ",\"drop\":" + Interlocked.Read(ref coalesced) + ",\"hook\":\"" + (hookDead ? "dead" : "ok") +
                        "\",\"re\":" + Interlocked.Read(ref reinstalls) + ",\"out\":" + stdout.Pending +
                        ",\"jq\":" + (journal == null ? 0 : journal.Pending) + "}");
                }
                if (writerDone && Volatile.Read(ref queued) == 0 && Volatile.Read(ref pendingMove) == null) break;
            }
            if (holding) Release();
        }

        private static void Process(RawEvent e)
        {
            switch (e.Kind)
            {
                case EventKind.Line:
                    Release();
                    Emit(e.Line);
                    if (!readyWritten && e.Line.StartsWith("{\"e\":\"ready\"", StringComparison.Ordinal))
                    {
                        readyWritten = true;
                        catalog.Prime();
                    }
                    return;
                case EventKind.Pause:
                case EventKind.Resume:
                    Release();
                    paused = e.Kind == EventKind.Pause;
                    Emit("{\"e\":\"" + (paused ? "pause" : "resume") + "\",\"t\":" + Json.Time(e.T) + "}");
                    return;
                case EventKind.Move:
                case EventKind.Shape:
                    string id = catalog.Resolve(e.Cursor, e.Showing);
                    if (id != shape)
                    {
                        Release();
                        shape = id;
                        StringBuilder b = new StringBuilder(64);
                        b.Append("{\"e\":\"c\",\"t\":").Append(Json.Time(e.T)).Append(",\"id\":");
                        Json.Str(b, id);
                        b.Append('}');
                        Emit(b.ToString());
                    }
                    if (e.Kind == EventKind.Shape || paused) return;
                    if (e.T - lastMoveAt < MoveInterval && !e.Polled)
                    {
                        held = e;
                        holding = true;
                        return;
                    }
                    holding = false;
                    EmitMove(e);
                    return;
                default:
                    // Between segments only the shape matters: clicks, wheel and keys stay out.
                    if (paused) return;
                    Release();
                    Emit(Format(e));
                    return;
            }
        }

        /// <summary>Moves are thinned to one per 8 ms, but the last position before anything else is kept.</summary>
        private static void Release()
        {
            if (!holding) return;
            holding = false;
            EmitMove(held);
        }

        private static void EmitMove(RawEvent e)
        {
            lastMoveAt = e.T;
            Emit(Format(e));
        }

        private static readonly string[] Buttons = { "left", "right", "middle", "x1", "x2" };

        private static string Format(RawEvent e)
        {
            StringBuilder b = new StringBuilder(96);
            switch (e.Kind)
            {
                case EventKind.Move: b.Append("{\"e\":\"m\""); break;
                case EventKind.Down: b.Append("{\"e\":\"d\""); break;
                case EventKind.Up: b.Append("{\"e\":\"u\""); break;
                case EventKind.Wheel:
                case EventKind.HorizontalWheel: b.Append("{\"e\":\"w\""); break;
                case EventKind.Key:
                    int vk = e.Data & 0xFFFF, mods = e.Data >> 16;
                    b.Append("{\"e\":\"k\",\"t\":").Append(Json.Time(e.T)).Append(",\"vk\":").Append(vk);
                    b.Append(",\"m\":\"").Append((mods & 1) != 0 ? '1' : '0').Append((mods & 2) != 0 ? '1' : '0');
                    b.Append((mods & 4) != 0 ? '1' : '0').Append((mods & 8) != 0 ? '1' : '0').Append('"');
                    if (e.Injected) b.Append(",\"inj\":true");
                    b.Append('}');
                    return b.ToString();
            }
            b.Append(",\"t\":").Append(Json.Time(e.T)).Append(",\"x\":").Append(e.X).Append(",\"y\":").Append(e.Y);
            if (e.Kind == EventKind.Down || e.Kind == EventKind.Up) b.Append(",\"b\":\"").Append(Buttons[e.Data]).Append('"');
            if (e.Kind == EventKind.Wheel || e.Kind == EventKind.HorizontalWheel) b.Append(",\"d\":").Append(e.Data);
            if (e.Kind == EventKind.HorizontalWheel) b.Append(",\"h\":true");
            if (e.Polled) b.Append(",\"src\":\"p\"");
            if (e.Ui) b.Append(",\"ui\":true");
            if (e.Injected) b.Append(",\"inj\":true");
            b.Append('}');
            return b.ToString();
        }

        private static void Emit(string line)
        {
            if (journal != null) journal.Enqueue(line);
            stdout.Enqueue(line);
        }

        public static string ErrorLine(string source, string message)
        {
            StringBuilder b = new StringBuilder(96);
            b.Append("{\"e\":\"error\",\"t\":").Append(Json.Time(Program.Now())).Append(",\"cmd\":");
            Json.Str(b, source);
            b.Append(",\"msg\":");
            Json.Str(b, message);
            b.Append('}');
            return b.ToString();
        }

        // ---- watchdog ---------------------------------------------------------------------

        private static void WatchdogLoop()
        {
            POINT last;
            NativeMethods.GetCursorPos(out last);
            IntPtr lastCursor = IntPtr.Zero;
            bool lastShowing = true;
            long deadSince = 0, lastPost = 0, lastKeysRepair = 0;
            bool[] buttons = new bool[5];
            int[] buttonKeys = { 0x01, 0x02, 0x04, 0x05, 0x06 };
            while (!stopping)
            {
                Thread.Sleep(hookDead ? 16 : 250);
                POINT p;
                if (!NativeMethods.GetCursorPos(out p)) continue; // secure desktop
                long now = Stopwatch.GetTimestamp();
                long lastHook = Interlocked.Read(ref lastMouseTicks);
                bool moved = p.X != last.X || p.Y != last.Y;
                last = p;
                CURSORINFO info = new CURSORINFO();
                info.Size = Marshal.SizeOf(typeof(CURSORINFO));
                bool haveCursor = NativeMethods.GetCursorInfo(ref info);
                bool showing = (info.Flags & NativeMethods.CURSOR_SHOWING) != 0;
                if (!hookDead)
                {
                    if (moved && now - lastHook > frequency)
                    {
                        hookDead = true;
                        deadSince = now;
                        lastPost = now;
                        Health("dead");
                        NativeMethods.PostThreadMessage(hookThreadId, WM_APP_REINSTALL, IntPtr.Zero, IntPtr.Zero);
                        bool swapped = NativeMethods.GetSystemMetrics(NativeMethods.SM_SWAPBUTTON) != 0;
                        for (int i = 0; i < buttons.Length; i++) buttons[i] = Pressed(Physical(buttonKeys, i, swapped));
                    }
                    else
                    {
                        if (haveCursor && (info.Cursor != lastCursor || showing != lastShowing))
                        {
                            // Shape changes while the pointer rests (an app switching to the wait cursor).
                            RawEvent e = new RawEvent();
                            e.Kind = EventKind.Shape;
                            e.T = Program.Now();
                            e.Cursor = info.Cursor;
                            e.Showing = showing;
                            Enqueue(ref e);
                        }
                        if (keys && KeyboardHookSilent(now) && now - lastKeysRepair > 2 * frequency)
                        {
                            // Typing reached Windows but neither hook saw it: the keyboard hook was removed.
                            lastKeysRepair = now;
                            NativeMethods.PostThreadMessage(hookThreadId, WM_APP_REINSTALL, IntPtr.Zero, IntPtr.Zero);
                            Health("keys");
                        }
                    }
                }
                else if (lastHook > deadSince)
                {
                    hookDead = false;
                    Health("reinstalled");
                }
                else
                {
                    double t = Program.Now();
                    if (moved)
                    {
                        RawEvent e = new RawEvent();
                        e.Kind = EventKind.Move;
                        e.T = t;
                        e.X = p.X;
                        e.Y = p.Y;
                        e.Cursor = info.Cursor;
                        e.Showing = !haveCursor || showing;
                        e.Polled = true;
                        e.Ui = Excluded(p.X, p.Y);
                        Enqueue(ref e);
                    }
                    bool swapped = NativeMethods.GetSystemMetrics(NativeMethods.SM_SWAPBUTTON) != 0;
                    for (int i = 0; i < buttons.Length; i++)
                    {
                        bool down = Pressed(Physical(buttonKeys, i, swapped));
                        if (down == buttons[i]) continue;
                        buttons[i] = down;
                        RawEvent e = new RawEvent();
                        e.Kind = down ? EventKind.Down : EventKind.Up;
                        e.T = t;
                        e.X = p.X;
                        e.Y = p.Y;
                        e.Data = i;
                        e.Polled = true;
                        e.Ui = Excluded(p.X, p.Y);
                        Enqueue(ref e);
                    }
                    if (now - lastPost > 2 * frequency)
                    {
                        lastPost = now;
                        NativeMethods.PostThreadMessage(hookThreadId, WM_APP_REINSTALL, IntPtr.Zero, IntPtr.Zero);
                    }
                }
                if (haveCursor)
                {
                    lastCursor = info.Cursor;
                    lastShowing = showing;
                }
            }
        }

        /// <summary>
        /// Fresh input according to Windows (GetLastInputInfo) that no callback received for over a
        /// second. The pointer check above covers the mouse hook; this one catches the keyboard hook.
        /// </summary>
        private static bool KeyboardHookSilent(long now)
        {
            LASTINPUTINFO info = new LASTINPUTINFO();
            info.Size = Marshal.SizeOf(typeof(LASTINPUTINFO));
            if (!NativeMethods.GetLastInputInfo(ref info)) return false;
            uint inputAge = unchecked((uint)Environment.TickCount - info.Time);
            long callback = Math.Max(Interlocked.Read(ref lastMouseTicks), Interlocked.Read(ref lastKeyTicks));
            return inputAge < 500 && now - callback > frequency;
        }

        /// <summary>GetAsyncKeyState reads physical buttons; swapped buttons exchange left and right.</summary>
        private static int Physical(int[] keys, int logical, bool swapped)
        {
            if (swapped && logical == 0) return keys[1];
            if (swapped && logical == 1) return keys[0];
            return keys[logical];
        }

        private static void Health(string state)
        {
            EnqueueLine("{\"e\":\"health\",\"t\":" + Json.Time(Program.Now()) + ",\"hook\":\"" + state + "\"}");
        }

        // ---- commands ---------------------------------------------------------------------

        private static void Command(JavaScriptSerializer parser, string line)
        {
            string name = null;
            try
            {
                Dictionary<string, object> c = Json.Parse(parser, line);
                name = Json.Text(c, "cmd");
                switch (name)
                {
                    case "exclude":
                        object[] rects = Json.Array(c, "rects");
                        int[] flat = new int[rects.Length * 4];
                        for (int i = 0; i < rects.Length; i++)
                        {
                            Dictionary<string, object> r = rects[i] as Dictionary<string, object>;
                            if (r == null) throw new FormatException("Retângulo inválido.");
                            int x = Json.Int(r, "x"), y = Json.Int(r, "y"), w = Json.Int(r, "w"), h = Json.Int(r, "h");
                            if (w < 0 || h < 0) throw new FormatException("Retângulo inválido.");
                            flat[i * 4] = x;
                            flat[i * 4 + 1] = y;
                            flat[i * 4 + 2] = x + w;
                            flat[i * 4 + 3] = y + h;
                        }
                        excluded = flat;
                        break;
                    case "keys":
                        HashSet<int> blocked = new HashSet<int>();
                        foreach (object item in Json.Has(c, "block") ? Json.Array(c, "block") : new object[0])
                        {
                            Dictionary<string, object> k = item as Dictionary<string, object>;
                            if (k == null) throw new FormatException("Tecla inválida.");
                            int vk = Json.Int(k, "vk"), mods = Json.Int(k, "m");
                            if (vk <= 0 || vk > 255 || mods < 0 || mods > 15) throw new FormatException("Tecla inválida.");
                            blocked.Add(vk | (mods << 16));
                        }
                        HashSet<long> allowed = new HashSet<long>();
                        foreach (object item in Json.Has(c, "allow") ? Json.Array(c, "allow") : new object[0])
                        {
                            long hwnd;
                            if (!(item is string) || !long.TryParse((string)item, out hwnd)) throw new FormatException("Janela inválida.");
                            allowed.Add(hwnd);
                        }
                        blockedKeys = blocked;
                        allowedWindows = allowed;
                        break;
                    case "pause":
                    case "resume":
                        SetPaused(name == "pause");
                        break;
                    case "follow":
                        WindowWatch.Follow(Json.Has(c, "hwnd") ? Json.Handle(c, "hwnd") : IntPtr.Zero);
                        break;
                    case "front":
                        WindowWatch.Front(Json.Handle(c, "hwnd"), Json.Flag(c, "on"));
                        break;
                    case "caret":
                        if (Json.Flag(c, "on")) Caret.Start();
                        else Caret.Stop();
                        break;
                    default:
                        throw new FormatException("Comando desconhecido.");
                }
                StringBuilder ack = new StringBuilder(48);
                ack.Append("{\"e\":\"ack\",\"t\":").Append(Json.Time(Program.Now())).Append(",\"cmd\":");
                Json.Str(ack, name);
                ack.Append('}');
                EnqueueLine(ack.ToString());
            }
            catch (FormatException error)
            {
                EnqueueLine(ErrorLine(name ?? "?", error.Message));
            }
            catch (ArgumentException error)
            {
                EnqueueLine(ErrorLine(name ?? "?", error.Message));
            }
            catch (InvalidOperationException error)
            {
                EnqueueLine(ErrorLine(name ?? "?", error.Message));
            }
        }

        /// <summary>
        /// Keys stop at the callback right away; the writer switches in queue order, so events from
        /// before the command are still written. Resuming also records where the pointer is.
        /// </summary>
        private static void SetPaused(bool pause)
        {
            keysPaused = pause;
            RawEvent e = new RawEvent();
            e.Kind = pause ? EventKind.Pause : EventKind.Resume;
            e.T = Program.Now();
            Enqueue(ref e);
            if (pause) return;
            POINT p;
            CURSORINFO info = new CURSORINFO();
            info.Size = Marshal.SizeOf(typeof(CURSORINFO));
            if (!NativeMethods.GetCursorPos(out p) || !NativeMethods.GetCursorInfo(ref info)) return;
            RawEvent here = new RawEvent();
            here.Kind = EventKind.Move;
            here.T = Program.Now();
            here.X = p.X;
            here.Y = p.Y;
            here.Cursor = info.Cursor;
            here.Showing = (info.Flags & NativeMethods.CURSOR_SHOWING) != 0;
            here.Polled = true;
            here.Ui = Excluded(p.X, p.Y);
            Enqueue(ref here);
        }
    }

    /// <summary>The only thread that writes stdout; if the app stops reading, only this thread waits.</summary>
    internal sealed class StdoutPump
    {
        private const int MaxLines = 1 << 20;
        private readonly ConcurrentQueue<string> lines = new ConcurrentQueue<string>();
        private readonly AutoResetEvent signal = new AutoResetEvent(false);
        private readonly LineWriter output = LineWriter.StandardOutput();
        private readonly Thread thread;
        private volatile bool finishing;
        private volatile bool broken;
        private int pending;
        private long dropped;

        public StdoutPump()
        {
            thread = new Thread(Loop);
            thread.Name = "stdout";
            thread.IsBackground = true;
            thread.Start();
        }

        public int Pending
        {
            get { return Volatile.Read(ref pending); }
        }

        public void Enqueue(string line)
        {
            if (broken) return;
            if (Interlocked.Increment(ref pending) > MaxLines)
            {
                // The journal keeps everything; stdout only loses lines after ~17 minutes of an app that stopped reading.
                Interlocked.Decrement(ref pending);
                Interlocked.Increment(ref dropped);
                return;
            }
            lines.Enqueue(line);
            signal.Set();
        }

        public void Finish(int timeout)
        {
            finishing = true;
            signal.Set();
            thread.Join(timeout);
        }

        private void Loop()
        {
            for (;;)
            {
                signal.WaitOne(250);
                string line;
                bool wrote = false;
                while (lines.TryDequeue(out line))
                {
                    Interlocked.Decrement(ref pending);
                    if (broken) continue;
                    try
                    {
                        output.Write(line, false);
                        wrote = true;
                    }
                    catch (IOException)
                    {
                        // The app closed the pipe; stdin's end of file follows and shuts us down.
                        broken = true;
                    }
                }
                if (wrote && !broken)
                {
                    try
                    {
                        output.Flush();
                    }
                    catch (IOException)
                    {
                        broken = true;
                    }
                }
                if (finishing && Volatile.Read(ref pending) == 0) return;
            }
        }
    }
}
