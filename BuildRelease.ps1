
function pause() {
    Write-Host "Press any key to continue ..."
    cmd /c pause | out-null
}


function MsBuild([string] $srcDir, [string] $solutionFileName) {
    $msBuild = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe"
    cd $srcDir

    # create the build command and invoke it 
    # note that if you want to debug, remove the "/noconsolelogger" 
    # from the $options string
    # $options = "/noconsolelogger /p:Configuration=Release 
    $options = "/p:Configuration=Release /verbosity:normal"

    $clean = $msbuild + " `"$solutionFileName`" " + $options + " /t:Clean"
    $build = $msbuild + " `"$solutionFileName`" " + $options + " /t:reBuild"
    Write-Host "Cleaning $solutionFileName..."
    $x = Invoke-Expression $clean

    Write-Host "Building $solutionFileName..."
    $output = Invoke-Expression $build    

    if (($output | Select-string "Build succeeded" ) -ne $null) {
        Write-Host "Build succeeded - $solutionFileName"
    } else {
        $output | out-string
        Write-Host "Build failed - $solutionFileName"
        pause
    }    
}

$srcDir = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
$scriptPath = Split-Path $MyInvocation.InvocationName

$tempDir = "$srcDir\_temp"

# erase the tempDir if it exists
if (test-path $tempDir) {
    remove-item $tempDir -recurse -force
}

MsBuild $srcDir "Breeze.Build.sln"


Write-Host "Updating nuget packages ..."
foreach ($solution in dir -Path .\Samples -Filter "*.sln" -Recurse) {

    Write-Host "Updating nuget for: " + $solution
    $solutionDir = [IO.Path]::GetDirectoryName($solution.FullName)
    $packages = [IO.Path]::Combine($solutionDir, "packages")

    # Restore packages
    foreach ($pkg in dir -Path $solutionDir -Filter "packages.config" -Recurse)  {
        nuget install $pkg.FullName -OutputDirectory $packages
    }

    # Update packages
    nuget update $solution.FullName -Id Breeze.WebApi

    # Delete packages folder. It will be restored on next build
    if (Test-Path -Path $packages) {
        del $packages -Recurse
    }
} 

& "$srcDir\buildApi.ps1"

MsBuild "$srcDir\Samples\DocCode" "DocCode.sln"
MsBuild "$srcDir\Samples\Todo" "ToDo.sln"
MsBuild "$srcDir\Samples\Todo-Angular" "ToDo-Angular.sln"
MsBuild "$srcDir\Samples\Todo-AngularWithDI" "ToDo-AngularWithDI.sln"
MsBuild "$srcDir\Samples\Todo-Require" "ToDo-Require.sln"
MsBuild "$srcDir\Samples\NoDb" "NoDb.sln"
MsBuild "$srcDir\Samples\CarBones" "CarBones.sln"
MsBuild "$srcDir\Samples\Edmunds" "Edmunds.sln"
