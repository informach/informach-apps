using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;
using Informach.Edi.Native;

namespace EdiAula.Helper
{
    /// <summary>
    /// Which key presses may appear on screen. Privacy first: only shortcuts and keys that do not
    /// write text. Typing must never leak, including the ways Windows types characters through
    /// modifiers: AltGr (Right Alt, or Ctrl+Alt on layouts that have it) and Alt with the numeric
    /// keypad. Space and Backspace without a modifier are left out: from inside the hook there is
    /// no reliable way to tell whether the focus is a text field.
    /// </summary>
    internal static class KeyRule
    {
        public const int Ctrl = 1;
        public const int Alt = 2;
        public const int Shift = 4;
        public const int Win = 8;

        /// <param name="mods">Ctrl, Alt, Shift and Win flags held with the key.</param>
        /// <param name="extended">The key came with the extended flag (navigation block, not keypad).</param>
        /// <param name="rightAlt">Right Alt is held.</param>
        /// <param name="altGrLayout">The foreground keyboard layout types characters with AltGr.</param>
        /// <param name="printable">With the modifiers held, the layout turns the key into a printable character.</param>
        public static bool ShouldLog(int vk, int mods, bool extended, bool rightAlt, bool altGrLayout, bool printable)
        {
            if (IsModifier(vk)) return false;
            bool ctrl = (mods & Ctrl) != 0, alt = (mods & Alt) != 0, win = (mods & Win) != 0;
            if (rightAlt && altGrLayout) return false;
            if (ctrl && alt && printable) return false;
            if (alt && !ctrl && !win && IsNumpad(vk, extended)) return false;
            if (ctrl || alt || win) return true;
            return vk == 9 || vk == 13 || vk == 27 || (vk >= 33 && vk <= 40) || vk == 46 || (vk >= 112 && vk <= 123);
        }

        /// <summary>
        /// A key that writes text (letters, digits, punctuation, space, Backspace), typed as text:
        /// no shortcut, no Win, or a character made with AltGr or Alt and the numeric keypad. Only
        /// the moment it happened is ever written (TypingGate), never which key.
        /// </summary>
        public static bool IsTyping(int vk, int mods, bool extended, bool rightAlt, bool altGrLayout, bool printable)
        {
            if (IsModifier(vk) || ShouldLog(vk, mods, extended, rightAlt, altGrLayout, printable)) return false;
            bool ctrl = (mods & Ctrl) != 0, alt = (mods & Alt) != 0, win = (mods & Win) != 0;
            if (win) return false;
            bool character = (rightAlt && altGrLayout) || (ctrl && alt && printable) || (alt && !ctrl && IsNumpad(vk, extended));
            if ((ctrl || alt) && !character) return false;
            return vk == 0x08 || vk == 0x20 || (vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5A) ||
                (vk >= 0x60 && vk <= 0x6F) || (vk >= 0xBA && vk <= 0xC0) || (vk >= 0xDB && vk <= 0xDF) || vk == 0xE2;
        }

        public static bool IsModifier(int vk)
        {
            return (vk >= 0x10 && vk <= 0x12) || (vk >= 0xA0 && vk <= 0xA5) || vk == 0x5B || vk == 0x5C;
        }

        /// <summary>Keypad digits and operators, and keypad navigation keys (no extended flag) with Num Lock off.</summary>
        public static bool IsNumpad(int vk, bool extended)
        {
            if (vk >= 0x60 && vk <= 0x6F) return true;
            return !extended && ((vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x0C);
        }

        /// <summary>
        /// Test mode: one case per stdin line, one {"log":...,"typing":...} per stdout line. A case
        /// with "t" (milliseconds) also goes through one TypingGate and answers "emit".
        /// </summary>
        public static int Run()
        {
            LineWriter output = LineWriter.StandardOutput();
            JavaScriptSerializer parser = new JavaScriptSerializer();
            TypingGate gate = new TypingGate();
            using (StreamReader input = LineWriter.StandardInput())
            {
                string line;
                while ((line = input.ReadLine()) != null)
                {
                    if (line.Trim().Length == 0) continue;
                    Dictionary<string, object> c = Json.Parse(parser, line);
                    int vk = Json.Int(c, "vk"), mods = Json.Int(c, "mods");
                    bool extended = Json.Flag(c, "extended"), rightAlt = Json.Flag(c, "rightAlt");
                    bool altGr = Json.Flag(c, "altGrLayout"), printable = Json.Flag(c, "printable");
                    bool log = ShouldLog(vk, mods, extended, rightAlt, altGr, printable);
                    bool typing = IsTyping(vk, mods, extended, rightAlt, altGr, printable);
                    string answer = "{\"log\":" + Json.Bool(log) + ",\"typing\":" + Json.Bool(typing);
                    if (c.ContainsKey("t"))
                        answer += ",\"emit\":" + Json.Bool(typing && gate.Allow(Convert.ToDouble(c["t"], System.Globalization.CultureInfo.InvariantCulture)));
                    output.Write(answer + "}", true);
                }
            }
            return 0;
        }
    }

    /// <summary>
    /// Typing becomes at most one moment every half second: enough for the editor to know a field
    /// was being filled while nobody spoke, too coarse to tell how many keys or their rhythm.
    /// </summary>
    internal sealed class TypingGate
    {
        public const double GapMs = 500;
        private double last = double.NegativeInfinity;

        public bool Allow(double ms)
        {
            if (ms - last < GapMs) return false;
            last = ms;
            return true;
        }
    }
}
