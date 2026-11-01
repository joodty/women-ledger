param([string]$SdkRoot=$(if($env:ANDROID_SDK_ROOT){$env:ANDROID_SDK_ROOT}elseif($env:ANDROID_HOME){$env:ANDROID_HOME}elseif(Test-Path "$env:LOCALAPPDATA\Android\Sdk"){"$env:LOCALAPPDATA\Android\Sdk"}else{"$env:USERPROFILE\.cache\women-android-sdk"}),[string]$JavaHome=$env:JAVA_HOME)
if(!$JavaHome){$javac=Get-Command javac.exe -ErrorAction SilentlyContinue;if(!$javac){throw 'Set JAVA_HOME to a JDK 11 installation, or pass -JavaHome.'};$JavaHome=Split-Path -Parent (Split-Path -Parent $javac.Source)}
$ErrorActionPreference='Stop';$test=Split-Path -Parent $MyInvocation.MyCommand.Path;$android=Split-Path -Parent $test;$out=Join-Path $android 'build\instrumentation';$tools=Join-Path $SdkRoot 'build-tools\33.0.2';$platform=Join-Path $SdkRoot 'platforms\android-33\android.jar';$key=Join-Path $env:LOCALAPPDATA 'women-ledger\debug.keystore';$env:JAVA_HOME=$JavaHome;$env:PATH=(Join-Path $JavaHome 'bin')+';'+$env:PATH
function Run([string]$program,[string[]]$arguments){& $program @arguments;if($LASTEXITCODE -ne 0){throw "Command failed: $program"}}
New-Item -ItemType Directory -Force -Path $out,(Join-Path $out 'classes'),(Join-Path $out 'dex') | Out-Null
$unsigned=Join-Path $out 'unsigned.apk';$aligned=Join-Path $out 'aligned.apk';$apk=Join-Path $out 'reminder-test.apk'
Run (Join-Path $tools 'aapt.exe') @('package','-f','-M',(Join-Path $test 'AndroidManifest.xml'),'-I',$platform,'-F',$unsigned)
Run (Join-Path $JavaHome 'bin\javac.exe') @('-encoding','UTF-8','-source','8','-target','8','-classpath',($platform+';'+(Join-Path $android 'build\classes')),'-d',(Join-Path $out 'classes'),(Join-Path $test 'src\cn\yidiangames\women\tests\ReminderInstrumentation.java'))
$classes=@(Get-ChildItem -LiteralPath (Join-Path $out 'classes') -Filter '*.class' -Recurse | ForEach-Object {$_.FullName})
Run (Join-Path $JavaHome 'bin\java.exe') (@('-cp',(Join-Path $tools 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',$platform,'--output',(Join-Path $out 'dex'))+$classes)
Push-Location (Join-Path $out 'dex');try{Run (Join-Path $JavaHome 'bin\jar.exe') @('uf',$unsigned,'classes.dex')}finally{Pop-Location}
Run (Join-Path $tools 'zipalign.exe') @('-f','4',$unsigned,$aligned)
Run (Join-Path $tools 'apksigner.bat') @('sign','--ks',$key,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,$aligned)
Write-Output "TEST APK: $apk"
