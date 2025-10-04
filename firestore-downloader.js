const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const { program } = require('commander');

class FirestoreDownloader {
    constructor(serviceAccountPath, collectionName, outputPath = null) {
        this.serviceAccountPath = serviceAccountPath;
        this.collectionName = collectionName;
        this.outputPath = outputPath;
        this.db = null;
    }

    async initialize() {
        try {
            if (!fs.existsSync(this.serviceAccountPath)) {
                throw new Error(`Service account key file not found: ${this.serviceAccountPath}`);
            }

            const serviceAccount = require(path.resolve(this.serviceAccountPath));
            
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: serviceAccount.project_id
                });
            }

            this.db = admin.firestore();
            console.log(colors.green('✅ Firebase Admin SDK initialized successfully'));
            return true;
        } catch (error) {
            console.error(colors.red('❌ Failed to initialize Firebase Admin SDK:'), error.message);
            return false;
        }
    }

    async validateConnection() {
        try {
            // Test connection by listing collections
            const collections = await this.db.listCollections();
            console.log(colors.green('✅ Firestore connection validated'));
            return true;
        } catch (error) {
            console.error(colors.red('❌ Firestore connection failed:'), error.message);
            return false;
        }
    }

    convertFirestoreData(data) {
        if (data === null || data === undefined) {
            return data;
        }

        if (data instanceof admin.firestore.Timestamp) {
            return data.toDate().toISOString();
        }

        if (data instanceof admin.firestore.GeoPoint) {
            return {
                latitude: data.latitude,
                longitude: data.longitude
            };
        }

        if (Array.isArray(data)) {
            return data.map(item => this.convertFirestoreData(item));
        }

        if (typeof data === 'object' && data !== null) {
            const converted = {};
            for (const [key, value] of Object.entries(data)) {
                converted[key] = this.convertFirestoreData(value);
            }
            return converted;
        }

        return data;
    }

    async downloadCollection() {
        try {
            console.log(colors.yellow(`📥 Downloading collection '${this.collectionName}'...`));

            const collectionRef = this.db.collection(this.collectionName);
            const snapshot = await collectionRef.get();

            if (snapshot.empty) {
                console.log(colors.yellow(`⚠️  Collection '${this.collectionName}' is empty or doesn't exist`));
                return [];
            }

            const documents = [];
            snapshot.forEach(doc => {
                const data = this.convertFirestoreData(doc.data());
                documents.push({
                    id: doc.id,
                    ...data
                });
            });

            console.log(colors.blue(`📄 Found ${documents.length} documents in collection '${this.collectionName}'`));
            return documents;

        } catch (error) {
            console.error(colors.red('❌ Failed to download collection:'), error.message);
            throw error;
        }
    }

    async exportToJson(documents) {
        const jsonData = JSON.stringify(documents, null, 2);

        if (this.outputPath) {
            try {
                fs.writeFileSync(this.outputPath, jsonData);
                console.log(colors.green(`✅ JSON exported to: ${this.outputPath}`));
            } catch (error) {
                console.error(colors.red('❌ Failed to write JSON file:'), error.message);
                throw error;
            }
        } else {
            console.log(colors.cyan('\n📋 Collection JSON:'));
            console.log(jsonData);
        }

        return jsonData;
    }

    async run() {
        try {
            console.log(colors.cyan('🚀 Firestore Downloader Starting...'));
            
            const initialized = await this.initialize();
            if (!initialized) {
                process.exit(1);
            }

            const connectionValid = await this.validateConnection();
            if (!connectionValid) {
                process.exit(1);
            }

            const documents = await this.downloadCollection();
            if (documents.length === 0) {
                return;
            }

            await this.exportToJson(documents);
            
            console.log(colors.cyan('\n🎉 Download process completed!'));
            return documents;

        } catch (error) {
            console.error(colors.red('💥 Fatal error:'), error.message);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    program
        .name('firestore-downloader')
        .description('Download Firestore collection data as JSON')
        .version('1.0.0')
        .requiredOption('-s, --service-account <path>', 'Path to Firebase service account key file')
        .requiredOption('-c, --collection <name>', 'Firestore collection name')
        .option('-o, --output <path>', 'Output JSON file path (if not provided, prints to console)')
        .parse();

    const options = program.opts();
    
    const downloader = new FirestoreDownloader(
        options.serviceAccount,
        options.collection,
        options.output
    );
    
    downloader.run().catch(console.error);
}

module.exports = FirestoreDownloader;