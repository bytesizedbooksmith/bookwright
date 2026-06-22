import { run } from "./pipeline/exec.ts";

/**
 * Open a native folder-picker dialog on the user's machine and return the chosen
 * path (or null if cancelled). Works because the server runs locally — the dialog
 * appears on the same desktop as the browser.
 *
 * Windows uses a PowerShell FolderBrowserDialog. The script is passed as a
 * base64 (UTF-16LE) -EncodedCommand to avoid any quoting issues.
 */
export async function pickFolder(initialPath?: string): Promise<string | null> {
  if (process.platform !== "win32") {
    throw new Error("The folder picker is only available on Windows. Paste the folder path instead.");
  }

  const selected = (initialPath ?? "").replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.Show()
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = "Select your book folder"
$dlg.ShowNewFolderButton = $true
$dlg.SelectedPath = '${selected}'
$result = $dlg.ShowDialog($owner)
$owner.Close()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dlg.SelectedPath) }
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const r = await run("powershell.exe", ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]);
  const out = r.stdout.trim();
  return out || null;
}
