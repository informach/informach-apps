using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace Informach.Edi.Native
{
    /// <summary>
    /// Minimal JSON helpers shared by the suite's native helpers: requests are parsed with the
    /// framework serializer, answers and events are written by hand.
    /// </summary>
    internal static class Json
    {
        private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

        public static void Str(StringBuilder b, string value)
        {
            if (value == null)
            {
                b.Append("null");
                return;
            }
            b.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    default:
                        if (c < 0x20 || c == (char)0x2028 || c == (char)0x2029) b.Append("\\u").Append(((int)c).ToString("x4", Invariant));
                        else b.Append(c);
                        break;
                }
            }
            b.Append('"');
        }

        /// <summary>Milliseconds of the shared QueryPerformanceCounter clock, two decimals.</summary>
        public static string Time(double ms)
        {
            return ms.ToString("0.##", Invariant);
        }

        public static string Num(double value)
        {
            return value.ToString("0.####", Invariant);
        }

        public static string Bool(bool value)
        {
            return value ? "true" : "false";
        }

        /// <summary>An integer in invariant digits, whatever the culture of the computer.</summary>
        public static void Integer(StringBuilder b, long value)
        {
            b.Append(value.ToString(Invariant));
        }

        public static void Rect(StringBuilder b, int x, int y, int w, int h)
        {
            b.Append("{\"x\":").Append(x).Append(",\"y\":").Append(y).Append(",\"w\":").Append(w).Append(",\"h\":").Append(h).Append('}');
        }

        public static Dictionary<string, object> Parse(JavaScriptSerializer parser, string line)
        {
            Dictionary<string, object> value = parser.DeserializeObject(line) as Dictionary<string, object>;
            if (value == null) throw new FormatException("Esperava um objeto JSON.");
            return value;
        }

        public static bool Has(Dictionary<string, object> d, string key)
        {
            object v;
            return d.TryGetValue(key, out v) && v != null;
        }

        public static double Number(Dictionary<string, object> d, string key)
        {
            object v;
            if (!d.TryGetValue(key, out v) || !IsNumber(v)) throw new FormatException("Campo numérico ausente: " + key);
            double result = Convert.ToDouble(v, Invariant);
            if (double.IsNaN(result) || double.IsInfinity(result)) throw new FormatException("Número inválido: " + key);
            return result;
        }

        public static int Int(Dictionary<string, object> d, string key)
        {
            double value = Number(d, key);
            if (value != Math.Floor(value) || value < int.MinValue || value > int.MaxValue) throw new FormatException("Inteiro inválido: " + key);
            return (int)value;
        }

        public static string Text(Dictionary<string, object> d, string key)
        {
            object v;
            if (!d.TryGetValue(key, out v) || !(v is string)) throw new FormatException("Texto ausente: " + key);
            return (string)v;
        }

        public static bool Flag(Dictionary<string, object> d, string key)
        {
            object v;
            return d.TryGetValue(key, out v) && v is bool && (bool)v;
        }

        public static Dictionary<string, object> Object(Dictionary<string, object> d, string key)
        {
            object v;
            Dictionary<string, object> value = d.TryGetValue(key, out v) ? v as Dictionary<string, object> : null;
            if (value == null) throw new FormatException("Objeto ausente: " + key);
            return value;
        }

        public static object[] Array(Dictionary<string, object> d, string key)
        {
            object v;
            object[] value = d.TryGetValue(key, out v) ? v as object[] : null;
            if (value == null) throw new FormatException("Lista ausente: " + key);
            return value;
        }

        /// <summary>Window handles travel as decimal strings, as in the guided recording plans.</summary>
        public static IntPtr Handle(Dictionary<string, object> d, string key)
        {
            long value;
            if (!long.TryParse(Text(d, key), NumberStyles.None, Invariant, out value)) throw new FormatException("Janela inválida: " + key);
            return new IntPtr(value);
        }

        public static string HandleText(IntPtr hwnd)
        {
            return hwnd.ToInt64().ToString(Invariant);
        }

        private static bool IsNumber(object v)
        {
            return v is int || v is long || v is decimal || v is double;
        }
    }

    /// <summary>UTF-8 lines without BOM on a raw standard stream; safe to share between threads.</summary>
    internal sealed class LineWriter
    {
        private static readonly Encoding Utf8 = new UTF8Encoding(false);
        private readonly object gate = new object();
        private readonly Stream stream;

        public LineWriter(Stream stream)
        {
            this.stream = stream;
        }

        public static LineWriter StandardOutput()
        {
            return new LineWriter(new BufferedStream(Console.OpenStandardOutput(), 65536));
        }

        public static StreamReader StandardInput()
        {
            return new StreamReader(Console.OpenStandardInput(), Utf8, false, 65536);
        }

        public void Write(string line, bool flush)
        {
            byte[] bytes = Utf8.GetBytes(line + "\n");
            lock (gate)
            {
                stream.Write(bytes, 0, bytes.Length);
                if (flush) stream.Flush();
            }
        }

        public void Flush()
        {
            lock (gate)
            {
                stream.Flush();
            }
        }
    }
}
