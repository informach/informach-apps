!macro customInit
  ; A fixed per-user destination is also used by the verified Hub inventory.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Edi\${APP_PRODUCT_FILENAME}"
!macroend

!macro customCheckAppRunning
  ; Never terminate an editor or an in-flight job, including in silent installs.
  ; The updater starts NSIS as Electron quits. Wait for the real process-exit
  ; condition in that handoff only; a manually started installer never kills it.
  StrCpy $R1 0
  ${Do}
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $0
    ${If} $0 == 603
      ${Break}
    ${EndIf}
    ${IfNot} ${isUpdated}
      ${Break}
    ${EndIf}
    ${If} $R1 >= 150
      ${Break}
    ${EndIf}
    IntOp $R1 $R1 + 1
    Sleep 200
  ${Loop}
  ${If} $0 != 603
    SetErrorLevel 32
    Abort "Feche a ferramenta antes de atualizar. Trabalhos abertos foram preservados."
  ${EndIf}
!macroend
