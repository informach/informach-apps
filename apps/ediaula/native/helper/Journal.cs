using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Security.AccessControl;
using System.Text;
using System.Threading;

namespace EdiAula.Helper
{
    /// <summary>
    /// cursor.jsonl on its own thread: lines reach the file every 200 ms and the disk every 5 s.
    /// A slow disk only delays this thread, never the hook or the heartbeat.
    /// </summary>
    internal sealed class Journal
    {
        private const int MaxPending = 1 << 20;
        private readonly ConcurrentQueue<string> lines = new ConcurrentQueue<string>();
        private readonly AutoResetEvent signal = new AutoResetEvent(false);
        private readonly FileStream file;
        private readonly StreamWriter writer;
        private readonly Action<string> report;
        private readonly Thread thread;
        private volatile bool finishing;
        private volatile bool failed;
        private int pending;
        private long dropped;

        private Journal(FileStream file, Action<string> report)
        {
            this.file = file;
            this.report = report;
            writer = new StreamWriter(file, new UTF8Encoding(false), 65536);
            writer.NewLine = "\n";
            thread = new Thread(Loop);
            thread.Name = "journal";
            thread.IsBackground = true;
            thread.Start();
        }

        /// <summary>
        /// Appends to the file of a previous instance after a restart. Writing is shared, because
        /// that instance may still be closing.
        /// </summary>
        public static Journal Open(string directory, Action<string> report)
        {
            Directory.CreateDirectory(directory);
            string path = Path.Combine(directory, "cursor.jsonl");
            bool brokenLine = false;
            if (File.Exists(path))
            {
                using (FileStream existing = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (existing.Length > 0)
                    {
                        existing.Seek(-1, SeekOrigin.End);
                        brokenLine = existing.ReadByte() != '\n';
                    }
                }
            }
            // AppendData alone makes Windows put every write at the current end of the file, even
            // when another process appended in between (plain Write keeps a position of its own).
            FileStream file = new FileStream(path, FileMode.Append, FileSystemRights.AppendData,
                FileShare.ReadWrite | FileShare.Delete, 4096, FileOptions.None);
            // A killed instance may have left half a line; ours start on lines of their own.
            if (brokenLine) file.WriteByte((byte)'\n');
            return new Journal(file, report);
        }

        public int Pending
        {
            get { return Volatile.Read(ref pending); }
        }

        public long Dropped
        {
            get { return Interlocked.Read(ref dropped); }
        }

        public void Enqueue(string line)
        {
            if (failed) return;
            if (Interlocked.Increment(ref pending) > MaxPending)
            {
                Interlocked.Decrement(ref pending);
                Interlocked.Increment(ref dropped);
                return;
            }
            lines.Enqueue(line);
            signal.Set();
        }

        public void Finish(int timeout)
        {
            finishing = true;
            signal.Set();
            thread.Join(timeout);
        }

        private void Loop()
        {
            long tick = Stopwatch.Frequency / 1000;
            long nextFlush = Stopwatch.GetTimestamp() + 200 * tick;
            long nextSync = Stopwatch.GetTimestamp() + 5000 * tick;
            try
            {
                for (;;)
                {
                    signal.WaitOne(200);
                    string line;
                    while (lines.TryDequeue(out line))
                    {
                        Interlocked.Decrement(ref pending);
                        writer.WriteLine(line);
                    }
                    long now = Stopwatch.GetTimestamp();
                    if (now >= nextFlush)
                    {
                        nextFlush = now + 200 * tick;
                        writer.Flush();
                    }
                    if (now >= nextSync)
                    {
                        nextSync = now + 5000 * tick;
                        file.Flush(true);
                    }
                    if (finishing && Volatile.Read(ref pending) == 0) break;
                }
                writer.Flush();
                file.Flush(true);
                writer.Dispose();
            }
            catch (IOException error)
            {
                // Disk full or gone: stdout still carries every event; say so once and stop writing.
                failed = true;
                report(HookMode.ErrorLine("journal", error.Message));
            }
        }
    }
}
