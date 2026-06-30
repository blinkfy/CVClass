const fs = require('fs');
const path = require('path');

function copyFonts() {
  const source = path.join('node_modules', '@fontsource', 'noto-sans-sc', 'files');
  const target = path.join('static', 'fonts');
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source)
    .filter((name) => name.includes('chinese-simplified') && name.endsWith('.woff2'))
    .forEach((name) => fs.copyFileSync(path.join(source, name), path.join(target, name)));
  console.log(`Fonts copied: ${target}`);
}

copyFonts();
