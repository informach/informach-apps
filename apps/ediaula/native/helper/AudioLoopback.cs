using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Informach.Edi.Native;

namespace EdiAula.Helper
{
    /// <summary>
    /// The loopback mode: the computer's sound without the sound of a whole process tree (the
    /// EdiAula app and every process it started), through WASAPI process loopback on the virtual
    /// device "VAD\Process_Loopback" (Windows 10 2004 and newer). The sound goes to a WAV file
    /// flushed every second; its header says "until the end of the file" while recording, so a
    /// part cut short by a crash still reads, and holds the real sizes after a clean stop. The
    /// file follows the QueryPerformanceCounter clock: a gap in the packets becomes silence and an
    /// overlap is dropped, so sample n is n / 48 kHz after the "first" line even when nothing
    /// plays. Lines on stdout:
    ///   {"e":"aready","t":..,"pid":..,"v":"..","rate":48000,"ch":2}
    ///   {"e":"afirst","t":..}                  moment of the file's first sample
    ///   {"e":"ahb","t":..,"n":..,"fill":..,"drop":..}   every 500 ms: frames written, silence filled and dropped
    ///   {"e":"aend","t":..,"n":..}             end of the last sample, after stdin closed
    ///   {"e":"aerror","t":..,"msg":".."}       the capture stopped (the process then exits 1)
    /// It stops when stdin closes. `--probe` only activates the capture and exits 0 when it works.
    /// </summary>
    internal static class AudioLoopback
    {
        private const int Rate = 48000;
        private const int Channels = 2;
        private const int BlockAlign = Channels * 2;
        /// <summary>Drift between the packets and the file's clock corrected beyond this.</summary>
        private const double ToleranceMs = 20;
        /// <summary>Without a packet this long, the file is filled with silence up to IdleLagMs ago.</summary>
        private const double IdleAfterMs = 250;
        private const double IdleLagMs = 150;
        private const long BufferHns = 2000000;
        private const string Device = "VAD\\Process_Loopback";

        public static int Run(Options options)
        {
            if (options.ExcludePid == 0 && !options.Probe)
            {
                Console.Error.WriteLine("ediaula-helper: informe --exclude-pid <pid>.");
                return 2;
            }
            if (!options.Probe && string.IsNullOrEmpty(options.Out))
            {
                Console.Error.WriteLine("ediaula-helper: informe --out <arquivo.wav>.");
                return 2;
            }
            LineWriter output = LineWriter.StandardOutput();
            IAudioClient client;
            try
            {
                client = Activate(options.ExcludePid != 0 ? options.ExcludePid : (uint)System.Diagnostics.Process.GetCurrentProcess().Id);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("ediaula-helper: " + error.Message);
                if (!options.Probe) Line(output, "aerror", error.Message);
                return 1;
            }
            if (options.Probe)
            {
                Marshal.ReleaseComObject(client);
                output.Write("{\"e\":\"aprobe\",\"ok\":true}", true);
                return 0;
            }
            try
            {
                return Capture(client, options, output);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("ediaula-helper: " + error);
                Line(output, "aerror", error.Message);
                return 1;
            }
            finally
            {
                Marshal.ReleaseComObject(client);
            }
        }

        /// <summary>
        /// Writes one line; false once the app stopped reading (it closed or crashed): the capture
        /// then ends cleanly, so the file keeps its real header.
        /// </summary>
        private static bool Emit(LineWriter output, string line)
        {
            try
            {
                output.Write(line, true);
                return true;
            }
            catch (IOException)
            {
                return false;
            }
        }

        private static void Line(LineWriter output, string e, string message)
        {
            StringBuilder b = new StringBuilder(256);
            b.Append("{\"e\":\"").Append(e).Append("\",\"t\":").Append(Json.Time(Program.Now())).Append(",\"msg\":");
            Json.Str(b, message);
            b.Append('}');
            Emit(output, b.ToString());
        }

        /// <summary>An audio client initialized for the loopback of everything but the process tree of `pid`.</summary>
        private static IAudioClient Activate(uint pid)
        {
            // AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType; { TargetProcessId; ProcessLoopbackMode } }
            IntPtr parameters = Marshal.AllocHGlobal(12);
            IntPtr variant = Marshal.AllocHGlobal(24);
            IntPtr format = Marshal.AllocHGlobal(18);
            try
            {
                Marshal.WriteInt32(parameters, 0, AudioNative.AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK);
                Marshal.WriteInt32(parameters, 4, unchecked((int)pid));
                Marshal.WriteInt32(parameters, 8, AudioNative.PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE);
                // PROPVARIANT holding a BLOB: vt, three reserved words, then { cbSize, pBlobData }.
                for (int i = 0; i < 24; i += 4) Marshal.WriteInt32(variant, i, 0);
                Marshal.WriteInt16(variant, 0, AudioNative.VT_BLOB);
                Marshal.WriteInt32(variant, 8, 12);
                Marshal.WriteIntPtr(variant, 16, parameters);

                Completion completion = new Completion();
                IActivateAudioInterfaceAsyncOperation operation;
                Guid iid = typeof(IAudioClient).GUID;
                int hr = AudioNative.ActivateAudioInterfaceAsync(Device, ref iid, variant, completion, out operation);
                if (hr != 0) throw new InvalidOperationException("O Windows não oferece a captura do som sem o app (" + Hex(hr) + "). Ela pede o Windows 10 versão 2004 ou mais novo.");
                if (!completion.Done.WaitOne(5000)) throw new InvalidOperationException("O Windows não respondeu ao pedido de captura do som.");
                int result;
                object activated;
                operation.GetActivateResult(out result, out activated);
                Marshal.ReleaseComObject(operation);
                if (result != 0 || activated == null) throw new InvalidOperationException("O Windows recusou a captura do som sem o app (" + Hex(result) + ").");
                IAudioClient client = (IAudioClient)activated;

                // WAVEFORMATEX: PCM, 2 channels, 48 kHz, 16 bits.
                Marshal.WriteInt16(format, 0, 1);
                Marshal.WriteInt16(format, 2, Channels);
                Marshal.WriteInt32(format, 4, Rate);
                Marshal.WriteInt32(format, 8, Rate * BlockAlign);
                Marshal.WriteInt16(format, 12, BlockAlign);
                Marshal.WriteInt16(format, 14, 16);
                Marshal.WriteInt16(format, 16, 0);
                uint flags = AudioNative.AUDCLNT_STREAMFLAGS_LOOPBACK | AudioNative.AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AudioNative.AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AudioNative.AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
                hr = client.Initialize(0, flags, BufferHns, 0, format, IntPtr.Zero);
                if (hr != 0)
                {
                    Marshal.ReleaseComObject(client);
                    throw new InvalidOperationException("A captura do som não abriu (" + Hex(hr) + ").");
                }
                return client;
            }
            finally
            {
                Marshal.FreeHGlobal(format);
                Marshal.FreeHGlobal(variant);
                Marshal.FreeHGlobal(parameters);
            }
        }

        private static string Hex(int hr)
        {
            return "0x" + hr.ToString("X8");
        }

        private static int Capture(IAudioClient client, Options options, LineWriter output)
        {
            AutoResetEvent signal = new AutoResetEvent(false);
            ManualResetEvent closed = new ManualResetEvent(false);
            int hr = client.SetEventHandle(signal.SafeWaitHandle.DangerousGetHandle());
            if (hr != 0) throw new InvalidOperationException("A captura do som não aceitou o aviso de pacotes (" + Hex(hr) + ").");
            object service;
            Guid iid = typeof(IAudioCaptureClient).GUID;
            hr = client.GetService(ref iid, out service);
            if (hr != 0) throw new InvalidOperationException("A captura do som não abriu o leitor (" + Hex(hr) + ").");
            IAudioCaptureClient capture = (IAudioCaptureClient)service;

            Thread stdin = new Thread(delegate()
            {
                try
                {
                    Stream input = Console.OpenStandardInput();
                    byte[] sink = new byte[256];
                    while (input.Read(sink, 0, sink.Length) > 0) { }
                }
                catch (IOException) { }
                closed.Set();
            });
            stdin.IsBackground = true;
            stdin.Name = "stdin";
            stdin.Start();

            WavWriter wav = new WavWriter(options.Out, Rate, Channels);
            try
            {
                hr = client.Start();
                if (hr != 0) throw new InvalidOperationException("A captura do som não começou (" + Hex(hr) + ").");
                double origin = Program.Now();
                StringBuilder b = new StringBuilder(160);
                b.Append("{\"e\":\"aready\",\"t\":").Append(Json.Time(origin)).Append(",\"pid\":").Append(System.Diagnostics.Process.GetCurrentProcess().Id);
                b.Append(",\"v\":");
                Json.Str(b, Program.Version);
                b.Append(",\"rate\":").Append(Rate).Append(",\"ch\":").Append(Channels).Append('}');
                Emit(output, b.ToString());
                Emit(output, "{\"e\":\"afirst\",\"t\":" + Json.Time(origin) + "}");

                long written = 0;
                long filled = 0;
                long dropped = 0;
                double lastPacket = origin;
                double lastFlush = origin;
                double lastBeat = origin;
                WaitHandle[] handles = new WaitHandle[] { signal, closed };
                bool stopping = false;
                double stopAt = 0;
                while (true)
                {
                    int which = WaitHandle.WaitAny(handles, 100);
                    if (which == 1 && !stopping)
                    {
                        stopping = true;
                        stopAt = Program.Now();
                    }
                    // Every packet waiting, placed by its timestamp on the file's clock.
                    while (true)
                    {
                        uint size;
                        hr = capture.GetNextPacketSize(out size);
                        if (hr != 0) throw new InvalidOperationException("A captura do som parou (" + Hex(hr) + ").");
                        if (size == 0) break;
                        IntPtr data;
                        uint frames;
                        uint flags;
                        ulong devicePosition;
                        ulong qpcPosition;
                        hr = capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition);
                        if (hr != 0) throw new InvalidOperationException("A captura do som parou (" + Hex(hr) + ").");
                        double now = Program.Now();
                        double at = qpcPosition / 10000.0;
                        // No usable timestamp: the packet ends about now.
                        if (qpcPosition == 0 || (flags & AudioNative.AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR) != 0 || Math.Abs(at - now) > 2000)
                            at = now - frames * 1000.0 / Rate;
                        double expected = origin + written * 1000.0 / Rate;
                        double delta = at - expected;
                        long skip = 0;
                        if (delta > ToleranceMs)
                        {
                            long gap = (long)Math.Round(delta * Rate / 1000.0);
                            wav.Silence(gap);
                            written += gap;
                            filled += gap;
                        }
                        else if (delta < -ToleranceMs)
                            skip = Math.Min(frames, (long)Math.Round(-delta * Rate / 1000.0));
                        long keep = frames - skip;
                        if (keep > 0)
                        {
                            if ((flags & AudioNative.AUDCLNT_BUFFERFLAGS_SILENT) != 0) wav.Silence(keep);
                            else wav.Write(data, (int)(skip * BlockAlign), (int)(keep * BlockAlign));
                            written += keep;
                        }
                        dropped += skip;
                        hr = capture.ReleaseBuffer(frames);
                        if (hr != 0) throw new InvalidOperationException("A captura do som parou (" + Hex(hr) + ").");
                        lastPacket = now;
                    }
                    double clock = Program.Now();
                    // Nothing plays and Windows sends nothing: the file keeps up with the wall clock.
                    double behind = stopping ? stopAt : clock - IdleLagMs;
                    if ((stopping || clock - lastPacket > IdleAfterMs))
                    {
                        long missing = (long)Math.Floor((behind - origin) * Rate / 1000.0) - written;
                        if (missing > 0)
                        {
                            wav.Silence(missing);
                            written += missing;
                            filled += missing;
                        }
                    }
                    if (stopping) break;
                    if (clock - lastFlush >= 1000)
                    {
                        wav.Flush();
                        lastFlush = clock;
                    }
                    if (clock - lastBeat >= 500)
                    {
                        lastBeat = clock;
                        if (!Emit(output, "{\"e\":\"ahb\",\"t\":" + Json.Time(clock) + ",\"n\":" + written + ",\"fill\":" + filled + ",\"drop\":" + dropped + "}")) closed.Set();
                    }
                }
                client.Stop();
                wav.Close();
                double end = origin + written * 1000.0 / Rate;
                Emit(output, "{\"e\":\"aend\",\"t\":" + Json.Time(end) + ",\"n\":" + written + "}");
                return 0;
            }
            finally
            {
                wav.Dispose();
                Marshal.ReleaseComObject(capture);
            }
        }

        /// <summary>The completion handler must be agile: Windows calls it on one of its own threads.</summary>
        [ComVisible(true)]
        [ClassInterface(ClassInterfaceType.None)]
        private sealed class Completion : IActivateAudioInterfaceCompletionHandler, IAgileObject
        {
            public readonly ManualResetEvent Done = new ManualResetEvent(false);

            public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
            {
                Done.Set();
            }
        }
    }

    /// <summary>
    /// 16-bit PCM WAV written as it comes. Until it is closed, the RIFF and data sizes say
    /// 0xFFFFFFFF (FFmpeg then reads to the end of the file); closing writes the real ones.
    /// </summary>
    internal sealed class WavWriter : IDisposable
    {
        private readonly FileStream file;
        private readonly byte[] zeros = new byte[48000];
        private readonly int blockAlign;
        private long bytes;
        private bool closed;

        public WavWriter(string path, int rate, int channels)
        {
            blockAlign = channels * 2;
            file = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read, 1 << 16);
            byte[] header = new byte[44];
            Ascii(header, 0, "RIFF");
            Int(header, 4, uint.MaxValue);
            Ascii(header, 8, "WAVE");
            Ascii(header, 12, "fmt ");
            Int(header, 16, 16);
            Short(header, 20, 1);
            Short(header, 22, (ushort)channels);
            Int(header, 24, (uint)rate);
            Int(header, 28, (uint)(rate * blockAlign));
            Short(header, 32, (ushort)blockAlign);
            Short(header, 34, 16);
            Ascii(header, 36, "data");
            Int(header, 40, uint.MaxValue);
            file.Write(header, 0, header.Length);
            file.Flush(true);
        }

        public void Write(IntPtr data, int offset, int count)
        {
            byte[] buffer = new byte[count];
            Marshal.Copy(new IntPtr(data.ToInt64() + offset), buffer, 0, count);
            file.Write(buffer, 0, count);
            bytes += count;
        }

        public void Silence(long frames)
        {
            long left = frames * blockAlign;
            while (left > 0)
            {
                int n = (int)Math.Min(left, zeros.Length);
                file.Write(zeros, 0, n);
                left -= n;
            }
            bytes += frames * blockAlign;
        }

        /// <summary>Hands what was written to the system, so a crash of this process keeps it.</summary>
        public void Flush()
        {
            file.Flush(false);
        }

        public void Close()
        {
            if (closed) return;
            closed = true;
            // A file past 4 GB keeps the open-ended sizes, which FFmpeg reads the same way.
            if (bytes + 36 <= uint.MaxValue)
            {
                byte[] size = new byte[4];
                file.Flush(false);
                file.Seek(4, SeekOrigin.Begin);
                Int(size, 0, (uint)(bytes + 36));
                file.Write(size, 0, 4);
                file.Seek(40, SeekOrigin.Begin);
                Int(size, 0, (uint)bytes);
                file.Write(size, 0, 4);
            }
            file.Flush(true);
            file.Dispose();
        }

        public void Dispose()
        {
            if (!closed)
            {
                closed = true;
                file.Dispose();
            }
        }

        private static void Ascii(byte[] b, int at, string text)
        {
            for (int i = 0; i < text.Length; i++) b[at + i] = (byte)text[i];
        }

        private static void Int(byte[] b, int at, uint value)
        {
            b[at] = (byte)value;
            b[at + 1] = (byte)(value >> 8);
            b[at + 2] = (byte)(value >> 16);
            b[at + 3] = (byte)(value >> 24);
        }

        private static void Short(byte[] b, int at, ushort value)
        {
            b[at] = (byte)value;
            b[at + 1] = (byte)(value >> 8);
        }
    }

    internal static class AudioNative
    {
        public const short VT_BLOB = 65;
        public const int AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1;
        public const int PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1;
        public const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
        public const uint AUDCLNT_STREAMFLAGS_EVENTCALLBACK = 0x00040000;
        public const uint AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY = 0x08000000;
        public const uint AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM = 0x80000000;
        public const uint AUDCLNT_BUFFERFLAGS_SILENT = 0x2;
        public const uint AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR = 0x4;

        [DllImport("Mmdevapi.dll", ExactSpelling = true)]
        public static extern int ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            ref Guid riid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation activationOperation);
    }

    [ComImport]
    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport]
    [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    [ComImport]
    [Guid("41D949AB-9862-444A-80F6-C261334DA5EB")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport]
    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    /// <summary>Marks the completion handler as callable from any thread (no marshaling).</summary>
    [ComImport]
    [Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAgileObject
    {
    }
}
