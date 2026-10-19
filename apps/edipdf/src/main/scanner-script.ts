/** Fixed trusted program. All device IDs and settings arrive as JSON on stdin, never as code. */
export const WIA_SCRIPT = `
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Reply($value) { [Console]::WriteLine(($value | ConvertTo-Json -Compress -Depth 12)) }
function Property($holder, [int]$id) {
  foreach ($property in $holder.Properties) { if ([int]$property.PropertyID -eq $id) { return $property } }
  return $null
}
function Required($holder, [int]$id) {
  $property = Property $holder $id
  if ($null -eq $property) { throw 'UnsupportedProperty' }
  return $property
}
function SetVerified($holder, [int]$id, [int]$value) {
  $property = Required $holder $id
  $property.Value = $value
  if ([int]$property.Value -ne $value) { throw 'UnsupportedValue' }
}
try {
  $request = [Console]::ReadLine() | ConvertFrom-Json
  $manager = New-Object -ComObject WIA.DeviceManager
  if ($manager.DeviceInfos.Count -gt 128) { throw 'DeviceLimit' }
  $devices = @()
  $selected = $null
  foreach ($info in $manager.DeviceInfos) {
    if ([int]$info.Type -ne 1) { continue }
    $name = Required $info 7
    $devices += @{ id = [string]$info.DeviceID; name = [string]$name.Value }
    if ($request.action -ne 'list') {
      $id = if ($request.action -eq 'describe') { $request.deviceId } else { $request.settings.deviceId }
      if ([string]$info.DeviceID -ceq [string]$id) { $selected = $info }
    }
  }
  if ($request.action -eq 'list') { Reply @{ kind='devices'; devices=@($devices) }; exit 0 }
  if ($null -eq $selected) { throw 'DeviceNotFound' }
  $device = $selected.Connect()
  $script:sources = @()
  $script:visited = 0
  function Visit($items, [string]$prefix, [int]$depth) {
    if ($depth -gt 8 -or $items.Count -gt 256) { throw 'ItemLimit' }
    for ($index = 1; $index -le $items.Count; $index++) {
      $script:visited++
      if ($script:visited -gt 256) { throw 'ItemLimit' }
      $item = $items.Item($index)
      $path = if ($prefix) { $prefix + '.' + $index } else { [string]$index }
      $category = Property $item 4125
      if ($null -ne $category) {
        $guid = ([string]$category.Value).Trim('{}').ToLowerInvariant()
        $kind = if ($guid -eq 'fb607b1f-43f3-488b-855b-fb703ec342a6') { 'flatbed' } elseif ($guid -eq 'fe131934-f84c-42ad-8da4-6129cddd7288') { 'feeder' } else { $null }
        if ($null -ne $kind) {
          $name = Required $item 4098
          $handling = Property $item 3088
          $duplex = $false
          if ($null -ne $handling -and [int]$handling.SubType -eq 3) {
            $flags = $handling.SubTypeValues
            for ($flagIndex = 1; $flagIndex -le $flags.Count; $flagIndex++) {
              if (([int]$flags.Item($flagIndex) -band 4) -ne 0) { $duplex = $true }
            }
          }
          $script:sources += @{ public=@{ id=$path; name=[string]$name.Value; kind=$kind; legacy=$false; duplexCapable=$duplex }; item=$item; handling=$item }
        }
      }
      if ($item.Items.Count -gt 0) { Visit $item.Items $path ($depth + 1) }
    }
  }
  Visit $device.Items '' 0
  if ($script:sources.Count -eq 0 -and $device.Items.Count -eq 1) {
    $capability = Property $device 3086
    if ($null -ne $capability) {
      foreach ($mode in @(@{kind='flatbed'; bit=2}, @{kind='feeder'; bit=1})) {
        if (([int]$capability.Value -band $mode.bit) -ne 0) {
          $script:sources += @{ public=@{ id='legacy-' + $mode.kind; name=$mode.kind; kind=$mode.kind; legacy=$true; duplexCapable=(([int]$capability.Value -band 4) -ne 0) }; item=$device.Items.Item(1); handling=$device }
        }
      }
    }
  }
  if ($request.action -eq 'describe') { Reply @{ kind='sources'; sources=@($script:sources | ForEach-Object { $_.public }) }; exit 0 }
  if ($request.action -ne 'acquire') { throw 'InvalidAction' }
  $source = @($script:sources | Where-Object { $_.public.id -ceq $request.settings.sourceId })
  if ($source.Count -ne 1) { throw 'SourceNotFound' }
  $source = $source[0]
  $item = $source.item
  $settings = $request.settings
  # WIA 2 items select their source by category and use FRONT_ONLY, not legacy FEEDER/FLATBED bits.
  $mode = if (-not $source.public.legacy) { 32 } elseif ($source.public.kind -eq 'feeder') { 1 } else { 2 }
  $handling = Property $source.handling 3088
  if ($null -ne $handling) { SetVerified $source.handling 3088 $mode }
  elseif ($source.public.legacy) { throw 'UnsupportedProperty' }
  $intent = if ($settings.color -eq 'color') { 1 } elseif ($settings.color -eq 'gray') { 2 } else { 4 }
  SetVerified $item 6146 $intent
  SetVerified $item 6147 ([int]$settings.dpi)
  SetVerified $item 6148 ([int]$settings.dpi)
  SetVerified $item 6149 0
  SetVerified $item 6150 0
  $width = if ($settings.paper -eq 'letter') { [int][Math]::Round(8.5 * $settings.dpi) } else { [int][Math]::Round(210 * $settings.dpi / 25.4) }
  $height = if ($settings.paper -eq 'letter') { [int][Math]::Round(11 * $settings.dpi) } else { [int][Math]::Round(297 * $settings.dpi / 25.4) }
  if ($width -gt 8192 -or $height -gt 8192 -or $width * $height -gt 24000000) { throw 'PixelLimit' }
  SetVerified $item 6151 $width
  SetVerified $item 6152 $height
  if ([int](Required $item 6147).Value -ne [int]$settings.dpi -or [int](Required $item 6148).Value -ne [int]$settings.dpi -or [int](Required $item 6151).Value -ne $width -or [int](Required $item 6152).Value -ne $height) { throw 'UnsupportedValue' }
  if ($source.public.kind -eq 'feeder') {
    $pages = Property $source.handling 3096
    if ($null -eq $pages) { throw 'UnsupportedProperty' }
    SetVerified $source.handling 3096 1
  }
  $captured = 0
  while ($true) {
    $command = [Console]::ReadLine()
    if ($null -eq $command) { exit 0 }
    if ($command -cne 'next') { throw 'InvalidCommand' }
    if ($captured -ge [int]$settings.maximumPages) { Reply @{ kind='done'; reason='limit' }; exit 0 }
    if ($captured -gt 0 -and $source.public.kind -eq 'flatbed') { Reply @{ kind='done'; reason='flatbed' }; exit 0 }
    try { $image = $item.Transfer('{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}') }
    catch {
      $failure = $_.Exception
      while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
      if ($failure.HResult -eq -2145320957 -and $captured -gt 0 -and $source.public.kind -eq 'feeder') { Reply @{ kind='done'; reason='empty' }; exit 0 }
      throw
    }
    if ($image.FrameCount -ne 1 -or ([string]$image.FormatID).ToUpperInvariant() -ne '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}') { throw 'UnsupportedImage' }
    if ($image.Width -lt 1 -or $image.Height -lt 1 -or $image.Width -gt 8192 -or $image.Height -gt 8192 -or $image.Width * $image.Height -gt 24000000) { throw 'PixelLimit' }
    if ($image.Width -ne $width -or $image.Height -ne $height) { throw 'UnsupportedValue' }
    $binary = [byte[]]$image.FileData.BinaryData
    if ($binary.Length -lt 1 -or $binary.Length -gt 33554432) { throw 'ImageLimit' }
    $captured++
    Reply @{ kind='page'; png=[Convert]::ToBase64String($binary); dpi=[int]$settings.dpi }
    $binary = $null
    $image = $null
  }
} catch {
  $failure = $_.Exception
  while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
  $known = @('UnsupportedProperty','UnsupportedValue','DeviceLimit','ItemLimit','DeviceNotFound','SourceNotFound','InvalidAction','InvalidCommand','PixelLimit','UnsupportedImage','ImageLimit')
  $code = if ($known -contains $failure.Message) { $failure.Message } else { '0x' + $failure.HResult.ToString('X8') }
  Reply @{ kind='error'; code=$code }
  exit 1
}
`;
