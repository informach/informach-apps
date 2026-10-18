using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace EdiAula.Helper
{
    /// <summary>
    /// Captures the system hand and two cursors built here (one with alpha, one monochrome with
    /// inverting pixels) through the hook's capture path, writes their PNGs and prints what it saw,
    /// and what the input mode would let go of after a scripted drag and a partial shortcut.
    /// </summary>
    internal static class SelfTest
    {
        private const int Size = 32;

        public static int Run(Options options)
        {
            string directory = options.Out ?? Path.Combine(Path.GetTempPath(), "ediaula-helper-selftest");
            Directory.CreateDirectory(directory);
            StringBuilder b = new StringBuilder(1024);
            b.Append("{\"e\":\"selftest\",\"v\":");
            Json.Str(b, Program.Version);
            b.Append(",\"cursors\":[");
            Describe(b, "hand", CursorCatalog.Capture(NativeMethods.LoadCursor(IntPtr.Zero, new IntPtr(32649))), directory);
            IntPtr alpha = AlphaCursor();
            try
            {
                b.Append(',');
                Describe(b, "alpha", CursorCatalog.Capture(alpha), directory);
            }
            finally
            {
                NativeMethods.DestroyIcon(alpha);
            }
            IntPtr mono = MonochromeCursor();
            try
            {
                b.Append(',');
                Describe(b, "mono", CursorCatalog.Capture(mono), directory);
            }
            finally
            {
                NativeMethods.DestroyIcon(mono);
            }
            b.Append("],\"held\":[");
            string[] held = InputMode.HeldAfterScript();
            for (int i = 0; i < held.Length; i++)
            {
                if (i > 0) b.Append(',');
                Json.Str(b, held[i]);
            }
            b.Append("]}");
            LineWriter.StandardOutput().Write(b.ToString(), true);
            return 0;
        }

        private static void Describe(StringBuilder b, string name, CursorImage image, string directory)
        {
            if (image == null) throw new InvalidOperationException("Não foi possível capturar o cursor " + name + ".");
            string file = Path.Combine(directory, image.Hash + ".png");
            CursorCatalog.WritePng(image, file);
            b.Append("{\"name\":");
            Json.Str(b, name);
            b.Append(",\"id\":");
            Json.Str(b, image.Hash);
            b.Append(",\"w\":").Append(image.Width).Append(",\"h\":").Append(image.Height);
            b.Append(",\"hx\":").Append(image.HotX).Append(",\"hy\":").Append(image.HotY);
            b.Append(",\"inv\":").Append(image.Inverted).Append(",\"file\":");
            Json.Str(b, file);
            b.Append(",\"center\":");
            Pixel(b, image, image.Width / 2, image.Height / 2);
            b.Append(",\"ring\":");
            Pixel(b, image, image.Width / 2 + 10, image.Height / 2);
            b.Append(",\"corner\":");
            Pixel(b, image, 0, 0);
            b.Append('}');
        }

        /// <summary>[r, g, b, a] of one pixel.</summary>
        private static void Pixel(StringBuilder b, CursorImage image, int x, int y)
        {
            int i = (y * image.Width + x) * 4;
            b.Append('[').Append(image.Pixels[i + 2]).Append(',').Append(image.Pixels[i + 1]).Append(',');
            b.Append(image.Pixels[i]).Append(',').Append(image.Pixels[i + 3]).Append(']');
        }

        /// <summary>Opaque red disc of radius 8 inside a half-transparent green ring of radius 12.</summary>
        private static unsafe IntPtr AlphaCursor()
        {
            BITMAPINFOHEADER header = new BITMAPINFOHEADER();
            header.Size = Marshal.SizeOf(typeof(BITMAPINFOHEADER));
            header.Width = Size;
            header.Height = -Size;
            header.Planes = 1;
            header.BitCount = 32;
            IntPtr bits;
            IntPtr color = NativeMethods.CreateDIBSection(IntPtr.Zero, ref header, 0, out bits, IntPtr.Zero, 0);
            if (color == IntPtr.Zero) throw new InvalidOperationException("CreateDIBSection falhou.");
            byte* p = (byte*)bits;
            for (int y = 0; y < Size; y++)
            {
                for (int x = 0; x < Size; x++)
                {
                    double dx = x - Size / 2 + 0.5, dy = y - Size / 2 + 0.5;
                    double r = Math.Sqrt(dx * dx + dy * dy);
                    byte* px = p + (y * Size + x) * 4;
                    // Icons keep straight alpha; DrawIconEx blends them.
                    if (r < 8) { px[0] = 0; px[1] = 0; px[2] = 255; px[3] = 255; }
                    else if (r < 12) { px[0] = 0; px[1] = 255; px[2] = 0; px[3] = 128; }
                    else { px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 0; }
                }
            }
            IntPtr mask = NativeMethods.CreateBitmap(Size, Size, 1, 1, new byte[Size * Size / 8]);
            return Create(mask, color, 3, 5);
        }

        /// <summary>
        /// AND/XOR planes: a white square, a black square and an 8x8 block that inverts the screen.
        /// </summary>
        private static IntPtr MonochromeCursor()
        {
            int stride = Size / 8;
            byte[] planes = new byte[stride * Size * 2];
            for (int y = 0; y < Size; y++)
            {
                for (int x = 0; x < Size; x++)
                {
                    bool white = x >= 2 && x < 12 && y >= 2 && y < 12;
                    bool black = x >= 2 && x < 12 && y >= 16 && y < 26;
                    bool invert = x >= 16 && x < 24 && y >= 16 && y < 24;
                    bool and = !(white || black);
                    bool xor = white || invert;
                    int bit = 0x80 >> (x % 8);
                    if (and) planes[y * stride + x / 8] |= (byte)bit;
                    if (xor) planes[(Size + y) * stride + x / 8] |= (byte)bit;
                }
            }
            IntPtr mask = NativeMethods.CreateBitmap(Size, Size * 2, 1, 1, planes);
            return Create(mask, IntPtr.Zero, 0, 0);
        }

        private static IntPtr Create(IntPtr mask, IntPtr color, int hotX, int hotY)
        {
            ICONINFO info = new ICONINFO();
            info.IsIcon = 0;
            info.HotspotX = hotX;
            info.HotspotY = hotY;
            info.Mask = mask;
            info.Color = color;
            IntPtr cursor = NativeMethods.CreateIconIndirect(ref info);
            int error = Marshal.GetLastWin32Error();
            NativeMethods.DeleteObject(mask);
            if (color != IntPtr.Zero) NativeMethods.DeleteObject(color);
            if (cursor == IntPtr.Zero) throw new InvalidOperationException("CreateIconIndirect falhou: " + error);
            return cursor;
        }
    }
}
