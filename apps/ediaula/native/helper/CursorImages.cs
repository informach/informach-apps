using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Informach.Edi.Native;

namespace EdiAula.Helper
{
    internal sealed class CursorImage
    {
        public string Hash;
        public int Width;
        public int Height;
        public int HotX;
        public int HotY;
        /// <summary>Straight-alpha BGRA, top row first.</summary>
        public byte[] Pixels;
        /// <summary>Pixels that invert the screen (monochrome cursors such as the classic I-beam).</summary>
        public int Inverted;
        public bool[] InvertedMask;
    }

    /// <summary>
    /// Turns cursor handles into stable ids: the standard shapes by name, any other image by the
    /// FNV-1a hash of its size, hotspot and pixels, saved once as PNG beside the journal.
    /// </summary>
    internal sealed class CursorCatalog
    {
        public const int MaxImages = 200;
        private const int MaxHandles = 4096;

        private static readonly int[] StandardIds = { 32512, 32513, 32514, 32515, 32649, 32646, 32642, 32643, 32644, 32645, 32648, 32650 };
        private static readonly string[] StandardNames = { "arrow", "text", "wait", "cross", "hand", "move", "nwse", "nesw", "ew", "ns", "no", "busy" };

        private readonly Dictionary<IntPtr, string> standard = new Dictionary<IntPtr, string>();
        private readonly Dictionary<string, string> standardByHash = new Dictionary<string, string>();
        private readonly Dictionary<IntPtr, string> resolved = new Dictionary<IntPtr, string>();
        private readonly HashSet<string> images = new HashSet<string>();
        private readonly string directory;
        private readonly Action<string> emit;

        public CursorCatalog(string journal, Action<string> emit)
        {
            directory = journal == null ? null : Path.Combine(journal, "cursors");
            this.emit = emit;
            for (int i = 0; i < StandardIds.Length; i++)
            {
                IntPtr handle = NativeMethods.LoadCursor(IntPtr.Zero, new IntPtr(StandardIds[i]));
                if (handle != IntPtr.Zero && !standard.ContainsKey(handle)) standard[handle] = StandardNames[i];
            }
        }

        /// <summary>Images of the standard shapes, so applications that load private copies still map to them.</summary>
        public void Prime()
        {
            foreach (KeyValuePair<IntPtr, string> entry in standard)
            {
                CursorImage image = Capture(entry.Key);
                if (image == null) continue;
                if (!standardByHash.ContainsKey(image.Hash)) standardByHash[image.Hash] = entry.Value;
                Publish(entry.Value, image, entry.Value);
            }
        }

        public string Resolve(IntPtr handle, bool showing)
        {
            if (!showing) return "hidden";
            if (handle == IntPtr.Zero) return "other";
            string id;
            if (standard.TryGetValue(handle, out id) || resolved.TryGetValue(handle, out id)) return id;
            id = "other";
            if (images.Count < MaxImages)
            {
                CursorImage image = Capture(handle);
                if (image != null)
                {
                    string name;
                    if (standardByHash.TryGetValue(image.Hash, out name)) id = name;
                    else
                    {
                        id = image.Hash;
                        Publish(id, image, null);
                    }
                }
            }
            // Applications may create a new handle for every change; the hash keeps the image list small.
            if (resolved.Count >= MaxHandles) resolved.Clear();
            resolved[handle] = id;
            return id;
        }

        private void Publish(string id, CursorImage image, string std)
        {
            if (!images.Add(id)) return;
            string file = null;
            if (directory != null)
            {
                string path = Path.Combine(directory, image.Hash + ".png");
                try
                {
                    if (!File.Exists(path))
                    {
                        Directory.CreateDirectory(directory);
                        WritePng(image, path);
                    }
                    file = "cursors/" + image.Hash + ".png";
                }
                catch (IOException error)
                {
                    // Without the picture the shape keeps its id and the event says file null.
                    emit(HookMode.ErrorLine("cursor", error.Message));
                }
                catch (UnauthorizedAccessException error)
                {
                    emit(HookMode.ErrorLine("cursor", error.Message));
                }
                catch (System.Runtime.InteropServices.ExternalException error)
                {
                    // GDI+ reports its own failures (disk full while saving the PNG) this way.
                    emit(HookMode.ErrorLine("cursor", error.Message));
                }
            }
            StringBuilder b = new StringBuilder(160);
            b.Append("{\"e\":\"img\",\"id\":");
            Json.Str(b, id);
            b.Append(",\"hash\":");
            Json.Str(b, image.Hash);
            b.Append(",\"w\":").Append(image.Width).Append(",\"h\":").Append(image.Height);
            b.Append(",\"hx\":").Append(image.HotX).Append(",\"hy\":").Append(image.HotY);
            b.Append(",\"file\":");
            Json.Str(b, file);
            b.Append(",\"std\":");
            Json.Str(b, std);
            b.Append(",\"inv\":").Append(image.Inverted).Append('}');
            emit(b.ToString());
        }

        /// <summary>Draws the cursor over black and over white; the difference gives alpha and inversion.</summary>
        public static CursorImage Capture(IntPtr cursor)
        {
            ICONINFO info;
            if (!NativeMethods.GetIconInfo(cursor, out info)) return null;
            try
            {
                BITMAP bitmap;
                int width, height;
                if (info.Color != IntPtr.Zero)
                {
                    if (NativeMethods.GetObject(info.Color, Marshal.SizeOf(typeof(BITMAP)), out bitmap) == 0) return null;
                    width = bitmap.Width;
                    height = bitmap.Height;
                }
                else
                {
                    // Monochrome: the mask holds the AND plane above the XOR plane.
                    if (NativeMethods.GetObject(info.Mask, Marshal.SizeOf(typeof(BITMAP)), out bitmap) == 0) return null;
                    width = bitmap.Width;
                    height = bitmap.Height / 2;
                }
                if (width <= 0 || height <= 0 || width > 256 || height > 256) return null;
                byte[] black = Render(cursor, width, height, 0x00000000u);
                byte[] white = Render(cursor, width, height, 0x00FFFFFFu);
                if (black == null || white == null) return null;
                CursorImage image = new CursorImage();
                image.Width = width;
                image.Height = height;
                image.HotX = info.HotspotX;
                image.HotY = info.HotspotY;
                image.Pixels = new byte[width * height * 4];
                image.InvertedMask = new bool[width * height];
                for (int p = 0, i = 0; p < width * height; p++, i += 4)
                {
                    int dB = white[i] - black[i];
                    int dG = white[i + 1] - black[i + 1];
                    int dR = white[i + 2] - black[i + 2];
                    if (dB < -16 || dG < -16 || dR < -16)
                    {
                        image.InvertedMask[p] = true;
                        image.Inverted++;
                        image.Pixels[i + 3] = 255;
                        continue;
                    }
                    int alpha = 255 - Math.Max(0, Math.Min(255, (dB + dG + dR + 1) / 3));
                    if (alpha == 0) continue;
                    image.Pixels[i] = (byte)Math.Min(255, black[i] * 255 / alpha);
                    image.Pixels[i + 1] = (byte)Math.Min(255, black[i + 1] * 255 / alpha);
                    image.Pixels[i + 2] = (byte)Math.Min(255, black[i + 2] * 255 / alpha);
                    image.Pixels[i + 3] = (byte)alpha;
                }
                image.Hash = Hash(image);
                return image;
            }
            finally
            {
                if (info.Mask != IntPtr.Zero) NativeMethods.DeleteObject(info.Mask);
                if (info.Color != IntPtr.Zero) NativeMethods.DeleteObject(info.Color);
            }
        }

        private static unsafe byte[] Render(IntPtr cursor, int width, int height, uint background)
        {
            IntPtr screen = NativeMethods.GetDC(IntPtr.Zero);
            IntPtr dc = NativeMethods.CreateCompatibleDC(screen);
            NativeMethods.ReleaseDC(IntPtr.Zero, screen);
            if (dc == IntPtr.Zero) return null;
            try
            {
                BITMAPINFOHEADER header = new BITMAPINFOHEADER();
                header.Size = Marshal.SizeOf(typeof(BITMAPINFOHEADER));
                header.Width = width;
                header.Height = -height;
                header.Planes = 1;
                header.BitCount = 32;
                IntPtr bits;
                IntPtr dib = NativeMethods.CreateDIBSection(dc, ref header, 0, out bits, IntPtr.Zero, 0);
                if (dib == IntPtr.Zero) return null;
                IntPtr previous = NativeMethods.SelectObject(dc, dib);
                try
                {
                    uint* pixel = (uint*)bits;
                    for (int i = 0; i < width * height; i++) pixel[i] = background;
                    if (!NativeMethods.DrawIconEx(dc, 0, 0, cursor, width, height, 0, IntPtr.Zero, NativeMethods.DI_NORMAL)) return null;
                    NativeMethods.GdiFlush();
                    byte[] result = new byte[width * height * 4];
                    Marshal.Copy(bits, result, 0, result.Length);
                    return result;
                }
                finally
                {
                    NativeMethods.SelectObject(dc, previous);
                    NativeMethods.DeleteObject(dib);
                }
            }
            finally
            {
                NativeMethods.DeleteDC(dc);
            }
        }

        private static string Hash(CursorImage image)
        {
            ulong hash = 14695981039346656037UL;
            int[] header = { image.Width, image.Height, image.HotX, image.HotY };
            foreach (int value in header)
                for (int shift = 0; shift < 32; shift += 8) hash = (hash ^ (byte)(value >> shift)) * 1099511628211UL;
            foreach (byte value in image.Pixels) hash = (hash ^ value) * 1099511628211UL;
            foreach (bool value in image.InvertedMask) hash = (hash ^ (value ? (byte)1 : (byte)0)) * 1099511628211UL;
            return hash.ToString("x16", CultureInfo.InvariantCulture);
        }

        public static void WritePng(CursorImage image, string path)
        {
            using (Bitmap bitmap = new Bitmap(image.Width, image.Height, PixelFormat.Format32bppArgb))
            {
                BitmapData data = bitmap.LockBits(new Rectangle(0, 0, image.Width, image.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                try
                {
                    for (int y = 0; y < image.Height; y++)
                        Marshal.Copy(image.Pixels, y * image.Width * 4, new IntPtr(data.Scan0.ToInt64() + (long)y * data.Stride), image.Width * 4);
                }
                finally
                {
                    bitmap.UnlockBits(data);
                }
                string partial = path + ".partial";
                bitmap.Save(partial, ImageFormat.Png);
                if (File.Exists(path)) File.Delete(partial);
                else File.Move(partial, path);
            }
        }
    }
}
