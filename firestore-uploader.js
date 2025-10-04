const admin = require('firebase-admin');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const { program } = require('commander');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { NestedDataReconstructor } = require('./collection-mappings');

class FirestoreCSVUploader {
    constructor(serviceAccountPath, dataSource, collectionName, customDocId = null, isGoogleSheet = false) {
        this.serviceAccountPath = serviceAccountPath;
        this.dataSource = dataSource; // Can be CSV path or Google Sheets URL
        this.collectionName = collectionName;
        this.customDocId = customDocId;
        this.isGoogleSheet = isGoogleSheet;
        this.db = null;
        this.results = [];
    }

    async initialize() {
        try {
            if (!fs.existsSync(this.serviceAccountPath)) {
                throw new Error(`Service account key file not found: ${this.serviceAccountPath}`);
            }

            if (!this.isGoogleSheet && !fs.existsSync(this.dataSource)) {
                throw new Error(`CSV file not found: ${this.dataSource}`);
            }

            const serviceAccount = require(path.resolve(this.serviceAccountPath));
            
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: serviceAccount.project_id
                });
            }

            this.db = admin.firestore();
            console.log(colors.green(' Firebase Admin SDK initialized successfully'));
            return true;
        } catch (error) {
            console.error(colors.red(' Failed to initialize Firebase Admin SDK:'), error.message);
            return false;
        }
    }

    async parseData() {
        if (this.isGoogleSheet) {
            return this.parseGoogleSheet();
        } else {
            return this.parseCsv();
        }
    }

    async parseGoogleSheet() {
        try {
            // Extract spreadsheet ID from URL
            const spreadsheetId = this.extractSpreadsheetId(this.dataSource);
            
            // Load service account for Google Sheets authentication
            const serviceAccount = require(path.resolve(this.serviceAccountPath));
            
            // Create JWT authentication
            const serviceAccountAuth = new JWT({
                email: serviceAccount.client_email,
                key: serviceAccount.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });

            // Initialize the sheet
            const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
            await doc.loadInfo();
            
            console.log(colors.blue(`=� Connected to Google Sheet: "${doc.title}"`));
            
            // Get the first sheet
            const sheet = doc.sheetsByIndex[0];
            console.log(colors.blue(`=� Reading from sheet: "${sheet.title}"`));
            
            // Get all rows
            const rows = await sheet.getRows();
            const results = [];
            
            rows.forEach((row) => {
                const cleanedData = {};
                
                // Process each column in the row
                for (const [key, value] of Object.entries(row.toObject())) {
                    let cleanedValue = String(value || '').trim();
                    
                    // Try to parse as JSON first (for nested objects/arrays)
                    if (cleanedValue.startsWith('{') || cleanedValue.startsWith('[')) {
                        try {
                            cleanedValue = JSON.parse(cleanedValue);
                        } catch (e) {
                            // If JSON parsing fails, treat as string
                            console.log(`Failed to parse JSON for ${key}:`, cleanedValue);
                        }
                    } else if (cleanedValue.toLowerCase() === 'true') {
                        cleanedValue = true;
                    } else if (cleanedValue.toLowerCase() === 'false') {
                        cleanedValue = false;
                    } else if (!isNaN(cleanedValue) && cleanedValue !== '') {
                        cleanedValue = Number(cleanedValue);
                    } else if (cleanedValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        cleanedValue = new Date(cleanedValue);
                    }
                    
                    cleanedData[key.trim()] = cleanedValue;
                }
                
                // Reconstruct nested data based on collection mapping
                const reconstructedData = NestedDataReconstructor.reconstructData(cleanedData, this.collectionName);
                results.push(reconstructedData);
            });
            
            console.log(colors.blue(`=� Parsed ${results.length} records from Google Sheet`));
            return results;
            
        } catch (error) {
            console.error(colors.red(' Failed to parse Google Sheet:'), error.message);
            throw error;
        }
    }
    
    extractSpreadsheetId(url) {
        // Extract spreadsheet ID from various Google Sheets URL formats
        const patterns = [
            /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,  // Standard URL
            /^([a-zA-Z0-9-_]+)$/  // Direct ID
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1] || match[0];
            }
        }
        
        throw new Error(`Invalid Google Sheets URL or ID: ${url}`);
    }

    validateRequiredFields(record, recordIndex) {
        const missingFields = [];
        
        if (this.collectionName === 'forms') {
            if (!record.bu) missingFields.push('bu');
            if (!record.type) missingFields.push('type');
        } else if (this.collectionName === 'machine') {
            if (!record.bu) missingFields.push('bu');
            if (!record.type) missingFields.push('type');
            if (!record.site) missingFields.push('site');
            if (!record.id) missingFields.push('id');
        } else if (this.collectionName === 'vocabulary') {
            if (!record.bu) missingFields.push('bu');
        }
        
        if (missingFields.length > 0) {
            throw new Error(`Record ${recordIndex + 1}: Missing required fields for document ID generation in collection '${this.collectionName}': ${missingFields.join(', ')}`);
        }
    }

    async parseCsv() {
        return new Promise((resolve, reject) => {
            const results = [];
            
            fs.createReadStream(this.dataSource)
                .pipe(csv())
                .on('data', (data) => {
                    const cleanedData = {};
                    for (const [key, value] of Object.entries(data)) {
                        let cleanedValue = value.trim();
                        
                        // Try to parse as JSON first (for nested objects/arrays)
                        if (cleanedValue.startsWith('{') || cleanedValue.startsWith('[')) {
                            try {
                                cleanedValue = JSON.parse(cleanedValue);
                            } catch (e) {
                                // If JSON parsing fails, treat as string
                                console.log(`Failed to parse JSON for ${key}:`, cleanedValue);
                            }
                        } else if (cleanedValue.toLowerCase() === 'true') {
                            cleanedValue = true;
                        } else if (cleanedValue.toLowerCase() === 'false') {
                            cleanedValue = false;
                        } else if (!isNaN(cleanedValue) && cleanedValue !== '') {
                            cleanedValue = Number(cleanedValue);
                        } else if (cleanedValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            cleanedValue = new Date(cleanedValue);
                        }
                        
                        cleanedData[key.trim()] = cleanedValue;
                    }
                    
                    // Reconstruct nested data based on collection mapping
                    const reconstructedData = NestedDataReconstructor.reconstructData(cleanedData, this.collectionName);
                    results.push(reconstructedData);
                })
                .on('end', () => {
                    console.log(colors.blue(`=� Parsed ${results.length} records from CSV`));
                    resolve(results);
                })
                .on('error', reject);
        });
    }

    async uploadToFirestore(data, batchSize = 500) {
        try {
            const totalRecords = data.length;
            let uploadedCount = 0;
            let errorCount = 0;
            const errors = [];

            console.log(colors.yellow(`=� Starting upload of ${totalRecords} records to collection '${this.collectionName}'`));

            for (let i = 0; i < data.length; i += batchSize) {
                const batch = this.db.batch();
                const currentBatch = data.slice(i, i + batchSize);
                
                currentBatch.forEach((record, index) => {
                    try {
                        let docRef;
                        if (this.customDocId) {
                            docRef = this.db.collection(this.collectionName).doc(this.customDocId);
                        } else {
                            // Validate required fields for specific collections
                            if (['forms', 'machine', 'vocabulary'].includes(this.collectionName)) {
                                this.validateRequiredFields(record, i + index);
                            }
                            
                            // Collection-specific auto-generated document ID
                            let autoDocId = null;
                            
                            if (this.collectionName === 'forms') {
                                autoDocId = `${record.bu}_${record.type}`;
                            } else if (this.collectionName === 'machine') {
                                autoDocId = `${record.bu}_${record.type}_${record.site}_${record.id}`;
                            } else if (this.collectionName === 'vocabulary') {
                                autoDocId = record.bu;
                            }
                            
                            if (autoDocId) {
                                docRef = this.db.collection(this.collectionName).doc(autoDocId);
                            } else {
                                docRef = this.db.collection(this.collectionName).doc();
                            }
                        }
                        batch.set(docRef, {
                            ...record,
                            uploadedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    } catch (recordError) {
                        errors.push({
                            record: i + index + 1,
                            error: recordError.message,
                            data: record
                        });
                        errorCount++;
                    }
                });

                try {
                    await batch.commit();
                    uploadedCount += currentBatch.length;
                    console.log(colors.green(` Batch ${Math.ceil((i + batchSize) / batchSize)} uploaded: ${uploadedCount}/${totalRecords} records`));
                } catch (batchError) {
                    console.error(colors.red(` Failed to upload batch ${Math.ceil((i + batchSize) / batchSize)}:`), batchError.message);
                    errorCount += currentBatch.length;
                }
            }

            console.log(colors.cyan(`\n=� Upload Summary:`));
            console.log(colors.green(`   Successfully uploaded: ${uploadedCount} records`));
            if (errorCount > 0) {
                console.log(colors.red(`   Failed uploads: ${errorCount} records`));
                if (errors.length > 0) {
                    console.log(colors.yellow(`\n�  First 5 errors:`));
                    errors.slice(0, 5).forEach(err => {
                        console.log(colors.red(`    Record ${err.record}: ${err.error}`));
                    });
                }
            }

            return {
                total: totalRecords,
                uploaded: uploadedCount,
                errors: errorCount,
                errorDetails: errors
            };

        } catch (error) {
            console.error(colors.red(' Upload failed:'), error.message);
            throw error;
        }
    }

    async validateConnection() {
        try {
            const testCollection = this.db.collection('connection_test');
            const testDoc = testCollection.doc('test');
            
            await testDoc.set({ test: true, timestamp: new Date() });
            await testDoc.delete();
            
            console.log(colors.green(' Firestore connection validated'));
            return true;
        } catch (error) {
            console.error(colors.red(' Firestore connection failed:'), error.message);
            return false;
        }
    }

    async run() {
        try {
            console.log(colors.cyan('=% Firestore CSV Uploader Starting...'));
            
            const initialized = await this.initialize();
            if (!initialized) {
                process.exit(1);
            }

            const connectionValid = await this.validateConnection();
            if (!connectionValid) {
                process.exit(1);
            }

            const data = await this.parseData();
            if (data.length === 0) {
                const dataType = this.isGoogleSheet ? 'Google Sheet' : 'CSV file';
                console.log(colors.yellow(`⚠️  No data found in ${dataType}`));
                return;
            }
            const result = await this.uploadToFirestore(data);
            
            console.log(colors.cyan('\n<� Upload process completed!'));
            return result;

        } catch (error) {
            console.error(colors.red('=� Fatal error:'), error.message);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    program
        .name('firestore-csv-uploader')
        .description('Upload CSV or Google Sheets data to Firestore')
        .version('1.0.0')
        .requiredOption('-s, --service-account <path>', 'Path to Firebase service account key file')
        .requiredOption('-c, --csv <path>', 'Path to CSV file or Google Sheets URL')
        .option('-g, --google-sheet', 'Treat input as Google Sheets URL instead of CSV file')
        .requiredOption('-n, --collection <name>', 'Firestore collection name')
        .option('-d, --doc-id <id>', 'Custom document ID (if not provided, auto-generated IDs will be used)')
        .option('-b, --batch-size <size>', 'Batch size for uploads (default: 500)', '500')
        .parse();

    const options = program.opts();
    
    const uploader = new FirestoreCSVUploader(
        options.serviceAccount,
        options.csv,
        options.collection,
        options.docId,
        options.googleSheet
    );
    
    uploader.run().catch(console.error);
}

module.exports = FirestoreCSVUploader;