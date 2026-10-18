using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Reflection;

namespace EdiAula.Helper
{
    /// <summary>
    /// EdiAula native helper. One executable, several modes, all speaking JSON lines:
    ///   list       monitors, Desktop Duplication outputs and visible windows, then exit
    ///   hook       mouse, cursor shape and shortcut keys on the QueryPerformanceCounter clock
    ///   input      guided recording: target sampling and synthetic mouse and keyboard input
    ///   loopback   the computer's sound without a process tree (WASAPI process loopback) to a WAV
    ///   selftest   captures known cursors through the same path as hook, for automated tests
    ///   --version  prints the version it was built with
    /// Coordinates are physical pixels of the virtual desktop (the manifest declares per-monitor v2).
    /// </summary>
    internal static class Program
    {
        public static string Version
        {
            get
            {
                object[] attributes = typeof(Program).Assembly.GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false);
                return attributes.Length > 0 ? ((AssemblyInformationalVersionAttribute)attributes[0]).InformationalVersion : "0.0.0";
            }
        }

        public static double Now()
        {
            return Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency;
        }

        [MTAThread]
        private static int Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
            {
                Console.Error.WriteLine("ediaula-helper: " + e.ExceptionObject);
            };
            if (args.Length == 0) return Usage();
            Options options;
            try
            {
                options = Options.Parse(args);
            }
            catch (FormatException error)
            {
                Console.Error.WriteLine("ediaula-helper: " + error.Message);
                return Usage();
            }
            catch (OverflowException error)
            {
                Console.Error.WriteLine("ediaula-helper: " + error.Message);
                return Usage();
            }
            switch (options.Mode)
            {
                case "--version":
                    Console.Out.Write(Version + "\n");
                    return 0;
                case "list":
                    return Displays.Run();
                case "hook":
                    return HookMode.Run(options);
                case "input":
                    return InputMode.Run(options);
                case "selftest":
                    return SelfTest.Run(options);
                case "keyrule":
                    return KeyRule.Run();
                case "loopback":
                    return AudioLoopback.Run(options);
                case "unfront":
                    return WindowWatch.Unfront(options.Rest);
                default:
                    return Usage();
            }
        }

        private static int Usage()
        {
            Console.Error.WriteLine("usage: ediaula-helper list | hook [--keys] [--caret] [--paused] [--journal <dir>] [--ui-pid <pid>] | input | loopback (--exclude-pid <pid> --out <wav> | --probe) | unfront <hwnd>... | selftest [--out <dir>] | keyrule | --version");
            return 2;
        }
    }

    internal sealed class Options
    {
        public string Mode;
        public bool Keys;
        /// <summary>Moments of typing, never the keys (KeyRule.IsTyping, TypingGate).</summary>
        public bool Typing;
        public bool Caret;
        /// <summary>Hook mode starts paused, before the first recorded segment.</summary>
        public bool Paused;
        public string Journal;
        public string Out;
        public uint UiPid;
        /// <summary>Loopback mode: the process whose tree is left out of the computer's sound.</summary>
        public uint ExcludePid;
        /// <summary>Loopback mode: only checks that the capture can be opened.</summary>
        public bool Probe;
        /// <summary>
        /// Automated tests only: input mode marks synthetic events with this value, and hook mode
        /// records events carrying it but withholds them from other applications.
        /// </summary>
        public ulong TestTag;
        /// <summary>Plain arguments after the mode (window handles for unfront).</summary>
        public List<string> Rest = new List<string>();

        public static Options Parse(string[] args)
        {
            Options o = new Options();
            o.Mode = args[0];
            for (int i = 1; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--keys": o.Keys = true; break;
                    case "--typing": o.Typing = true; break;
                    case "--caret": o.Caret = true; break;
                    case "--paused": o.Paused = true; break;
                    case "--journal": o.Journal = Value(args, ++i); break;
                    case "--out": o.Out = Value(args, ++i); break;
                    case "--ui-pid": o.UiPid = uint.Parse(Value(args, ++i), NumberStyles.None, CultureInfo.InvariantCulture); break;
                    case "--exclude-pid": o.ExcludePid = uint.Parse(Value(args, ++i), NumberStyles.None, CultureInfo.InvariantCulture); break;
                    case "--probe": o.Probe = true; break;
                    case "--test-tag": o.TestTag = ulong.Parse(Value(args, ++i), NumberStyles.None, CultureInfo.InvariantCulture); break;
                    default:
                        if (args[i].StartsWith("--", StringComparison.Ordinal)) throw new FormatException("opção desconhecida " + args[i]);
                        o.Rest.Add(args[i]);
                        break;
                }
            }
            return o;
        }

        private static string Value(string[] args, int index)
        {
            if (index >= args.Length || args[index].Length == 0) throw new FormatException("valor ausente para " + args[index - 1]);
            return args[index];
        }
    }
}
