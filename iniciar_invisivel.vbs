Set WshShell = CreateObject("WScript.Shell")
' Caminho relativo para o executável (mesma pasta)
strPath = "bot_final.exe"
' 0 = Hide Window, 1 = Show Window
WshShell.Run strPath, 0
