const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const AUDIO_DIR = path.join(__dirname, 'output', 'audio');
const OUTPUT_FILE = path.join(__dirname, 'output', 'book.mp3');
const SILENCE_FILE = path.join(__dirname, 'input', 'silence_1s.mp3');

// Silence durations in seconds
const SILENCE_DURATIONS = {
  title: 2,
  subtitle: 2,
  chapter: 2,
  asterisk: 2
};

async function getAudioFiles() {
  try {
    const files = await fs.promises.readdir(AUDIO_DIR);
    
    // Filter for MP3 files and sort them
    const mp3Files = files
      .filter(file => file.endsWith('.mp3'))
      .sort((a, b) => {
        // Extract numbers from filenames for proper sorting
        const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    
    // Find the first asterisk file
    const firstAsteriskIndex = mp3Files.findIndex(file => file.includes('asterisk'));
    
    if (firstAsteriskIndex === -1) {
      console.log('⚠️  No asterisk files found. Processing all files.');
      return mp3Files.map(file => ({
        name: file,
        path: path.join(AUDIO_DIR, file),
        type: file.includes('title') ? 'title' : 
              file.includes('subtitle') ? 'subtitle' : 
              file.includes('asterisk') ? 'asterisk' : 'chapter'
      }));
    }
    
    // Filter to only include files from the first asterisk onwards
    const filteredFiles = mp3Files.slice(firstAsteriskIndex);
    
    console.log(`📌 First asterisk file found: ${mp3Files[firstAsteriskIndex]}`);
    console.log(`🗑️  Discarded ${firstAsteriskIndex} files before the first asterisk`);
    
    return filteredFiles.map(file => ({
      name: file,
      path: path.join(AUDIO_DIR, file),
      type: file.includes('title') ? 'title' : 
            file.includes('subtitle') ? 'subtitle' : 
            file.includes('asterisk') ? 'asterisk' : 'chapter'
    }));
  } catch (error) {
    console.error('Error reading audio directory:', error);
    throw error;
  }
}

async function createFileList(audioFiles) {
  const fileListPath = path.join(__dirname, 'temp_file_list.txt');
  
  let fileListContent = '';
  
  console.log('\n📝 Processing audio files and adding silence intervals...');
  
  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    
    // Add the audio file
    fileListContent += `file '${file.path.replace(/\\/g, '/')}'\n`;
    console.log(`  📄 ${file.name} (${file.type})`);
    
    // Add silence after the file (except for the last file)
    if (i < audioFiles.length - 1) {
      const silenceDuration = SILENCE_DURATIONS[file.type];
      
      // Add the silence file multiple times to achieve the desired duration
      for (let j = 0; j < silenceDuration; j++) {
        fileListContent += `file '${SILENCE_FILE.replace(/\\/g, '/')}'\n`;
      }
      
      console.log(`    🔇 Added ${silenceDuration}s silence`);
    }
  }
  
  await fs.promises.writeFile(fileListPath, fileListContent);
  return fileListPath;
}

async function concatenateAudioFiles(fileListPath) {
  return new Promise((resolve, reject) => {
    console.log('\n🎵 Concatenating audio files...');
    
    // Use libmp3lame encoder specifically
    const command = ffmpeg()
      .input(fileListPath)
      .inputFormat('concat')
      .output(OUTPUT_FILE)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('✅ Audio concatenation completed successfully!');
        resolve();
      })
      .on('error', (error) => {
        console.error('❌ Error during concatenation:', error.message);
        reject(error);
      });
    
    // Add the safe option using addInputOptions
    command.addInputOptions(['-safe', '0']);
    command.run();
  });
}

async function cleanup(fileListPath) {
  try {
    console.log('\n🧹 Cleaning up temporary files...');
    
    // Remove temporary file list
    await fs.promises.unlink(fileListPath);
    
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
  }
}

async function main() {
  try {
    console.log('🎬 Starting audio file concatenation...');
    console.log(`📁 Audio directory: ${AUDIO_DIR}`);
    console.log(`🎯 Output file: ${OUTPUT_FILE}`);
    
    // Get all audio files
    const audioFiles = await getAudioFiles();
    console.log(`\n📊 Found ${audioFiles.length} audio files`);
    
    // Display file types summary
    const typeCounts = audioFiles.reduce((acc, file) => {
      acc[file.type] = (acc[file.type] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📋 File types:', typeCounts);
    
    // Create file list with silence intervals
    const fileListPath = await createFileList(audioFiles);
    
    // Concatenate all files
    await concatenateAudioFiles(fileListPath);
    
    // Cleanup temporary files
    await cleanup(fileListPath);
    
    console.log(`\n🎉 Successfully created: ${OUTPUT_FILE}`);
    console.log(`📈 Total files processed: ${audioFiles.length}`);
    
    // Get file size
    const stats = await fs.promises.stat(OUTPUT_FILE);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📏 Final file size: ${fileSizeInMB} MB`);
    
  } catch (error) {
    console.error('❌ Error in main process:', error.message);
    process.exit(1);
  }
}

// Check if ffmpeg is available
ffmpeg.getAvailableCodecs((err, codecs) => {
  if (err) {
    console.error('❌ FFmpeg is not available. Please install FFmpeg first.');
    console.error('📥 Download from: https://ffmpeg.org/download.html');
    console.error('🔧 Make sure FFmpeg is in your system PATH');
    process.exit(1);
  }
  
  console.log('✅ FFmpeg is available');
  
  // Run the main function
  main();
});
