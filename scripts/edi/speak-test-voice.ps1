# Test-process support only: speaks a text file into a 48 kHz mono WAV with the Windows
# speech synthesizer, preferring a pt-BR voice. Used by visual-ediaula.mts for synthetic media.
param(
  [Parameter(Mandatory = $true)][string]$OutPath,
  [Parameter(Mandatory = $true)][string]$TextPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synthesizer.GetInstalledVoices() |
    Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pt-BR' } |
    Select-Object -First 1
  if ($voice) { $synthesizer.SelectVoice($voice.VoiceInfo.Name) }
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    48000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
  )
  $synthesizer.SetOutputToWaveFile($OutPath, $format)
  $synthesizer.Speak([System.IO.File]::ReadAllText($TextPath, [System.Text.Encoding]::UTF8))
} finally {
  $synthesizer.Dispose()
}
