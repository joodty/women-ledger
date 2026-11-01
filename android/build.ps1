param(
  [string]$SdkRoot = $(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif (Test-Path "$env:LOCALAPPDATA\Android\Sdk") { "$env:LOCALAPPDATA\Android\Sdk" } else { "$env:USERPROFILE\.cache\women-android-sdk" }),
  [string]$JavaHome = $env:JAVA_HOME
)
$ErrorActionPreference = 'Stop'
if (!$JavaHome) {
  $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
  if (!$javac) { throw 'Set JAVA_HOME to a JDK 11 installation, or pass -JavaHome.' }
  $JavaHome = Split-Path -Parent (Split-Path -Parent $javac.Source)
}
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$build = Join-Path $project 'build'
$tools = Join-Path $SdkRoot 'build-tools\33.0.2'
$platform = Join-Path $SdkRoot 'platforms\android-33\android.jar'
$keystore = Join-Path $env:LOCALAPPDATA 'women-ledger\debug.keystore'
$env:JAVA_HOME = $JavaHome
$env:PATH = (Join-Path $JavaHome 'bin') + ';' + $env:PATH
function Run([string]$program, [string[]]$arguments) {
  & $program @arguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $program ($LASTEXITCODE)" }
}
if (!(Test-Path $platform) -or !(Test-Path (Join-Path $tools 'aapt.exe'))) { throw 'Install Android SDK platform 33 and build-tools 33.0.2 first.' }
New-Item -ItemType Directory -Force -Path $build,(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Split-Path -Parent $keystore) | Out-Null
if (!(Test-Path $keystore)) {
  Run (Join-Path $JavaHome 'bin\keytool.exe') @('-genkeypair','-keystore',$keystore,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Women Ledger Debug,O=Local Development,C=CN')
}
$unsigned=Join-Path $build 'unsigned.apk'
$aligned=Join-Path $build 'aligned.apk'
$apk=Join-Path $build 'women-ledger-debug.apk'
Run (Join-Path $tools 'aapt.exe') @('package','-f','-M',(Join-Path $project 'AndroidManifest.xml'),'-S',(Join-Path $project 'res'),'-I',$platform,'-F',$unsigned)
$sourceFiles = @(Get-ChildItem -LiteralPath (Join-Path $project 'src') -Filter '*.java' -Recurse | ForEach-Object { $_.FullName })
Run (Join-Path $JavaHome 'bin\javac.exe') (@('-encoding','UTF-8','-source','8','-target','8','-classpath',$platform,'-d',(Join-Path $build 'classes')) + $sourceFiles)
$classFiles = @(Get-ChildItem -LiteralPath (Join-Path $build 'classes') -Filter '*.class' -Recurse | ForEach-Object { $_.FullName })
Run (Join-Path $JavaHome 'bin\java.exe') (@('-cp',(Join-Path $tools 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',$platform,'--output',(Join-Path $build 'dex')) + $classFiles)
Push-Location (Join-Path $build 'dex')
try { Run (Join-Path $JavaHome 'bin\jar.exe') @('uf',$unsigned,'classes.dex') } finally { Pop-Location }
Run (Join-Path $tools 'zipalign.exe') @('-f','4',$unsigned,$aligned)
Run (Join-Path $tools 'apksigner.bat') @('sign','--ks',$keystore,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,$aligned)
Run (Join-Path $tools 'apksigner.bat') @('verify','--verbose',$apk)
Write-Output "APK: $apk"
