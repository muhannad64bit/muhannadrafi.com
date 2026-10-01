/**
 * Build Script for Static Website
 * Copies source files to dist directory for production deployment
 */
'use strict';

const { cpSync, mkdirSync, rmSync, existsSync, statSync } = require('node:fs');
const path = require('node:path');

// ── Configuration ────────────────────────────────────────────────────────────

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

// Files and directories to copy
const filesToCopy = [
  'index.html',
  '404.html', 
  'assets',
  'robots.txt',
  'sitemap_com.xml',
  'sitemap_info.xml'
];

// Files that must exist for a successful build
const requiredFiles = [
  'index.html',
  'assets/css/style.css',
  'assets/js/main.js',
  'assets/js/theme-init.js'
];

// Logger utility
const logger = {
  info: (message) => console.log(`[Build] ${message}`),
  warn: (message) => console.warn(`[Build] ${message}`),
  error: (message) => console.error(`[Build] ${message}`),
  success: (message) => console.log(`[Build] ✓ ${message}`)
};

// ── Validation Functions ──────────────────────────────────────────────────────

/**
 * Check if a file exists and is accessible
 * @param {string} filePath - Path to the file
 * @returns {boolean} Whether the file exists
 */
function fileExists(filePath) {
  try {
    return existsSync(filePath);
  } catch (error) {
    logger.error(`Cannot access file: ${filePath} - ${error.message}`);
    return false;
  }
}

/**
 * Validate that all required files exist in source
 * @returns {boolean} Whether validation passed
 */
function validateSourceFiles() {
  logger.info('Validating source files...');
  
  const missingFiles = requiredFiles.filter(file => {
    const filePath = path.join(root, file);
    if (!fileExists(filePath)) {
      logger.warn(`Missing required file: ${file}`);
      return true;
    }
    return false;
  });
  
  if (missingFiles.length > 0) {
    logger.error(`Build cannot proceed: ${missingFiles.length} required files missing`);
    return false;
  }
  
  logger.success(`All ${requiredFiles.length} required files present`);
  return true;
}

/**
 * Validate that files were successfully copied to dist
 * @returns {boolean} Whether validation passed
 */
function validateBuildOutput() {
  logger.info('Validating build output...');
  
  const missingFiles = requiredFiles.filter(file => {
    const filePath = path.join(output, file);
    if (!fileExists(filePath)) {
      logger.warn(`Build incomplete: ${file} not in dist`);
      return true;
    }
    return false;
  });
  
  if (missingFiles.length > 0) {
    logger.error(`Build incomplete: ${missingFiles.length} required files missing in dist`);
    return false;
  }
  
  logger.success(`All ${requiredFiles.length} required files present in dist`);
  return true;
}

// ── File Operations ──────────────────────────────────────────────────────────

/**
 * Create a clean output directory
 */
function prepareOutputDirectory() {
  logger.info('Preparing output directory...');
  
  try {
    // Remove existing dist directory
    if (fileExists(output)) {
      logger.info('Cleaning up existing dist directory');
      rmSync(output, { recursive: true, force: true });
    }
    
    // Create fresh dist directory
    mkdirSync(output, { recursive: true });
    logger.success('Output directory prepared');
  } catch (error) {
    logger.error(`Failed to prepare output directory: ${error.message}`);
    throw error;
  }
}

/**
 * Copy files from source to destination
 * @param {string} source - Source file/directory
 * @param {string} destination - Destination path
 */
function copyFileOrDirectory(source, destination) {
  const sourcePath = path.join(root, source);
  const destinationPath = path.join(output, source);
  
  if (!fileExists(sourcePath)) {
    logger.warn(`Source not found: ${sourcePath}`);
    return;
  }
  
  try {
    cpSync(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      filter: (src) => {
        // Skip hidden files (starting with dot)
        const basename = path.basename(src);
        if (basename.startsWith('.')) {
          logger.info(`Skipping hidden file: ${basename}`);
          return false;
        }
        return true;
      },
    });
    logger.info(`Copied: ${source} → dist/${source}`);
  } catch (error) {
    logger.error(`Failed to copy ${source}: ${error.message}`);
    throw error;
  }
}

// ── Main Build Function ──────────────────────────────────────────────────────

/**
 * Main build function
 */
function build() {
  logger.info('Starting build process...');
  
  try {
    // Validate source files
    if (!validateSourceFiles()) {
      process.exit(1);
    }
    
    // Prepare output directory
    prepareOutputDirectory();
    
    // Copy all specified files and directories
    logger.info('Copying files to dist directory...');
    for (const file of filesToCopy) {
      copyFileOrDirectory(file, file);
    }
    
    // Validate build output
    if (!validateBuildOutput()) {
      logger.error('Build validation failed');
      process.exit(1);
    }
    
    // Build statistics
    const buildSize = calculateBuildSize();
    logger.info(`Build size: ${buildSize}`);
    
    logger.success('Static website built successfully in dist/');
    logger.info('Ready for deployment');
    
  } catch (error) {
    logger.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Calculate total build size
 * @returns {string} Human-readable size
 */
function calculateBuildSize() {
  try {
    const stats = statSync(output);
    const sizeInBytes = getDirectorySize(output);
    
    if (sizeInBytes < 1024) return `${sizeInBytes} bytes`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  } catch (error) {
    logger.warn(`Could not calculate build size: ${error.message}`);
    return 'unknown';
  }
}

/**
 * Recursively calculate directory size
 * @param {string} directoryPath - Path to directory
 * @returns {number} Size in bytes
 */
function getDirectorySize(directoryPath) {
  try {
    const stats = statSync(directoryPath);
    if (stats.isFile()) {
      return stats.size;
    }
    
    const { readdirSync } = require('node:fs');
    const files = readdirSync(directoryPath);
    
    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      totalSize += getDirectorySize(filePath);
    }
    
    return totalSize;
  } catch (error) {
    return 0;
  }
}

// ── Execute Build ────────────────────────────────────────────────────────────

build();
