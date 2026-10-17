using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace EdiAula.Helper
{
    /// <summary>
    /// The list mode: monitors as Windows orders them, the Desktop Duplication outputs of every
    /// adapter (output index = ddagrab's output_idx on adapter 0) and the windows a person could pick.
    /// </summary>
    internal static class Displays
    {
        public static int Run()
        {
            StringBuilder b = new StringBuilder(4096);
            b.Append("{\"e\":\"list\",\"v\":");
            Json.Str(b, Program.Version);
            b.Append(",\"monitors\":[");
            AppendMonitors(b);
            b.Append("],\"outputs\":[");
            AppendOutputs(b);
            b.Append("],\"windows\":[");
            AppendWindows(b);
            b.Append("]}");
            LineWriter output = LineWriter.StandardOutput();
            output.Write(b.ToString(), true);
            return 0;
        }

        private static void AppendMonitors(StringBuilder b)
        {
            List<IntPtr> monitors = new List<IntPtr>();
            NativeMethods.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data)
            {
                monitors.Add(monitor);
                return true;
            }, IntPtr.Zero);
            for (int i = 0; i < monitors.Count; i++)
            {
                MONITORINFOEX info = new MONITORINFOEX();
                info.Size = Marshal.SizeOf(typeof(MONITORINFOEX));
                if (!NativeMethods.GetMonitorInfo(monitors[i], ref info)) continue;
                uint dpiX, dpiY;
                if (NativeMethods.GetDpiForMonitor(monitors[i], 0, out dpiX, out dpiY) != 0) dpiX = 96;
                if (b[b.Length - 1] != '[') b.Append(',');
                b.Append("{\"index\":").Append(i).Append(",\"device\":");
                Json.Str(b, info.Device);
                b.Append(",\"x\":").Append(info.Monitor.Left).Append(",\"y\":").Append(info.Monitor.Top);
                b.Append(",\"w\":").Append(info.Monitor.Right - info.Monitor.Left).Append(",\"h\":").Append(info.Monitor.Bottom - info.Monitor.Top);
                b.Append(",\"work\":");
                Json.Rect(b, info.Work.Left, info.Work.Top, info.Work.Right - info.Work.Left, info.Work.Bottom - info.Work.Top);
                b.Append(",\"primary\":").Append(Json.Bool((info.Flags & 1) != 0));
                b.Append(",\"dpi\":").Append(dpiX).Append('}');
            }
        }

        private static void AppendOutputs(StringBuilder b)
        {
            Guid iid = typeof(IDXGIFactory1).GUID;
            IDXGIFactory1 factory;
            int hr = NativeMethods.CreateDXGIFactory1(ref iid, out factory);
            if (hr != 0) throw new COMException("CreateDXGIFactory1", hr);
            try
            {
                for (uint a = 0; ; a++)
                {
                    IDXGIAdapter1 adapter;
                    hr = factory.EnumAdapters1(a, out adapter);
                    if (hr == NativeMethods.DXGI_ERROR_NOT_FOUND) break;
                    if (hr != 0) throw new COMException("EnumAdapters1", hr);
                    try
                    {
                        DXGI_ADAPTER_DESC1 adapterDesc;
                        string gpu = adapter.GetDesc1(out adapterDesc) == 0 ? adapterDesc.Description : null;
                        for (uint o = 0; ; o++)
                        {
                            IDXGIOutput output;
                            hr = adapter.EnumOutputs(o, out output);
                            if (hr == NativeMethods.DXGI_ERROR_NOT_FOUND) break;
                            if (hr != 0) throw new COMException("EnumOutputs", hr);
                            try
                            {
                                DXGI_OUTPUT_DESC desc;
                                hr = output.GetDesc(out desc);
                                if (hr != 0) throw new COMException("IDXGIOutput.GetDesc", hr);
                                RECT r = desc.DesktopCoordinates;
                                if (b[b.Length - 1] != '[') b.Append(',');
                                b.Append("{\"adapter\":").Append(a).Append(",\"index\":").Append(o).Append(",\"device\":");
                                Json.Str(b, desc.DeviceName);
                                b.Append(",\"x\":").Append(r.Left).Append(",\"y\":").Append(r.Top);
                                b.Append(",\"w\":").Append(r.Right - r.Left).Append(",\"h\":").Append(r.Bottom - r.Top);
                                b.Append(",\"attached\":").Append(Json.Bool(desc.AttachedToDesktop != 0));
                                b.Append(",\"rotation\":").Append(desc.Rotation).Append(",\"gpu\":");
                                Json.Str(b, gpu);
                                b.Append('}');
                            }
                            finally
                            {
                                Marshal.ReleaseComObject(output);
                            }
                        }
                    }
                    finally
                    {
                        Marshal.ReleaseComObject(adapter);
                    }
                }
            }
            finally
            {
                Marshal.ReleaseComObject(factory);
            }
        }

        private static void AppendWindows(StringBuilder b)
        {
            List<IntPtr> windows = new List<IntPtr>();
            NativeMethods.EnumWindows(delegate(IntPtr hwnd, IntPtr data)
            {
                windows.Add(hwnd);
                return true;
            }, IntPtr.Zero);
            foreach (IntPtr hwnd in windows)
            {
                if (!NativeMethods.IsWindowVisible(hwnd)) continue;
                int cloaked;
                if (NativeMethods.DwmGetWindowAttribute(hwnd, NativeMethods.DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) continue;
                // The same rule as Alt+Tab: owned and tool windows only when they ask to appear.
                long style = NativeMethods.ExtendedStyle(hwnd);
                bool app = (style & NativeMethods.WS_EX_APPWINDOW) != 0;
                if (!app && ((style & NativeMethods.WS_EX_TOOLWINDOW) != 0 || NativeMethods.GetWindow(hwnd, NativeMethods.GW_OWNER) != IntPtr.Zero)) continue;
                string title = NativeMethods.WindowTitle(hwnd);
                if (title.Length == 0) continue;
                RECT r = NativeMethods.WindowBounds(hwnd);
                bool minimized = NativeMethods.IsIconic(hwnd);
                if (!minimized && (r.Right <= r.Left || r.Bottom <= r.Top)) continue;
                uint pid;
                NativeMethods.GetWindowThreadProcessId(hwnd, out pid);
                if (b[b.Length - 1] != '[') b.Append(',');
                b.Append("{\"hwnd\":");
                Json.Str(b, Json.HandleText(hwnd));
                b.Append(",\"title\":");
                Json.Str(b, title);
                b.Append(",\"pid\":").Append(pid).Append(",\"exe\":");
                Json.Str(b, NativeMethods.ProcessImage(pid));
                b.Append(",\"x\":").Append(r.Left).Append(",\"y\":").Append(r.Top);
                b.Append(",\"w\":").Append(r.Right - r.Left).Append(",\"h\":").Append(r.Bottom - r.Top);
                b.Append(",\"min\":").Append(Json.Bool(minimized)).Append('}');
            }
        }
    }
}
