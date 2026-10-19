using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.IO;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Informach.Edi.Native
{
    /// <summary>
    /// The filedrop mode: puts one exported file on the clipboard as a file reference (CF_HDROP and
    /// "Preferred DropEffect" copy), never as text. stdin carries {"file","sha256","size"}; the file
    /// must still have that size and SHA-256 while it is held without write or delete sharing, so a
    /// replaced or changed export is refused. Prints OK and exits 0, or exits 1 without details.
    /// </summary>
    internal static class FileDrop
    {
        public const long MaxBytes = 400000000;
        private const int MaxRequest = 65536;
        private static readonly Regex Sha256Pattern = new Regex("^[0-9a-f]{64}$");

        public static int Run()
        {
            int code = 1;
            // The clipboard is an OLE service: it answers only on a single-threaded apartment.
            Thread worker = new Thread(delegate()
            {
                try
                {
                    string text = ReadRequest();
                    Dictionary<string, object> request = Json.Parse(new JavaScriptSerializer(), text);
                    double size = Json.Number(request, "size");
                    if (size != Math.Floor(size) || size <= 0 || size > MaxBytes) throw new FormatException("Tamanho inválido.");
                    string hash = Json.Text(request, "sha256");
                    if (!Sha256Pattern.IsMatch(hash)) throw new FormatException("Hash inválido.");
                    Copy(Json.Text(request, "file"), hash, (long)size);
                    LineWriter.StandardOutput().Write("OK", true);
                    code = 0;
                }
                catch (Exception)
                {
                    // Paths and system messages stay inside; the app explains the failure in its own words.
                    code = 1;
                }
            });
            worker.SetApartmentState(ApartmentState.STA);
            worker.Start();
            worker.Join();
            return code;
        }

        private static string ReadRequest()
        {
            char[] buffer = new char[MaxRequest + 1];
            StreamReader input = LineWriter.StandardInput();
            int length = 0, read;
            while (length < buffer.Length && (read = input.Read(buffer, length, buffer.Length - length)) > 0) length += read;
            if (length > MaxRequest) throw new FormatException("Pedido longo demais.");
            return new string(buffer, 0, length).Trim();
        }

        /// <summary>The data object the clipboard receives: one absolute file, copied rather than moved.</summary>
        public static DataObject CreateDataObject(string file)
        {
            if (!Path.IsPathRooted(file)) throw new ArgumentException("Absolute file required");
            StringCollection files = new StringCollection();
            files.Add(file);
            DataObject data = new DataObject();
            data.SetFileDropList(files);
            data.SetData("Preferred DropEffect", new MemoryStream(new byte[] { 1, 0, 0, 0 }));
            return data;
        }

        public static void Copy(string file, string expectedHash, long expectedSize)
        {
            // No write/delete sharing while validating and handing the reference to Windows.
            using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (stream.Length != expectedSize || stream.Length <= 0 || stream.Length > MaxBytes) throw new IOException("Export changed");
                using (SHA256 sha = SHA256.Create())
                {
                    string hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                    if (hash != expectedHash) throw new IOException("Export changed");
                }
                Clipboard.SetDataObject(CreateDataObject(file), true, 0, 0);
            }
        }
    }
}
