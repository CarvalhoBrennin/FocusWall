Option Explicit

Dim shell, fso, projectDir, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd /c """ & projectDir & "\abrir-dashboard.bat"""

shell.CurrentDirectory = projectDir
shell.Run command, 0, False
