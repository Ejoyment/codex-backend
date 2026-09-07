// Language restrictions based on subscription tier

const FREE_LANGUAGES = ['python', 'javascript', 'dart', 'flutter'];

const ALL_LANGUAGES = [
    // Free tier
    'python', 'javascript', 'dart', 'flutter',
    // Premium+ languages
    'typescript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'php', 'swift',
    'kotlin', 'html', 'css', 'scss', 'less', 'sql', 'graphql', 'json', 'yaml', 'xml',
    'shell', 'bash', 'powershell', 'perl', 'lua', 'r', 'scala', 'elixir', 'haskell',
    'objective-c', 'assembly', 'cobol', 'fortran', 'pascal', 'ada', 'lisp', 'clojure',
    'erlang', 'fsharp', 'julia', 'nim', 'ocaml', 'prolog', 'scheme', 'solidity',
    'vhdl', 'verilog', 'matlab', 'groovy', 'coffeescript', 'vbnet', 'apex',
    'dockerfile', 'makefile', 'cmake', 'terraform', 'vue', 'svelte', 'markdown'
];

const LANGUAGE_DISPLAY_NAMES = {
    'python': 'Python',
    'javascript': 'JavaScript',
    'dart': 'Dart',
    'flutter': 'Flutter/Dart',
    'typescript': 'TypeScript',
    'java': 'Java',
    'c': 'C',
    'cpp': 'C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'ruby': 'Ruby',
    'php': 'PHP',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'less': 'LESS',
    'sql': 'SQL',
    'graphql': 'GraphQL',
    'json': 'JSON',
    'yaml': 'YAML',
    'xml': 'XML',
    'shell': 'Shell',
    'bash': 'Bash',
    'powershell': 'PowerShell',
    'perl': 'Perl',
    'lua': 'Lua',
    'r': 'R',
    'scala': 'Scala',
    'elixir': 'Elixir',
    'haskell': 'Haskell',
    'objective-c': 'Objective-C',
    'assembly': 'Assembly',
    'cobol': 'COBOL',
    'fortran': 'Fortran',
    'pascal': 'Pascal',
    'ada': 'Ada',
    'lisp': 'Lisp',
    'clojure': 'Clojure',
    'erlang': 'Erlang',
    'fsharp': 'F#',
    'julia': 'Julia',
    'nim': 'Nim',
    'ocaml': 'OCaml',
    'prolog': 'Prolog',
    'scheme': 'Scheme',
    'solidity': 'Solidity',
    'vhdl': 'VHDL',
    'verilog': 'Verilog',
    'matlab': 'MATLAB',
    'groovy': 'Groovy',
    'coffeescript': 'CoffeeScript',
    'vbnet': 'VB.NET',
    'apex': 'Apex',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile',
    'cmake': 'CMake',
    'terraform': 'Terraform',
    'vue': 'Vue',
    'svelte': 'Svelte',
    'markdown': 'Markdown'
};

function getAllowedLanguages(subscriptionTier) {
    if (!subscriptionTier || subscriptionTier === 'free') {
        return FREE_LANGUAGES;
    }
    // Professional, Business, Enterprise get all languages
    return ALL_LANGUAGES;
}

function isLanguageAllowed(language, subscriptionTier) {
    const allowed = getAllowedLanguages(subscriptionTier);
    return allowed.includes(language.toLowerCase());
}

function getLanguageDisplayName(language) {
    return LANGUAGE_DISPLAY_NAMES[language.toLowerCase()] || language;
}

function getLanguagesWithAccess(subscriptionTier) {
    const allowed = getAllowedLanguages(subscriptionTier);
    return allowed.map(lang => ({
        id: lang,
        name: getLanguageDisplayName(lang),
        allowed: true
    }));
}

function getAllLanguagesWithStatus(subscriptionTier) {
    return ALL_LANGUAGES.map(lang => ({
        id: lang,
        name: getLanguageDisplayName(lang),
        allowed: isLanguageAllowed(lang, subscriptionTier),
        requiresUpgrade: !isLanguageAllowed(lang, subscriptionTier)
    }));
}

module.exports = {
    FREE_LANGUAGES,
    ALL_LANGUAGES,
    getAllowedLanguages,
    isLanguageAllowed,
    getLanguageDisplayName,
    getLanguagesWithAccess,
    getAllLanguagesWithStatus
};
