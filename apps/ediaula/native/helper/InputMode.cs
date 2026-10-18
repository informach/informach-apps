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
    internal sealed class HelperError : Exception
    {
        public HelperError(string message) : base(message)
        {
        }
    }

    /// <summary>
    /// Input mode, the guided recording driver. Same protocol as the PowerShell helper it replaces:
    /// it prints {"ready":true}, reads {id, op, ...} per line and answers {id, ok, result|error}.
    /// Commands run in order on one thread, except "halt", which stops a glide at once. A glide
    /// carries a token; "halt" names it, so a halt that arrives before its glide starts still
    /// applies, and one that arrives after it ended answers halted: false. Whatever it pressed and
    /// did not let go of (a drag cut short, a shortcut Windows took only in part) goes up when its
    /// input ends or the process fails, so the teacher never gets a button or a key stuck down.
    /// </summary>
    internal static class InputMode
    {
        private static readonly int InputSize = Marshal.SizeOf(typeof(INPUT));
        private static LineWriter output;
        private static UIntPtr tag;
        private static readonly object glides = new object();
        // Tokens of glides waiting to run, of the one running, and of those asked to stop.
        private static readonly HashSet<string> queuedGlides = new HashSet<string>();
        private static readonly HashSet<string> haltedGlides = new HashSet<string>();
        private static string activeGlide;
        private static readonly HeldInput held = new HeldInput();
        // The input ended: commands still queued are refused instead of run.
        private static volatile bool closing;

        public static int Run(Options options)
        {
            output = LineWriter.StandardOutput();
            tag = new UIntPtr(options.TestTag);
            BlockingCollection<KeyValuePair<object, Dictionary<string, object>>> work = new BlockingCollection<KeyValuePair<object, Dictionary<string, object>>>();
            Thread executor = new Thread(delegate()
            {
                foreach (KeyValuePair<object, Dictionary<string, object>> item in work.GetConsumingEnumerable()) Execute(item.Key, item.Value);
            });
            executor.Name = "input";
            executor.IsBackground = true;
            // Glide steps keep a 120 Hz pace with 100 ms of slack: same priority as the hook thread.
            executor.Priority = ThreadPriority.Highest;
            AppDomain.CurrentDomain.UnhandledException += delegate { ReleaseHeld(false); };
            executor.Start();
            output.Write("{\"ready\":true}", true);
            JavaScriptSerializer parser = new JavaScriptSerializer();
            try
            {
                Read(parser, work);
            }
            finally
            {
                closing = true;
                lock (glides)
                {
                    if (activeGlide != null) haltedGlides.Add(activeGlide);
                }
                work.CompleteAdding();
                executor.Join();
                ReleaseHeld(false);
            }
            return 0;
        }

        private static void Read(JavaScriptSerializer parser, BlockingCollection<KeyValuePair<object, Dictionary<string, object>>> work)
        {
            using (StreamReader input = LineWriter.StandardInput())
            {
                string line;
                while ((line = input.ReadLine()) != null)
                {
                    if (line.Trim().Length == 0) continue;
                    Dictionary<string, object> c;
                    try
                    {
                        c = Json.Parse(parser, line);
                    }
                    catch (ArgumentException)
                    {
                        Reply(null, false, "Comando inválido.");
                        continue;
                    }
                    catch (InvalidOperationException)
                    {
                        Reply(null, false, "Comando inválido.");
                        continue;
                    }
                    catch (FormatException)
                    {
                        Reply(null, false, "Comando inválido.");
                        continue;
                    }
                    object id;
                    c.TryGetValue("id", out id);
                    object op;
                    c.TryGetValue("op", out op);
                    object token;
                    c.TryGetValue("token", out token);
                    if ("halt".Equals(op))
                    {
                        Reply(id, true, "{\"halted\":" + Json.Bool(Halt(token as string)) + "}");
                        continue;
                    }
                    if ("glide".Equals(op) && token is string)
                        lock (glides) queuedGlides.Add((string)token);
                    work.Add(new KeyValuePair<object, Dictionary<string, object>>(id, c));
                }
            }
        }

        /// <summary>Lets go of what the helper still holds down (only the keys, after a failed shortcut).</summary>
        private static void ReleaseHeld(bool keysOnly)
        {
            INPUT[] ups = held.Take(keysOnly);
            if (ups.Length > 0) Send(ups);
        }

        /// <summary>The self-test's script: a drag cut short and a shortcut Windows took in part.</summary>
        public static string[] HeldAfterScript()
        {
            HeldInput h = new HeldInput();
            INPUT[] drag = new INPUT[] { MouseInput(NativeMethods.MOUSEEVENTF_LEFTDOWN, 0, 0, 0) };
            h.Track(drag, 1);
            INPUT[] combo = new INPUT[] { KeyInput(0x11, false), KeyInput(0x41, false), KeyInput(0x41, true), KeyInput(0x11, true) };
            h.Track(combo, 3);
            INPUT[] click = new INPUT[] { MouseInput(NativeMethods.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0), MouseInput(NativeMethods.MOUSEEVENTF_RIGHTUP, 0, 0, 0) };
            h.Track(click, 2);
            string[] before = h.Names();
            INPUT[] keys = h.Take(true);
            string[] after = h.Names();
            INPUT[] rest = h.Take(false);
            bool keysUp = keys.Length == 1 && (keys[0].Data.Key.Flags & NativeMethods.KEYEVENTF_KEYUP) != 0;
            bool buttonUp = rest.Length == 1 && rest[0].Data.Mouse.Flags == NativeMethods.MOUSEEVENTF_LEFTUP;
            List<string> result = new List<string>(before);
            result.Add("|");
            result.AddRange(after);
            result.Add(keysUp && buttonUp && h.Names().Length == 0 ? "ok" : "wrong");
            return result.ToArray();
        }

        /// <summary>Marks the glide to stop; false when it already ended (or never existed).</summary>
        private static bool Halt(string token)
        {
            lock (glides)
            {
                string target = token ?? activeGlide;
                if (target == null || (target != activeGlide && !queuedGlides.Contains(target))) return false;
                haltedGlides.Add(target);
                return true;
            }
        }

        private static void Execute(object id, Dictionary<string, object> c)
        {
            if (closing)
            {
                Reply(id, false, "Automação interrompida.");
                return;
            }
            string result;
            try
            {
                result = Run(c);
            }
            catch (HelperError error)
            {
                Reply(id, false, error.Message);
                return;
            }
            catch (FormatException)
            {
                Reply(id, false, "Comando inválido.");
                return;
            }
            Reply(id, true, result);
        }

        private static void Reply(object id, bool ok, string payload)
        {
            StringBuilder b = new StringBuilder(128);
            b.Append("{\"id\":");
            if (id is string) Json.Str(b, (string)id);
            else if (id is int || id is long || id is decimal) b.Append(Convert.ToString(id, System.Globalization.CultureInfo.InvariantCulture));
            else b.Append("null");
            b.Append(",\"ok\":").Append(Json.Bool(ok));
            if (ok) b.Append(",\"result\":").Append(payload);
            else
            {
                b.Append(",\"error\":");
                Json.Str(b, payload);
            }
            b.Append('}');
            output.Write(b.ToString(), true);
        }

        private static string Run(Dictionary<string, object> c)
        {
            object op;
            c.TryGetValue("op", out op);
            switch (op as string)
            {
                case "sample": return Sample(c);
                case "verify": Verify(c); return "null";
                case "move":
                    if (!MoveTo(Json.Int(c, "x"), Json.Int(c, "y"))) throw new HelperError("Não foi possível mover o cursor.");
                    return "null";
                case "click":
                    Mouse(Json.Flag(c, "right") ? "right" : "left", true, true, false);
                    return "null";
                case "double":
                    Mouse(Json.Flag(c, "right") ? "right" : "left", true, true, true);
                    return "null";
                case "down": Mouse(Button(c), true, false, false); return "null";
                case "up": Mouse(Button(c), false, true, false); return "null";
                case "wheel": Wheel(Json.Int(c, "delta"), Json.Flag(c, "horizontal")); return "null";
                case "key": Key(Json.Int(c, "value"), Json.Flag(c, "unicode")); return "null";
                case "combo": Combo(c); return "null";
                case "glide": return Glide(c);
                default: throw new HelperError("Comando inválido.");
            }
        }

        private static IntPtr RootAt(POINT p)
        {
            return NativeMethods.GetAncestor(NativeMethods.WindowFromPoint(p), NativeMethods.GA_ROOT);
        }

        private static string Sample(Dictionary<string, object> c)
        {
            POINT p;
            NativeMethods.GetCursorPos(out p);
            if (Json.Has(c, "x"))
            {
                p.X = Json.Int(c, "x");
                p.Y = Json.Int(c, "y");
            }
            IntPtr w = RootAt(p);
            RECT r;
            NativeMethods.GetWindowRect(w, out r);
            StringBuilder b = new StringBuilder(160);
            b.Append("{\"x\":").Append(p.X).Append(",\"y\":").Append(p.Y).Append(",\"window\":");
            Json.Str(b, Json.HandleText(w));
            b.Append(",\"title\":");
            Json.Str(b, NativeMethods.WindowTitle(w));
            b.Append(",\"left\":").Append(r.Left).Append(",\"top\":").Append(r.Top);
            b.Append(",\"width\":").Append(r.Right - r.Left).Append(",\"height\":").Append(r.Bottom - r.Top).Append('}');
            return b.ToString();
        }

        private static void Verify(Dictionary<string, object> c)
        {
            POINT p = new POINT();
            p.X = Json.Int(c, "x");
            p.Y = Json.Int(c, "y");
            IntPtr w = RootAt(p);
            RECT r;
            NativeMethods.GetWindowRect(w, out r);
            if (Json.HandleText(w) != Json.Text(c, "window") || r.Left != Json.Int(c, "left") || r.Top != Json.Int(c, "top") ||
                r.Right - r.Left != Json.Int(c, "width") || r.Bottom - r.Top != Json.Int(c, "height"))
                throw new HelperError("O alvo mudou de janela ou posição. Revise a etapa antes de continuar.");
            if (Json.Flag(c, "focus") && NativeMethods.GetForegroundWindow() != w)
                throw new HelperError("A janela do alvo não está ativa. Não enviei a tecla.");
            if (Json.Flag(c, "cursor"))
            {
                POINT actual;
                NativeMethods.GetCursorPos(out actual);
                if (Math.Abs(actual.X - p.X) > 2 || Math.Abs(actual.Y - p.Y) > 2)
                    throw new HelperError("O mouse foi movido durante a espera. Não executei o clique.");
            }
        }

        private static INPUT MouseInput(uint flags, int dx, int dy, uint data)
        {
            INPUT input = new INPUT();
            input.Type = NativeMethods.INPUT_MOUSE;
            input.Data.Mouse.Dx = dx;
            input.Data.Mouse.Dy = dy;
            input.Data.Mouse.MouseData = data;
            input.Data.Mouse.Flags = flags;
            input.Data.Mouse.ExtraInfo = tag;
            return input;
        }

        /// <summary>Every input goes out here, so the buttons and keys left down are known.</summary>
        private static bool Send(INPUT[] inputs)
        {
            uint sent = NativeMethods.SendInput((uint)inputs.Length, inputs, InputSize);
            held.Track(inputs, (int)sent);
            return sent == inputs.Length;
        }

        /// <summary>
        /// Absolute moves go through the input stream (unlike SetCursorPos), so the recorder's hook
        /// sees them. Normalized coordinates can land one pixel off; the last correction is exact.
        /// </summary>
        private static bool MoveTo(int x, int y)
        {
            int left = NativeMethods.GetSystemMetrics(NativeMethods.SM_XVIRTUALSCREEN);
            int top = NativeMethods.GetSystemMetrics(NativeMethods.SM_YVIRTUALSCREEN);
            int width = Math.Max(2, NativeMethods.GetSystemMetrics(NativeMethods.SM_CXVIRTUALSCREEN));
            int height = Math.Max(2, NativeMethods.GetSystemMetrics(NativeMethods.SM_CYVIRTUALSCREEN));
            int dx = (int)Math.Round((x - left) * 65535.0 / (width - 1));
            int dy = (int)Math.Round((y - top) * 65535.0 / (height - 1));
            uint flags = NativeMethods.MOUSEEVENTF_MOVE | NativeMethods.MOUSEEVENTF_ABSOLUTE | NativeMethods.MOUSEEVENTF_VIRTUALDESK;
            if (!Send(new INPUT[] { MouseInput(flags, dx, dy, 0) })) return false;
            POINT actual;
            if (NativeMethods.GetCursorPos(out actual) && (actual.X != x || actual.Y != y)) return NativeMethods.SetCursorPos(x, y);
            return true;
        }

        private static string Button(Dictionary<string, object> c)
        {
            string button = Json.Has(c, "button") ? Json.Text(c, "button") : "left";
            if (button != "left" && button != "right" && button != "middle") throw new HelperError("Botão inválido.");
            return button;
        }

        private static void Mouse(string button, bool down, bool up, bool twice)
        {
            uint downFlag = button == "right" ? NativeMethods.MOUSEEVENTF_RIGHTDOWN : button == "middle" ? NativeMethods.MOUSEEVENTF_MIDDLEDOWN : NativeMethods.MOUSEEVENTF_LEFTDOWN;
            uint upFlag = button == "right" ? NativeMethods.MOUSEEVENTF_RIGHTUP : button == "middle" ? NativeMethods.MOUSEEVENTF_MIDDLEUP : NativeMethods.MOUSEEVENTF_LEFTUP;
            List<INPUT> inputs = new List<INPUT>();
            for (int i = 0; i < (twice ? 2 : 1); i++)
            {
                if (down) inputs.Add(MouseInput(downFlag, 0, 0, 0));
                if (up) inputs.Add(MouseInput(upFlag, 0, 0, 0));
            }
            if (!Send(inputs.ToArray())) throw new HelperError("Windows recusou o clique.");
        }

        private static void Wheel(int delta, bool horizontal)
        {
            if (delta == 0 || Math.Abs(delta) > 120 * 50) throw new HelperError("Rolagem inválida.");
            uint flags = horizontal ? NativeMethods.MOUSEEVENTF_HWHEEL : NativeMethods.MOUSEEVENTF_WHEEL;
            if (!Send(new INPUT[] { MouseInput(flags, 0, 0, unchecked((uint)delta)) })) throw new HelperError("Windows recusou a rolagem.");
        }

        private static INPUT KeyInput(int vk, bool up)
        {
            INPUT input = new INPUT();
            input.Type = NativeMethods.INPUT_KEYBOARD;
            input.Data.Key.Vk = (ushort)vk;
            input.Data.Key.Scan = (ushort)NativeMethods.MapVirtualKey((uint)vk, 0);
            input.Data.Key.Flags = (Extended(vk) ? NativeMethods.KEYEVENTF_EXTENDEDKEY : 0) | (up ? NativeMethods.KEYEVENTF_KEYUP : 0);
            input.Data.Key.ExtraInfo = tag;
            return input;
        }

        /// <summary>Navigation keys outside the numeric keypad need the extended flag to be read as such.</summary>
        private static bool Extended(int vk)
        {
            return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B || vk == 0x5C || vk == 0x5D || vk == 0x6F || vk == 0x90 || vk == 0xA3 || vk == 0xA5;
        }

        private static void Key(int value, bool unicode)
        {
            if (value <= 0 || value > 0xFFFF) throw new HelperError("Tecla inválida.");
            INPUT down, up;
            if (unicode)
            {
                down = new INPUT();
                down.Type = NativeMethods.INPUT_KEYBOARD;
                down.Data.Key.Scan = (ushort)value;
                down.Data.Key.Flags = NativeMethods.KEYEVENTF_UNICODE;
                down.Data.Key.ExtraInfo = tag;
                up = down;
                up.Data.Key.Flags |= NativeMethods.KEYEVENTF_KEYUP;
            }
            else
            {
                if (value > 0xFE) throw new HelperError("Tecla inválida.");
                down = KeyInput(value, false);
                up = KeyInput(value, true);
            }
            if (!Send(new INPUT[] { down, up }))
            {
                ReleaseHeld(true);
                throw new HelperError("Windows recusou a tecla.");
            }
        }

        private static void Combo(Dictionary<string, object> c)
        {
            int vk = Json.Int(c, "value");
            if (vk <= 0 || vk > 0xFE) throw new HelperError("Tecla inválida.");
            List<int> modifiers = new List<int>();
            if (Json.Flag(c, "ctrl")) modifiers.Add(0x11);
            if (Json.Flag(c, "alt")) modifiers.Add(0x12);
            if (Json.Flag(c, "shift")) modifiers.Add(0x10);
            if (Json.Flag(c, "win")) modifiers.Add(0x5B);
            if (modifiers.Count == 0) throw new HelperError("Atalho sem modificador.");
            List<INPUT> inputs = new List<INPUT>();
            foreach (int m in modifiers) inputs.Add(KeyInput(m, false));
            inputs.Add(KeyInput(vk, false));
            inputs.Add(KeyInput(vk, true));
            for (int i = modifiers.Count - 1; i >= 0; i--) inputs.Add(KeyInput(modifiers[i], true));
            if (!Send(inputs.ToArray()))
            {
                // Windows may have taken the modifiers and not the rest: none of them stays down.
                ReleaseHeld(true);
                throw new HelperError("Windows recusou o atalho.");
            }
        }

        /// <summary>Same curve as smoothPointer in src/shared/guidedRecording.ts.</summary>
        private static double Smooth(double t)
        {
            double p = Math.Max(0, Math.Min(1, t));
            return p * p * (3 - 2 * p);
        }

        private static int Round(double value)
        {
            return (int)Math.Floor(value + 0.5); // JavaScript's Math.round
        }

        /// <summary>
        /// One movement interpolated here at 120 Hz on the QueryPerformanceCounter clock. "at" resumes
        /// the same curve after a pause; a step that comes too late stops the glide where it is,
        /// instead of jumping, and the answer carries "late".
        /// </summary>
        private static string Glide(Dictionary<string, object> c)
        {
            string token = Json.Has(c, "token") ? Json.Text(c, "token") : "glide:" + Guid.NewGuid().ToString("N");
            lock (glides)
            {
                queuedGlides.Remove(token);
                activeGlide = token;
            }
            try
            {
                return Glide(c, token);
            }
            finally
            {
                lock (glides)
                {
                    activeGlide = null;
                    haltedGlides.Remove(token);
                }
            }
        }

        private static string Glide(Dictionary<string, object> c, string token)
        {
            int tx = Json.Int(c, "x"), ty = Json.Int(c, "y");
            double duration = Json.Number(c, "duration");
            double at = Json.Has(c, "at") ? Json.Number(c, "at") : 0;
            double maxLate = Json.Has(c, "maxLate") ? Json.Number(c, "maxLate") : 0.1;
            if (!(duration > 0 && duration <= 30) || at < 0 || at > 1 || !(maxLate > 0)) throw new HelperError("Movimento inválido.");
            POINT from;
            if (Json.Has(c, "from"))
            {
                Dictionary<string, object> f = Json.Object(c, "from");
                from.X = Json.Int(f, "x");
                from.Y = Json.Int(f, "y");
            }
            else NativeMethods.GetCursorPos(out from);
            // Halted before it started: report where the curve stands without moving.
            if (Halted(token))
                return GlideResult(Round(from.X + (tx - from.X) * Smooth(at)), Round(from.Y + (ty - from.Y) * Smooth(at)), at, 0, true);
            long frequency = Stopwatch.Frequency;
            double span = duration * (1 - at);
            NativeMethods.timeBeginPeriod(1);
            try
            {
                long start = Stopwatch.GetTimestamp(), previous = start;
                int x = from.X, y = from.Y;
                double u = at;
                for (int step = 0; ; step++)
                {
                    long now = Stopwatch.GetTimestamp();
                    double gap = (now - previous) / (double)frequency;
                    if (step > 0 && gap > maxLate) return GlideResult(x, y, u, gap, false);
                    previous = now;
                    double elapsed = (now - start) / (double)frequency;
                    u = span <= 0 ? 1 : Math.Min(1, at + (1 - at) * (elapsed / span));
                    double p = Smooth(u);
                    x = Round(from.X + (tx - from.X) * p);
                    y = Round(from.Y + (ty - from.Y) * p);
                    if (!MoveTo(x, y)) throw new HelperError("Não foi possível mover o cursor.");
                    if (u >= 1) return GlideResult(tx, ty, 1, 0, false);
                    if (Halted(token)) return GlideResult(x, y, u, 0, true);
                    long next = start + (long)((step + 1) * frequency / 120.0);
                    while (Stopwatch.GetTimestamp() < next - frequency / 500) Thread.Sleep(1);
                    while (Stopwatch.GetTimestamp() < next) Thread.SpinWait(50);
                }
            }
            finally
            {
                NativeMethods.timeEndPeriod(1);
            }
        }

        private static bool Halted(string token)
        {
            lock (glides) return haltedGlides.Contains(token);
        }

        private static string GlideResult(int x, int y, double at, double late, bool halted)
        {
            StringBuilder b = new StringBuilder(80);
            b.Append("{\"x\":").Append(x).Append(",\"y\":").Append(y).Append(",\"at\":").Append(Json.Num(at));
            if (late > 0) b.Append(",\"late\":").Append(Json.Num(late));
            if (halted) b.Append(",\"halted\":true");
            b.Append('}');
            return b.ToString();
        }
    }

    /// <summary>
    /// The buttons and keys sent down and not yet up, each with the input that lets go of it.
    /// Only what Windows took counts (SendInput may take the first inputs of a batch and not the rest).
    /// </summary>
    internal sealed class HeldInput
    {
        private readonly object sync = new object();
        private readonly Dictionary<string, INPUT> ups = new Dictionary<string, INPUT>();

        public void Track(INPUT[] inputs, int sent)
        {
            lock (sync)
                for (int i = 0; i < sent && i < inputs.Length; i++) Track(inputs[i]);
        }

        private void Track(INPUT input)
        {
            if (input.Type == NativeMethods.INPUT_MOUSE)
            {
                Button(input, "left", NativeMethods.MOUSEEVENTF_LEFTDOWN, NativeMethods.MOUSEEVENTF_LEFTUP);
                Button(input, "right", NativeMethods.MOUSEEVENTF_RIGHTDOWN, NativeMethods.MOUSEEVENTF_RIGHTUP);
                Button(input, "middle", NativeMethods.MOUSEEVENTF_MIDDLEDOWN, NativeMethods.MOUSEEVENTF_MIDDLEUP);
                return;
            }
            if (input.Type != NativeMethods.INPUT_KEYBOARD) return;
            uint flags = input.Data.Key.Flags;
            string name = (flags & NativeMethods.KEYEVENTF_UNICODE) != 0 ? "u" + input.Data.Key.Scan : "k" + input.Data.Key.Vk;
            if ((flags & NativeMethods.KEYEVENTF_KEYUP) != 0)
            {
                ups.Remove(name);
                return;
            }
            INPUT up = input;
            up.Data.Key.Flags = flags | NativeMethods.KEYEVENTF_KEYUP;
            ups[name] = up;
        }

        private void Button(INPUT input, string name, uint downFlag, uint upFlag)
        {
            uint flags = input.Data.Mouse.Flags;
            if ((flags & downFlag) != 0)
            {
                INPUT up = input;
                up.Data.Mouse.Flags = upFlag;
                up.Data.Mouse.Dx = 0;
                up.Data.Mouse.Dy = 0;
                up.Data.Mouse.MouseData = 0;
                ups[name] = up;
            }
            if ((flags & upFlag) != 0) ups.Remove(name);
        }

        /// <summary>The inputs that let go of everything held (or only of the keys), forgotten here.</summary>
        public INPUT[] Take(bool keysOnly)
        {
            lock (sync)
            {
                List<INPUT> result = new List<INPUT>();
                List<string> names = new List<string>();
                foreach (KeyValuePair<string, INPUT> item in ups)
                {
                    if (keysOnly && item.Value.Type != NativeMethods.INPUT_KEYBOARD) continue;
                    result.Add(item.Value);
                    names.Add(item.Key);
                }
                foreach (string name in names) ups.Remove(name);
                return result.ToArray();
            }
        }

        /// <summary>What is held, sorted, for the self-test.</summary>
        public string[] Names()
        {
            lock (sync)
            {
                List<string> names = new List<string>(ups.Keys);
                names.Sort(StringComparer.Ordinal);
                return names.ToArray();
            }
        }
    }
}
