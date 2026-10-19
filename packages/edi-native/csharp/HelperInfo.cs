using System.Reflection;

namespace Informach.Edi.Native
{
    /// <summary>What every helper of the suite reports about itself.</summary>
    internal static class HelperInfo
    {
        /// <summary>
        /// The version stamped by the build (@informach/edi-native/build): the app's version, or the
        /// suite release being packaged. The installer refuses a helper of another version.
        /// </summary>
        public static string Version
        {
            get
            {
                object[] attributes = typeof(HelperInfo).Assembly.GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false);
                return attributes.Length > 0 ? ((AssemblyInformationalVersionAttribute)attributes[0]).InformationalVersion : "0.0.0";
            }
        }
    }
}
