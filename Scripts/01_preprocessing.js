const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const README_URL = 'https://raw.githubusercontent.com/andersnygaard/Paradox-sailboat/main/README.md';
const OUTPUT_DIR = './output/raw';

// Ensure output directory exists
function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_DIR}`);
    }
}

// Fetch content from URL
function fetchContent(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Main parsing and splitting logic
async function main() {
    ensureOutputDir();
    const content = await fetchContent(README_URL);
    const lines = content.split(/\r?\n/);

    // Find the start line (first header: # A guide to the Paradox sailboat)
    const startIdx = lines.findIndex(line => line.trim() === '# A guide to the Paradox sailboat');
    if (startIdx === -1) {
        throw new Error('Start marker not found');
    }

    let fileIndex = 1;
    let buffer = [];
    let mode = null; // 'header' or 'chapter'

    // Helper to write buffer to file
    function writeBuffer(type, data) {
        let content;
        if (type === 'header') {
            // Remove leading # and whitespace for header
            content = data.map(line => line.replace(/^#+\s*/, '').trim()).join('\n').trim() + '\n';
        } else {
            // Remove leading * and whitespace for chapter lines, but keep #
            content = data.map(line => line.replace(/^\*+\s*/, '').trim()).join('\n').trim() + '\n';
        }
        const filename = path.join(OUTPUT_DIR, `${fileIndex.toString().padStart(4, '0')}-${type}.txt`);
        fs.writeFileSync(filename, content, 'utf8');
        fileIndex++;
    }

    // Helper to check if a line is a header (single or double hash, but not triple or more)
    function isHeader(line) {
        return (/^# (?!#)/.test(line) || /^## (?!#)/.test(line));
    }

    // Helper to check if a line is a subchapter (exactly three hashes)
    function isSubchapter(line) {
        return /^### (?!#)/.test(line);
    }

    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        
        if (isHeader(line)) {
            // Write any previous content first
            if (buffer.length > 0 && mode) {
                writeBuffer(mode, buffer);
                buffer = [];
            }
            // Write the header immediately
            writeBuffer('header', [line]);
            // Start collecting chapter content
            mode = 'chapter';
        } else if (isSubchapter(line)) {
            // Write any previous chapter content
            if (buffer.length > 0 && mode === 'chapter') {
                writeBuffer(mode, buffer);
                buffer = [];
            }
            // Start new chapter section
            buffer = [line];
        } else {
            // Add content to current buffer
            buffer.push(line);
        }
    }
    // Write last chapter if any
    if (buffer.length > 0 && mode) {
        writeBuffer(mode, buffer);
    }
    console.log('Splitting complete.');
}

// Run main if this script is executed directly
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

