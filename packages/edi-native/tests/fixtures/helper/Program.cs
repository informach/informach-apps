using System;
using Informach.Edi.Native;

namespace EdiNative.Fixture
{
    /// <summary>Test helper with every shared module, dispatched like the apps do.</summary>
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
            if (args.Length == 1 && args[0] == "filedrop") return FileDrop.Run();
            return 2;
        }
    }
}
