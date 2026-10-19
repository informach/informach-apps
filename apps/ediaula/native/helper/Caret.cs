using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using Informach.Edi.Native;

namespace EdiAula.Helper
{
    /// <summary>
    /// Where the text cursor of the focused element is, at most ten times a second, on its own
    /// thread. UI Automation gives the selection of editors and browsers; classic Win32 edits
    /// report their caret through GetGUIThreadInfo. Off unless asked: Chromium switches on its full
    /// accessibility tree when a client reads text, which costs the recorded app some speed.
    /// </summary>
    internal static class Caret
    {
        private static readonly object gate = new object();
        private static bool running;
        // Each start gets a new generation; a thread from an earlier one ends at its next check.
        private static volatile int generation;

        public static void Start()
        {
            lock (gate)
            {
                if (running) return;
                running = true;
                int mine = ++generation;
                Thread thread = new Thread(delegate() { Loop(mine); });
                thread.Name = "caret";
                thread.IsBackground = true;
                thread.SetApartmentState(ApartmentState.MTA);
                thread.Start();
            }
        }

        public static void Stop()
        {
            lock (gate)
            {
                running = false;
                generation++;
            }
        }

        private static void Loop(int mine)
        {
            string last = null;
            try
            {
                while (generation == mine)
                {
                    long start = Stopwatch.GetTimestamp();
                    int x, y, w, h;
                    if (!Locate(out x, out y, out w, out h)) x = y = w = h = 0;
                    string key = x + "," + y + "," + w + "," + h;
                    if (key != last)
                    {
                        last = key;
                        StringBuilder b = new StringBuilder(80);
                        b.Append("{\"e\":\"caret\",\"t\":").Append(Json.Time(Program.Now()));
                        b.Append(",\"x\":").Append(x).Append(",\"y\":").Append(y).Append(",\"w\":").Append(w).Append(",\"h\":").Append(h).Append('}');
                        HookMode.EnqueueLine(b.ToString());
                    }
                    long spent = (Stopwatch.GetTimestamp() - start) * 1000 / Stopwatch.Frequency;
                    Thread.Sleep((int)Math.Max(10, 100 - spent));
                }
            }
            catch (Exception error)
            {
                // A failure here must not take the cursor capture down with it: report and stop.
                lock (gate)
                {
                    if (generation == mine) running = false;
                }
                HookMode.EnqueueLine(HookMode.ErrorLine("caret", error.GetType().Name + ": " + error.Message));
            }
        }

        private static bool Locate(out int x, out int y, out int w, out int h)
        {
            x = y = w = h = 0;
            Rect box;
            if (FromAutomation(out box))
            {
                x = (int)Math.Round(box.X);
                y = (int)Math.Round(box.Y);
                w = Math.Max(1, (int)Math.Round(box.Width));
                h = Math.Max(1, (int)Math.Round(box.Height));
                return true;
            }
            GUITHREADINFO info = new GUITHREADINFO();
            info.Size = Marshal.SizeOf(typeof(GUITHREADINFO));
            uint pid;
            uint thread = NativeMethods.GetWindowThreadProcessId(NativeMethods.GetForegroundWindow(), out pid);
            if (thread == 0 || !NativeMethods.GetGUIThreadInfo(thread, ref info) || info.Caret == IntPtr.Zero) return false;
            POINT corner = new POINT();
            corner.X = info.CaretRect.Left;
            corner.Y = info.CaretRect.Top;
            if (!NativeMethods.ClientToScreen(info.Caret, ref corner)) return false;
            x = corner.X;
            y = corner.Y;
            w = Math.Max(1, info.CaretRect.Right - info.CaretRect.Left);
            h = Math.Max(1, info.CaretRect.Bottom - info.CaretRect.Top);
            return true;
        }

        private static bool FromAutomation(out Rect box)
        {
            box = Rect.Empty;
            try
            {
                AutomationElement focused = AutomationElement.FocusedElement;
                object pattern;
                if (focused == null || !focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return false;
                TextPatternRange[] selection = ((TextPattern)pattern).GetSelection();
                if (selection.Length == 0) return false;
                TextPatternRange range = selection[selection.Length - 1];
                Rect[] rects = range.GetBoundingRectangles();
                if (rects.Length > 0)
                {
                    box = rects[rects.Length - 1];
                    return !box.IsEmpty;
                }
                // A collapsed selection has no area: measure the next character and keep its left edge.
                TextPatternRange next = range.Clone();
                next.ExpandToEnclosingUnit(TextUnit.Character);
                rects = next.GetBoundingRectangles();
                if (rects.Length == 0 || rects[0].IsEmpty) return false;
                box = new Rect(rects[0].X, rects[0].Y, 1, rects[0].Height);
                return true;
            }
            catch (ElementNotAvailableException)
            {
                return false; // focus moved while we asked
            }
            catch (InvalidOperationException)
            {
                return false; // the element no longer supports the pattern
            }
            catch (COMException)
            {
                return false; // the provider process went away or timed out
            }
        }
    }
}
