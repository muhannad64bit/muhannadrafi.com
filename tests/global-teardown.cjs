/**
 * Global test teardown
 * Runs once after all tests
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = async () => {
  console.log('Running global test teardown...');
  
  // Clean up any temporary files or state
  const tempFiles = [
    'storageState.json',
    'test-state.json'
  ];
  
  for (const file of tempFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up: ${file}`);
      } catch (error) {
        console.error(`Failed to clean up ${file}:`, error.message);
      }
    }
  }
  
  console.log('Global test teardown completed');
};