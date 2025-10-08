const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const { program } = require('commander');

class MachinetrSiteUpdater {
    constructor(serviceAccountPath, machineJsonPath, machinetrJsonPath, dryRun = false) {
        this.serviceAccountPath = serviceAccountPath;
        this.machineJsonPath = machineJsonPath;
        this.machinetrJsonPath = machinetrJsonPath;
        this.dryRun = dryRun;
        this.db = null;
        this.machineSiteMap = new Map();
    }

    async initialize() {
        try {
            if (!fs.existsSync(this.serviceAccountPath)) {
                throw new Error(`Service account key file not found: ${this.serviceAccountPath}`);
            }

            if (!fs.existsSync(this.machineJsonPath)) {
                throw new Error(`Machine JSON file not found: ${this.machineJsonPath}`);
            }

            if (!fs.existsSync(this.machinetrJsonPath)) {
                throw new Error(`Machinetr JSON file not found: ${this.machinetrJsonPath}`);
            }

            const serviceAccount = require(path.resolve(this.serviceAccountPath));

            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: serviceAccount.project_id
                });
            }

            this.db = admin.firestore();
            console.log(colors.green('✓ Firebase Admin SDK initialized successfully'));
            return true;
        } catch (error) {
            console.error(colors.red('✗ Failed to initialize Firebase Admin SDK:'), error.message);
            return false;
        }
    }

    loadMachineData() {
        try {
            console.log(colors.blue('📖 Loading machine.json...'));
            const machineData = JSON.parse(fs.readFileSync(this.machineJsonPath, 'utf8'));

            // Create a map of machine ID+BU+TYPE to site
            // Key format: id|bu|type
            machineData.forEach(machine => {
                if (machine.id && machine.bu && machine.type && machine.site) {
                    const key = `${machine.id}|${machine.bu}|${machine.type}`;
                    this.machineSiteMap.set(key, machine.site);
                }
            });

            console.log(colors.green(`✓ Loaded ${this.machineSiteMap.size} machines with site information`));
            return machineData;
        } catch (error) {
            console.error(colors.red('✗ Failed to load machine data:'), error.message);
            throw error;
        }
    }

    loadMachinetrData() {
        try {
            console.log(colors.blue('📖 Loading machinetr.json...'));
            const machinetrData = JSON.parse(fs.readFileSync(this.machinetrJsonPath, 'utf8'));
            console.log(colors.green(`✓ Loaded ${machinetrData.length} machinetr records`));
            return machinetrData;
        } catch (error) {
            console.error(colors.red('✗ Failed to load machinetr data:'), error.message);
            throw error;
        }
    }

    prepareUpdates(machinetrData) {
        const updates = [];
        const noMatch = [];
        const alreadyHasSite = [];

        machinetrData.forEach(machinetr => {
            const machineId = machinetr.id;
            const bu = machinetr.bu;
            const type = machinetr.type;

            if (!machineId) {
                console.warn(colors.yellow(`⚠️  Machinetr record without ID found`));
                return;
            }

            if (!bu || !type) {
                console.warn(colors.yellow(`⚠️  Machinetr record ${machineId} missing bu or type`));
                noMatch.push({
                    id: machineId,
                    bu: bu || 'none',
                    type: type || 'none',
                    currentSite: machinetr.site || 'none',
                    reason: 'Missing bu or type'
                });
                return;
            }

            // Create the same key format as in loadMachineData
            const key = `${machineId}|${bu}|${type}`;
            const site = this.machineSiteMap.get(key);

            if (site) {
                // Check if site already exists and is the same
                if (machinetr.site === site) {
                    alreadyHasSite.push({
                        id: machineId,
                        bu: bu,
                        type: type,
                        site: site
                    });
                } else {
                    updates.push({
                        id: machineId,
                        bu: bu,
                        type: type,
                        oldSite: machinetr.site || 'none',
                        newSite: site,
                        data: machinetr
                    });
                }
            } else {
                noMatch.push({
                    id: machineId,
                    bu: bu,
                    type: type,
                    currentSite: machinetr.site || 'none',
                    reason: 'No matching machine'
                });
            }
        });

        return { updates, noMatch, alreadyHasSite };
    }

    displayUpdateSummary(updates, noMatch, alreadyHasSite) {
        console.log(colors.cyan('\n📊 Update Summary:'));
        console.log(colors.green(`   Records to update: ${updates.length}`));
        console.log(colors.blue(`   Already have correct site: ${alreadyHasSite.length}`));
        console.log(colors.yellow(`   No matching machine found: ${noMatch.length}`));

        if (updates.length > 0) {
            console.log(colors.cyan('\n📝 Sample updates (first 5):'));
            updates.slice(0, 5).forEach(update => {
                console.log(colors.white(`   ID: ${update.id} (bu: ${update.bu}, type: ${update.type})`));
                console.log(colors.red(`      Old site: ${update.oldSite}`));
                console.log(colors.green(`      New site: ${update.newSite}`));
            });
        }

        if (noMatch.length > 0 && noMatch.length <= 10) {
            console.log(colors.yellow('\n⚠️  Records without matching machine:'));
            noMatch.forEach(item => {
                console.log(colors.yellow(`   ID: ${item.id} (bu: ${item.bu}, type: ${item.type}) - ${item.reason}`));
            });
        } else if (noMatch.length > 10) {
            console.log(colors.yellow(`\n⚠️  ${noMatch.length} records without matching machine (showing first 10):`));
            noMatch.slice(0, 10).forEach(item => {
                console.log(colors.yellow(`   ID: ${item.id} (bu: ${item.bu}, type: ${item.type}) - ${item.reason}`));
            });
        }
    }

    async updateFirestore(updates, batchSize = 500) {
        if (this.dryRun) {
            console.log(colors.magenta('\n🔍 DRY RUN MODE - No changes will be made to Firestore'));
            return {
                total: updates.length,
                updated: 0,
                errors: 0
            };
        }

        try {
            const totalRecords = updates.length;
            let updatedCount = 0;
            let errorCount = 0;
            const errors = [];

            console.log(colors.yellow(`\n🚀 Starting update of ${totalRecords} records in collection 'machinetr'`));
            console.log(colors.blue('📊 Querying Firestore for matching documents...'));

            // First, we need to query Firestore to find the actual document IDs
            // Build a map of machinetr.id to Firestore document ID
            const machinetrDocMap = new Map();

            // Query all machinetr documents to get their Firestore doc IDs
            const machinetrSnapshot = await this.db.collection('machinetr').get();
            machinetrSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.id) {
                    machinetrDocMap.set(data.id, doc.id);
                }
            });

            console.log(colors.green(`✓ Found ${machinetrDocMap.size} documents in Firestore`));

            // Filter updates to only those that exist in Firestore
            const validUpdates = updates.filter(update => {
                const firestoreDocId = machinetrDocMap.get(update.id);
                if (firestoreDocId) {
                    update.firestoreDocId = firestoreDocId;
                    return true;
                }
                errors.push({
                    id: update.id,
                    error: 'Document not found in Firestore'
                });
                errorCount++;
                return false;
            });

            console.log(colors.green(`✓ ${validUpdates.length} documents found in Firestore to update`));
            if (errorCount > 0) {
                console.log(colors.yellow(`⚠️  ${errorCount} documents not found in Firestore (skipped)`));
            }

            for (let i = 0; i < validUpdates.length; i += batchSize) {
                const batch = this.db.batch();
                const currentBatch = validUpdates.slice(i, i + batchSize);

                currentBatch.forEach((update, index) => {
                    try {
                        const docRef = this.db.collection('machinetr').doc(update.firestoreDocId);

                        batch.update(docRef, {
                            site: update.newSite,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    } catch (recordError) {
                        errors.push({
                            record: i + index + 1,
                            id: update.id,
                            error: recordError.message
                        });
                        errorCount++;
                    }
                });

                try {
                    await batch.commit();
                    updatedCount += currentBatch.length;
                    const batchNum = Math.floor(i / batchSize) + 1;
                    console.log(colors.green(`✓ Batch ${batchNum} updated: ${updatedCount}/${validUpdates.length} records`));
                } catch (batchError) {
                    const batchNum = Math.floor(i / batchSize) + 1;
                    console.error(colors.red(`✗ Failed to update batch ${batchNum}:`), batchError.message);
                    errorCount += currentBatch.length;
                }
            }

            console.log(colors.cyan('\n🎉 Update Summary:'));
            console.log(colors.green(`   Successfully updated: ${updatedCount} records`));
            if (errorCount > 0) {
                console.log(colors.red(`   Failed updates: ${errorCount} records`));
                if (errors.length > 0) {
                    console.log(colors.yellow('\n⚠️  First 5 errors:'));
                    errors.slice(0, 5).forEach(err => {
                        console.log(colors.red(`    Record ${err.record} (ID: ${err.id}): ${err.error}`));
                    });
                }
            }

            return {
                total: totalRecords,
                updated: updatedCount,
                errors: errorCount,
                errorDetails: errors
            };

        } catch (error) {
            console.error(colors.red('✗ Update failed:'), error.message);
            throw error;
        }
    }

    async run() {
        try {
            console.log(colors.cyan('🔥 Machinetr Site Updater Starting...'));

            if (this.dryRun) {
                console.log(colors.magenta('🔍 Running in DRY RUN mode - no changes will be made\n'));
            }

            const initialized = await this.initialize();
            if (!initialized) {
                process.exit(1);
            }

            // Load data
            this.loadMachineData();
            const machinetrData = this.loadMachinetrData();

            // Prepare updates
            const { updates, noMatch, alreadyHasSite } = this.prepareUpdates(machinetrData);

            // Display summary
            this.displayUpdateSummary(updates, noMatch, alreadyHasSite);

            // Perform updates
            if (updates.length > 0) {
                const result = await this.updateFirestore(updates);
                console.log(colors.cyan('\n✅ Update process completed!'));
                return result;
            } else {
                console.log(colors.blue('\n✓ No updates needed - all records already have correct site values'));
                return {
                    total: 0,
                    updated: 0,
                    errors: 0
                };
            }

        } catch (error) {
            console.error(colors.red('🔥 Fatal error:'), error.message);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    program
        .name('update-machinetr-site')
        .description('Update machinetr collection with site field from machine collection')
        .version('1.0.0')
        .requiredOption('-s, --service-account <path>', 'Path to Firebase service account key file')
        .option('-m, --machine <path>', 'Path to machine.json file', 'machine.json')
        .option('-t, --machinetr <path>', 'Path to machinetr.json file', 'machinetr.json')
        .option('-d, --dry-run', 'Dry run mode - preview changes without updating Firestore', false)
        .parse();

    const options = program.opts();

    const updater = new MachinetrSiteUpdater(
        options.serviceAccount,
        options.machine,
        options.machinetr,
        options.dryRun
    );

    updater.run().catch(console.error);
}

module.exports = MachinetrSiteUpdater;
