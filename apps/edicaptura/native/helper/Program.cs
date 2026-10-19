using System;
using Informach.Edi.Native;

namespace EdiCaptura.Helper
{
    /// <summary>
    /// EdiCaptura native helper, built only from the suite's shared modules (@informach/edi-native):
    ///   capture [--session]  window, cursor, focus and wheel queries of the capture bridge
    ///   filedrop             one exported file on the clipboard as a file reference
    ///   --version            prints the version it was built with
    /// Coordinates are physical pixels of the virtual desktop (the manifest declares per-monitor v2).
    /// </summary>
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length == 1 && args[0] == "--version")
            {
                Console.Out.Write(HelperInfo.Version + "\n");
                return 0;
            }
            if (args.Length == 1 && args[0] == "capture") return WindowCapture.Run(false);
            if (args.Length == 2 && args[0] == "capture" && args[1] == "--session") return WindowCapture.Run(true);
            if (args.Length == 1 && args[0] == "filedrop") return FileDrop.Run();
            Console.Error.WriteLine("usage: edicaptura-helper capture [--session] | filedrop | --version");
            return 2;
        }
    }
}
