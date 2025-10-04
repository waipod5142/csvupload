const FirestoreCSVUploader = require('./firestore-uploader');
const path = require('path');
const colors = require('colors');

async function testUploader() {
    console.log(colors.cyan('🧪 Testing Firestore CSV Uploader...'));
    
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    const csvPath = path.join(__dirname, 'data', 'users.csv');
    const collectionName = 'users';
    
    const uploader = new FirestoreCSVUploader(serviceAccountPath, csvPath, collectionName);
    
    try {
        const result = await uploader.run();
        console.log(colors.green('✅ Test completed successfully!'));
        console.log('Result:', result);
    } catch (error) {
        console.error(colors.red('❌ Test failed:'), error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    testUploader();
}

module.exports = testUploader;