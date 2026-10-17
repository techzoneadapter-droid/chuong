$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'D:\Android\Sdk' }
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 17 before running this script.' }
$outputRoot = '.cache\reader-touch'
Push-Location -LiteralPath $projectRoot
try {
New-Item -ItemType Directory -Force (Join-Path $outputRoot 'classes'),(Join-Path $outputRoot 'dex') | Out-Null
& (Join-Path $env:JAVA_HOME 'bin\javac.exe') -source 8 -target 8 -classpath (Join-Path $sdkRoot 'platforms\android-36\android.jar') -d (Join-Path $outputRoot 'classes') 'tests\android\ReaderTouch.java'
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
& (Join-Path $sdkRoot 'build-tools\36.0.0\d8.bat') --min-api 28 --lib (Join-Path $sdkRoot 'platforms\android-36\android.jar') --output (Join-Path $outputRoot 'dex') (Join-Path $outputRoot 'classes\ReaderTouch.class')
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }
& (Join-Path $env:JAVA_HOME 'bin\jar.exe') cf (Join-Path $outputRoot 'reader-touch.jar') -C (Join-Path $outputRoot 'dex') classes.dex
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }
& (Join-Path $sdkRoot 'platform-tools\adb.exe') push (Join-Path $outputRoot 'reader-touch.jar') /data/local/tmp/chuong-reader-touch.jar
if ($LASTEXITCODE -ne 0) { throw 'ADB push failed' }
} finally { Pop-Location }
