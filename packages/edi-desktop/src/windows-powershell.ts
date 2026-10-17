/**
 * Windows PowerShell must rebuild its module search path when Node/Electron was
 * launched by PowerShell 7. Inheriting the latter's PSModulePath breaks autoload
 * of inbox commands such as Get-FileHash, Add-Type and ConvertTo-SecureString.
 * https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_psmodulepath#starting-windows-powershell
 */
export function windowsPowerShellEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => key.toUpperCase() !== "PSMODULEPATH"),
  );
}
