using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using Informach.Edi.Native;

namespace EdiAula.Helper
{
    /// <summary>
    /// Follows one window (position, minimized, foreground) through WinEvents on a thread with its
    /// own message loop, and raises windows above the others for the recording, undoing it on exit.
    /// </summary>
    internal static class WindowWatch
    {
        private const uint WM_APP_FOLLOW = NativeMethods.WM_APP + 2;
        private static readonly object gate = new object();
        private static readonly Dictionary<long, bool> raised = new Dictionary<long, bool>();
        private static readonly List<IntPtr> hooks = new List<IntPtr>();
        private static readonly ManualResetEvent ready = new ManualResetEvent(false);
        private static readonly WinEventProc proc = Callback;
        private static Thread thread;
        private static uint threadId;
        private static IntPtr target;
        private static string last;

        public static void Follow(IntPtr hwnd)
        {
            if (hwnd != IntPtr.Zero && !NativeMethods.IsWindow(hwnd)) throw new ArgumentException("Janela não encontrada.");
            lock (gate)
            {
                if (thread == null)
                {
                    thread = new Thread(Loop);
                    thread.Name = "windows";
                    thread.IsBackground = true;
                    thread.Start();
                }
            }
            ready.WaitOne();
            Volatile.Write(ref target, hwnd);
            NativeMethods.PostThreadMessage(threadId, WM_APP_FOLLOW, IntPtr.Zero, IntPtr.Zero);
        }

        public static void Stop()
        {
            if (thread == null) return;
            NativeMethods.PostThreadMessage(threadId, NativeMethods.WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            thread.Join(1000);
        }

        public static void Front(IntPtr hwnd, bool on)
        {
            if (!NativeMethods.IsWindow(hwnd)) throw new ArgumentException("Janela não encontrada.");
            lock (gate)
            {
                if (on)
                {
                    // Windows that were already topmost stay that way when the recording ends.
                    if (raised.ContainsKey(hwnd.ToInt64()) || (NativeMethods.ExtendedStyle(hwnd) & NativeMethods.WS_EX_TOPMOST) != 0) return;
                    SetTopmost(hwnd, NativeMethods.HWND_TOPMOST);
                    raised[hwnd.ToInt64()] = true;
                    ReportFront(hwnd, true);
                }
                else if (raised.Remove(hwnd.ToInt64()))
                {
                    SetTopmost(hwnd, NativeMethods.HWND_NOTOPMOST);
                    ReportFront(hwnd, false);
                }
            }
        }

        /// <summary>
        /// Tells the app which windows this process raised, so it can put them back with the
        /// unfront mode if this process dies before it can do it itself.
        /// </summary>
        private static void ReportFront(IntPtr hwnd, bool on)
        {
            StringBuilder b = new StringBuilder(64);
            b.Append("{\"e\":\"front\",\"t\":").Append(Json.Time(Program.Now())).Append(",\"hwnd\":");
            Json.Str(b, Json.HandleText(hwnd));
            b.Append(",\"on\":").Append(Json.Bool(on)).Append('}');
            HookMode.EnqueueLine(b.ToString());
        }

        /// <summary>The unfront mode: takes the windows a dead hook process raised out of the topmost band.</summary>
        public static int Unfront(List<string> handles)
        {
            StringBuilder b = new StringBuilder(64);
            b.Append("{\"e\":\"unfront\",\"hwnds\":[");
            foreach (string text in handles)
            {
                long value;
                if (!long.TryParse(text, out value)) continue;
                IntPtr hwnd = new IntPtr(value);
                if (!NativeMethods.IsWindow(hwnd) || !NativeMethods.SetWindowPos(hwnd, NativeMethods.HWND_NOTOPMOST, 0, 0, 0, 0, Flags)) continue;
                if (b[b.Length - 1] != '[') b.Append(',');
                Json.Str(b, text);
            }
            b.Append("]}");
            LineWriter.StandardOutput().Write(b.ToString(), true);
            return 0;
        }

        public static void RestoreAll()
        {
            lock (gate)
            {
                foreach (long hwnd in raised.Keys)
                {
                    if (!NativeMethods.IsWindow(new IntPtr(hwnd))) continue;
                    NativeMethods.SetWindowPos(new IntPtr(hwnd), NativeMethods.HWND_NOTOPMOST, 0, 0, 0, 0, Flags);
                    ReportFront(new IntPtr(hwnd), false);
                }
                raised.Clear();
            }
        }

        private const uint Flags = NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_ASYNCWINDOWPOS;

        private static void SetTopmost(IntPtr hwnd, IntPtr after)
        {
            if (!NativeMethods.SetWindowPos(hwnd, after, 0, 0, 0, 0, Flags))
                throw new InvalidOperationException("O Windows recusou mudar a ordem da janela (" + System.Runtime.InteropServices.Marshal.GetLastWin32Error() + ").");
        }

        private static void Loop()
        {
            threadId = NativeMethods.GetCurrentThreadId();
            MSG msg;
            NativeMethods.PeekMessage(out msg, IntPtr.Zero, 0, 0, 0);
            ready.Set();
            while (NativeMethods.GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
            {
                if (msg.Hwnd == IntPtr.Zero && msg.Message == WM_APP_FOLLOW) Rehook();
            }
            Unhook();
        }

        private static void Unhook()
        {
            foreach (IntPtr hook in hooks) NativeMethods.UnhookWinEvent(hook);
            hooks.Clear();
        }

        private static void Rehook()
        {
            Unhook();
            last = null;
            IntPtr hwnd = Volatile.Read(ref target);
            if (hwnd == IntPtr.Zero) return;
            uint pid;
            uint tid = NativeMethods.GetWindowThreadProcessId(hwnd, out pid);
            uint flags = NativeMethods.WINEVENT_OUTOFCONTEXT | NativeMethods.WINEVENT_SKIPOWNPROCESS;
            hooks.Add(NativeMethods.SetWinEventHook(NativeMethods.EVENT_OBJECT_LOCATIONCHANGE, NativeMethods.EVENT_OBJECT_LOCATIONCHANGE, IntPtr.Zero, proc, pid, tid, flags));
            hooks.Add(NativeMethods.SetWinEventHook(NativeMethods.EVENT_OBJECT_DESTROY, NativeMethods.EVENT_OBJECT_DESTROY, IntPtr.Zero, proc, pid, tid, flags));
            hooks.Add(NativeMethods.SetWinEventHook(NativeMethods.EVENT_SYSTEM_MINIMIZESTART, NativeMethods.EVENT_SYSTEM_MINIMIZEEND, IntPtr.Zero, proc, pid, tid, flags));
            hooks.Add(NativeMethods.SetWinEventHook(NativeMethods.EVENT_SYSTEM_FOREGROUND, NativeMethods.EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, proc, 0, 0, flags));
            hooks.RemoveAll(delegate(IntPtr h) { return h == IntPtr.Zero; });
            Report(hwnd, false);
        }

        private static void Callback(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
        {
            IntPtr followed = Volatile.Read(ref target);
            if (followed == IntPtr.Zero) return;
            if (eventType == NativeMethods.EVENT_SYSTEM_FOREGROUND)
            {
                Report(followed, false);
                return;
            }
            if (hwnd != followed || idObject != NativeMethods.OBJID_WINDOW || idChild != NativeMethods.CHILDID_SELF) return;
            if (eventType == NativeMethods.EVENT_OBJECT_DESTROY)
            {
                Report(followed, true);
                Volatile.Write(ref target, IntPtr.Zero);
                Unhook();
                return;
            }
            Report(followed, false);
        }

        private static void Report(IntPtr hwnd, bool gone)
        {
            StringBuilder state = new StringBuilder(96);
            state.Append(",\"hwnd\":");
            Json.Str(state, Json.HandleText(hwnd));
            if (gone) state.Append(",\"gone\":true");
            else
            {
                RECT r = NativeMethods.WindowBounds(hwnd);
                state.Append(",\"rect\":");
                Json.Rect(state, r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
                state.Append(",\"min\":").Append(Json.Bool(NativeMethods.IsIconic(hwnd)));
                state.Append(",\"fg\":").Append(Json.Bool(NativeMethods.GetForegroundWindow() == hwnd));
            }
            string key = state.ToString();
            if (key == last) return;
            last = key;
            HookMode.EnqueueLine("{\"e\":\"win\",\"t\":" + Json.Time(Program.Now()) + key + "}");
        }
    }
}
