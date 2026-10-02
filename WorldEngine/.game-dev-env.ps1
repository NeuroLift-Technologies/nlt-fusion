# Game Development Studio Environment Setup
# Add to your PowerShell profile or run before using game-dev

# Set Blender path if default install location exists
$blenderPath = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
if (Test-Path $blenderPath) {
    $env:BLENDER_PATH = $blenderPath
}

# Set Tripo API key (update with your actual key)
# $env:TRIPO_API_KEY = 'your-tripo-api-key-here'

# Create alias for game-dev CLI
function game-dev { & 'C:\Program Files\nodejs\node.exe' 'C:\Users\joshd\game-development-studio\dist\cli.js' @args }
