const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const INPUT_DIR = './output/raw';
const OUTPUT_DIR = './output/audio';
const OPENAI_API_URL = 'https://api.openai.com/v1/audio/speech';
const GPT_API_URL = 'https://api.openai.com/v1/chat/completions';

// Ensure output directory exists
function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_DIR}`);
    }
}

// Read text file content
function readTextFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        return null;
    }
}

// Enhance text using GPT-4o with style instructions
function enhanceTextWithGPT4o(text, fileType, apiKey) {
    return new Promise((resolve, reject) => {
        // Create style-specific prompts based on file type
        let stylePrompt = '';
        switch (fileType) {
            case 'header':
                stylePrompt = 'You are reading an audiobook. You are reading the header and nothing more. Read the exact text as it is written. Do not add any additional text or explanations. Do not add any additional text or explanations.';
                break;
            case 'chapter':
            default:
                stylePrompt = 'You are reading an audiobook. Read the exact text as it is written. Do not add any additional text or explanations. Do not add any additional text or explanations. A subheader is a line that starts with ###, but don\'t read out loud that it\'s a header. Do not read spell the hash symbol. Pause naturally after a subheader.';
                break;
        }

        const requestData = JSON.stringify({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an expert audiobook narrator specializing in technical and sailing content. Your task is to enhance the given text for optimal audio narration while preserving all factual information and technical details.

Style guidelines:
- Maintain all technical accuracy and measurements
- Add natural pauses and emphasis for better audio flow
- Use clear pronunciation for sailing terms and boat names
- Keep the original meaning and tone intact
- Make it sound natural when spoken aloud

${stylePrompt}`
                },
                {
                    role: "user",
                    content: `Please enhance this text for audiobook narration: "${text}"`
                }
            ],
            max_tokens: 1000,
            temperature: 0.3
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk;
                });
                res.on('end', () => {
                    reject(new Error(`GPT API Error ${res.statusCode}: ${errorData}`));
                });
                return;
            }

            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(responseData);
                    const enhancedText = response.choices[0].message.content.trim();
                    resolve(enhancedText);
                } catch (error) {
                    reject(new Error(`Failed to parse GPT response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(requestData);
        req.end();
    });
}

// Convert text to audio using OpenAI API
function textToSpeech(text, apiKey) {
    return new Promise((resolve, reject) => {
        // Prepare the request data
        const requestData = JSON.stringify({
            model: "tts-1-hd",
            input: text,
            voice: "ash",
            response_format: "mp3",
            speed: 1
        });

        // Prepare the request options
        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/audio/speech',
            method: 'POST',
            instructions: 'You are reading an audio book. Take small pauses for breathing and after paragraphs if natural.',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        // Make the request
        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk;
                });
                res.on('end', () => {
                    reject(new Error(`API Error ${res.statusCode}: ${errorData}`));
                });
                return;
            }

            const chunks = [];
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const audioBuffer = Buffer.concat(chunks);
                resolve(audioBuffer);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(requestData);
        req.end();
    });
}

// Process a single file
async function processFile(filename, apiKey) {
    const inputPath = path.join(INPUT_DIR, filename);
    const outputPath = path.join(OUTPUT_DIR, filename.replace('.txt', '.mp3'));

    // Skip if output file already exists
    if (fs.existsSync(outputPath)) {
        console.log(`Skipping ${filename} - output already exists`);
        return;
    }

    // Read text content
    const textContent = readTextFile(inputPath);
    if (!textContent || !textContent.trim()) {
        console.log(`Skipping ${filename} - empty content`);
        return;
    }

    // Determine file type for style enhancement
    const fileType = getFileType(filename);
    
    try {
        console.log(`Processing ${filename} (${fileType})...`);
        
        let textToProcess = textContent.trim();
        
        // Only enhance text for chapters, not headers
        if (fileType === 'chapter') {
            console.log('  Enhancing text with GPT-4o...');
            textToProcess = await enhanceTextWithGPT4o(textContent.trim(), fileType, apiKey);
            console.log('  ✓ Text enhanced');
        } else {
            console.log('  Skipping text enhancement for header...');
        }
        
        // Convert to audio
        console.log('  Converting to audio...');
        const audioBuffer = await textToSpeech(textToProcess, apiKey);
        
        // Save audio file
        fs.writeFileSync(outputPath, audioBuffer);
        console.log(`✓ Created: ${filename.replace('.txt', '.mp3')}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
    } catch (error) {
        console.error(`✗ Error processing ${filename}:`, error.message);
    }
}

// Get all text files from input directory
function getTextFiles() {
    try {
        const files = fs.readdirSync(INPUT_DIR);
        return files
            .filter(file => file.endsWith('.txt'))
            .sort((a, b) => {
                // Extract the numeric part for proper sorting
                const aMatch = a.match(/(\d+)/);
                const bMatch = b.match(/(\d+)/);
                
                if (aMatch && bMatch) {
                    return parseInt(aMatch[1]) - parseInt(bMatch[1]);
                }
                
                // Fallback to alphabetical sorting
                return a.localeCompare(b);
            });
    } catch (error) {
        console.error('Error reading input directory:', error.message);
        return [];
    }
}

// Determine file type based on filename
function getFileType(filename) {
    const lowerFilename = filename.toLowerCase();
    
    if (lowerFilename.includes('header') || lowerFilename.includes('title')) {
        return 'header';
    } else if (lowerFilename.includes('chapter')) {
        return 'chapter';
    } else {
        // Default to chapter if we can't determine
        return 'chapter';
    }
}

// Main execution
async function main() {
    // Check if API key is provided
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('Error: OPENAI_API_KEY environment variable is required');
        console.log('Please set your OpenAI API key:');
        console.log('Windows: set OPENAI_API_KEY=your_api_key_here');
        console.log('Linux/Mac: export OPENAI_API_KEY=your_api_key_here');
        process.exit(1);
    }

    try {
        console.log('Starting audio generation...');
        
        // Ensure output directory exists
        ensureOutputDir();
        
        // Get all text files
        const textFiles = getTextFiles();
        if (textFiles.length === 0) {
            console.log('No text files found in input directory');
            return;
        }
        
        console.log(`Found ${textFiles.length} text files to process`);
        
        // Log file types for verification
        const fileTypes = textFiles.map(file => ({ filename: file, type: getFileType(file) }));
        console.log('\nFile processing order:');
        fileTypes.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file.filename} (${file.type})`);
        });
        
        // Process files sequentially to avoid rate limiting
        for (let i = 0; i < textFiles.length; i++) {
            const filename = textFiles[i];
            console.log(`\n[${i + 1}/${textFiles.length}] Processing ${filename}`);
            await processFile(filename, apiKey);
        }
        
        console.log('\nAudio generation completed!');
        console.log(`Audio files saved to: ${OUTPUT_DIR}`);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    textToSpeech,
    processFile,
    getTextFiles
}; 