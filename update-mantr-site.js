const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const { program } = require('commander');

class MantrSiteUpdater {
    constructor(serviceAccountPath, employeesJsonPath, mantrJsonPath, dryRun = false) {
        this.serviceAccountPath = serviceAccountPath;
        this.employeesJsonPath = employeesJsonPath;
        this.mantrJsonPath = mantrJsonPath;
        this.dryRun = dryRun;
        this.db = null;
        this.employeeSiteMap = new Map();
    }

    async initialize() {
        try {
            if (!fs.existsSync(this.serviceAccountPath)) {
                throw new Error(`Service account key file not found: ${this.serviceAccountPath}`);
            }

            if (!fs.existsSync(this.employeesJsonPath)) {
                throw new Error(`Employees JSON file not found: ${this.employeesJsonPath}`);
            }

            if (!fs.existsSync(this.mantrJsonPath)) {
                throw new Error(`Mantr JSON file not found: ${this.mantrJsonPath}`);
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

    loadEmployeesData() {
        try {
            console.log(colors.blue('📖 Loading employees.json...'));
            const employeesData = JSON.parse(fs.readFileSync(this.employeesJsonPath, 'utf8'));

            // Create a map of empId to site
            employeesData.forEach(employee => {
                if (employee.empId && employee.site) {
                    this.employeeSiteMap.set(employee.empId, employee.site);
                }
            });

            console.log(colors.green(`✓ Loaded ${this.employeeSiteMap.size} employees with site information`));
            return employeesData;
        } catch (error) {
            console.error(colors.red('✗ Failed to load employees data:'), error.message);
            throw error;
        }
    }

    loadMantrData() {
        try {
            console.log(colors.blue('📖 Loading mantr.json...'));
            const mantrData = JSON.parse(fs.readFileSync(this.mantrJsonPath, 'utf8'));
            console.log(colors.green(`✓ Loaded ${mantrData.length} mantr records`));
            return mantrData;
        } catch (error) {
            console.error(colors.red('✗ Failed to load mantr data:'), error.message);
            throw error;
        }
    }

    prepareUpdates(mantrData) {
        const updates = [];
        const noMatch = [];
        const alreadyHasSite = [];

        mantrData.forEach(mantr => {
            const mantrId = mantr.id;

            if (!mantrId) {
                console.warn(colors.yellow(`⚠️  Mantr record without ID found`));
                return;
            }

            // Look up the site from employees using mantr.id as empId
            const site = this.employeeSiteMap.get(mantrId);

            if (site) {
                // Check if site already exists and is the same
                if (mantr.site === site) {
                    alreadyHasSite.push({
                        id: mantrId,
                        site: site
                    });
                } else {
                    updates.push({
                        id: mantrId,
                        oldSite: mantr.site || 'none',
                        newSite: site,
                        data: mantr
                    });
                }
            } else {
                noMatch.push({
                    id: mantrId,
                    currentSite: mantr.site || 'none',
                    reason: 'No matching employee empId'
                });
            }
        });

        return { updates, noMatch, alreadyHasSite };
    }

    displayUpdateSummary(updates, noMatch, alreadyHasSite) {
        console.log(colors.cyan('\n📊 Update Summary:'));
        console.log(colors.green(`   Records to update: ${updates.length}`));
        console.log(colors.blue(`   Already have correct site: ${alreadyHasSite.length}`));
        console.log(colors.yellow(`   No matching employee found: ${noMatch.length}`));

        if (updates.length > 0) {
            console.log(colors.cyan('\n📝 Sample updates (first 5):'));
            updates.slice(0, 5).forEach(update => {
                console.log(colors.white(`   ID: ${update.id}`));
                console.log(colors.red(`      Old site: ${update.oldSite}`));
                console.log(colors.green(`      New site: ${update.newSite}`));
            });
        }

        if (noMatch.length > 0 && noMatch.length <= 10) {
            console.log(colors.yellow('\n⚠️  Records without matching employee:'));
            noMatch.forEach(item => {
                console.log(colors.yellow(`   ID: ${item.id} - ${item.reason}`));
            });
        } else if (noMatch.length > 10) {
            console.log(colors.yellow(`\n⚠️  ${noMatch.length} records without matching employee (showing first 10):`));
            noMatch.slice(0, 10).forEach(item => {
                console.log(colors.yellow(`   ID: ${item.id} - ${item.reason}`));
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

            console.log(colors.yellow(`\n🚀 Starting update of ${totalRecords} records in collection 'mantr'`));
            console.log(colors.blue('📊 Querying Firestore for matching documents...'));

            // First, we need to query Firestore to find the actual document IDs
            // Build a map of mantr.id to Firestore document ID
            const mantrDocMap = new Map();

            // Query all mantr documents to get their Firestore doc IDs
            const mantrSnapshot = await this.db.collection('mantr').get();
            mantrSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.id) {
                    mantrDocMap.set(data.id, doc.id);
                }
            });

            console.log(colors.green(`✓ Found ${mantrDocMap.size} documents in Firestore`));

            // Filter updates to only those that exist in Firestore
            const validUpdates = updates.filter(update => {
                const firestoreDocId = mantrDocMap.get(update.id);
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
                        const docRef = this.db.collection('mantr').doc(update.firestoreDocId);

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
            console.log(colors.cyan('🔥 Mantr Site Updater Starting...'));
            console.log(colors.cyan('   Matching: employees.empId === mantr.id\n'));

            if (this.dryRun) {
                console.log(colors.magenta('🔍 Running in DRY RUN mode - no changes will be made\n'));
            }

            const initialized = await this.initialize();
            if (!initialized) {
                process.exit(1);
            }

            // Load data
            this.loadEmployeesData();
            const mantrData = this.loadMantrData();

            // Prepare updates
            const { updates, noMatch, alreadyHasSite } = this.prepareUpdates(mantrData);

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
        .name('update-mantr-site')
        .description('Update mantr collection with site field from employees collection (matching employees.empId === mantr.id)')
        .version('1.0.0')
        .requiredOption('-s, --service-account <path>', 'Path to Firebase service account key file')
        .option('-e, --employees <path>', 'Path to employees.json file', 'employees.json')
        .option('-m, --mantr <path>', 'Path to mantr.json file', 'mantr.json')
        .option('-d, --dry-run', 'Dry run mode - preview changes without updating Firestore', false)
        .parse();

    const options = program.opts();

    const updater = new MantrSiteUpdater(
        options.serviceAccount,
        options.employees,
        options.mantr,
        options.dryRun
    );

    updater.run().catch(console.error);
}

module.exports = MantrSiteUpdater;
