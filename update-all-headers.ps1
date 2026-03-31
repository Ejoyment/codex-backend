# PowerShell script to update all page headers with modern glassmorphism design

$modernHeaderHTML = @'
    <!-- Modern Header with Glassmorphism -->
    <style>
        .modern-header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 50;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            background-color: rgba(26, 31, 54, 0.8);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .logo-glow { box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.5); }
        .nav-link { position: relative; transition: all 0.2s ease; }
        .nav-link::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 50%;
            width: 0;
            height: 2px;
            background: linear-gradient(to right, #3b82f6, #8b5cf6);
            transition: all 0.3s ease;
            transform: translateX(-50%);
        }
        .nav-link:hover::after { width: 80%; }
        .cta-button {
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            transition: all 0.3s ease;
        }
        .cta-button:hover {
            box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.5);
            transform: scale(1.05);
        }
    </style>
    
    <header class="modern-header">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-20">
                <a href="index.html" class="flex items-center space-x-3 group">
                    <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300 logo-glow">
                        <img src="1000222021 1 (1).png" alt="BuildrsHQ" class="w-6 h-6">
                    </div>
                    <span class="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">BuildrsHQ</span>
                </a>
                <nav class="hidden lg:flex items-center space-x-1">
                    <a href="features.html" class="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Features</a>
                    <a href="download.html" class="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Download</a>
                    <a href="pricing.html" class="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Pricing</a>
                    <a href="blog.html" class="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Blog</a>
                    <a href="changelog.html" class="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Changelog</a>
                </nav>
                <div class="hidden lg:flex items-center space-x-3">
                    <a href="sign_in.html" class="px-6 py-2.5 rounded-lg text-white hover:bg-white/5 transition-all duration-200 font-medium">Sign In</a>
                    <a href="signup.html" class="cta-button px-6 py-2.5 rounded-lg text-white font-medium">Start Free Trial</a>
                </div>
                <button type="button" id="mobileMenuBtn" class="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors" aria-label="Toggle mobile menu">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                </button>
            </div>
        </div>
        <div id="mobileMenu" class="hidden lg:hidden border-t border-white/10 bg-navy-dark/95 backdrop-blur-lg">
            <div class="max-w-7xl mx-auto px-4 py-4 space-y-2">
                <a href="features.html" class="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Features</a>
                <a href="download.html" class="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Download</a>
                <a href="pricing.html" class="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Pricing</a>
                <a href="blog.html" class="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Blog</a>
                <a href="changelog.html" class="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Changelog</a>
                <div class="pt-4 space-y-2">
                    <a href="sign_in.html" class="block px-4 py-3 rounded-lg text-center text-white hover:bg-white/5 transition-all font-medium">Sign In</a>
                    <a href="signup.html" class="block px-4 py-3 rounded-lg text-center cta-button text-white font-medium">Start Free Trial</a>
                </div>
            </div>
        </div>
    </header>
    <div class="h-20"></div>
'@

$oldHeaderPattern = @'
    <header class="content bg-\[#070F34\] border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-4">
                    <a href="index.html" class="flex items-center space-x-2">
                        <img src="1000222021 1 \(1\).png" alt="Logo" class="w-8 h-8">
                        <span class="text-xl font-semibold">BuildrsHQ</span>
                    </a>
                </div>
                <nav class="hidden md:flex space-x-6">
                    <a href="features.html" class="text-gray-300 hover:text-white">Features</a>
                    <a href="download.html" class="text-gray-300 hover:text-white">Download</a>
                    <a href="pricing.html" class="text-gray-300 hover:text-white">Pricing</a>
                    <a href="blog.html" class="text-gray-300 hover:text-white">Blog</a>
                    <a href="changelog.html" class="text-gray-300 hover:text-white">Changelog</a>
                </nav>
                <div class="flex items-center space-x-4">
                    <a href="sign_in.html" class="text-gray-300 hover:text-white">Sign In</a>
                    <a href="signup.html" class="bg-white text-\[#0a1628\] px-6 py-2 rounded-md font-medium">Start Free</a>
                </div>
            </div>
        </div>
    </header>
'@

$files = @("blog.html", "changelog.html", "demo.html", "download.html")

foreach ($file in $files) {
    Write-Host "Updating $file..."
    $content = Get-Content $file -Raw
    
    # Use regex to find and replace the header section
    $pattern = '<header class="content bg-\[#070F34\] border-b border-gray-700">.*?</header>'
    $content = $content -replace $pattern, $modernHeaderHTML
    
    Set-Content $file $content -NoNewline
    Write-Host "✓ $file updated"
}

Write-Host "`nAll marketing pages updated successfully!"
