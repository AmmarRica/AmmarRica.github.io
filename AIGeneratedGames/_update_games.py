import re, os, glob

os.chdir(os.path.dirname(os.path.abspath(__file__)))

def get_dirs(pattern):
    dirs = sorted(glob.glob(pattern))
    return [os.path.basename(d.rstrip("/").rstrip("\\")) for d in dirs if os.path.isdir(d)]

all_dirs = get_dirs("day-*") + get_dirs("game-*")

HEADER_SCRIPT = '<script src="../header.js"></script>'

# Old nav-bar CSS block to remove
NAV_CSS_PATTERN = re.compile(
    r'\n\s*\.nav-bar\s*\{[^}]*\}\s*'
    r'\.nav-bar a\s*\{[^}]*\}\s*'
    r'\.nav-bar a:hover\s*\{[^}]*\}\s*'
    r'\.nav-bar \.disabled\s*\{[^}]*\}\s*',
    re.DOTALL
)

# Old nav-bar HTML to remove
NAV_HTML_PATTERN = re.compile(r'\s*<div class="nav-bar">.*?</div>', re.DOTALL)

# Old <nav> elements to remove
NAV_ELEM_PATTERN = re.compile(r'\s*<nav>.*?</nav>', re.DOTALL)

for d in all_dirs:
    filepath = os.path.join(d, "index.html")
    if not os.path.exists(filepath):
        continue

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original = content

    # Remove old nav-bar CSS
    content = NAV_CSS_PATTERN.sub('\n', content)

    # Remove old nav-bar HTML
    content = NAV_HTML_PATTERN.sub('', content)

    # Remove old <nav> elements
    content = NAV_ELEM_PATTERN.sub('', content)

    # Add header.js script before </body> if not already present
    if 'header.js' not in content:
        content = content.replace('</body>', HEADER_SCRIPT + '\n</body>')

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print("Updated {}".format(filepath))
    else:
        print("Skipped {} (no changes)".format(filepath))

print("Done! Updated {} game pages.".format(len(all_dirs)))
