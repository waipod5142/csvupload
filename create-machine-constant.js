const fs = require('fs');
const colors = require('colors');

/**
 * Transform machine.json into nested bu → type → site → count structure
 *
 * Output: const MACHINE_DATA = { bu: { type: { site: count } } }
 */

class MachineConstantGenerator {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
    }

    readMachineData() {
        try {
            console.log(colors.yellow(`📖 Reading machine data from: ${this.inputPath}`));
            const rawData = fs.readFileSync(this.inputPath, 'utf8');
            const machines = JSON.parse(rawData);
            console.log(colors.green(`✅ Loaded ${machines.length} machines`));
            return machines;
        } catch (error) {
            console.error(colors.red('❌ Failed to read machine data:'), error.message);
            throw error;
        }
    }

    createMapping(machines) {
        console.log(colors.yellow('🔄 Creating bu/type/site/count mapping...'));

        const mapping = {};
        let processed = 0;
        let skipped = 0;

        machines.forEach(machine => {
            const { bu, type, site } = machine;

            // Skip if missing required fields
            if (!bu || !type || !site) {
                skipped++;
                return;
            }

            // Initialize nested structure
            if (!mapping[bu]) {
                mapping[bu] = {};
            }
            if (!mapping[bu][type]) {
                mapping[bu][type] = {};
            }
            if (!mapping[bu][type][site]) {
                mapping[bu][type][site] = 0;
            }

            // Increment count
            mapping[bu][type][site]++;
            processed++;
        });

        console.log(colors.blue(`📊 Processed: ${processed} machines, Skipped: ${skipped} machines`));

        // Display summary
        Object.keys(mapping).sort().forEach(bu => {
            const typeCount = Object.keys(mapping[bu]).length;
            const totalMachines = Object.values(mapping[bu]).reduce((sum, types) =>
                sum + Object.values(types).reduce((s, count) => s + count, 0), 0
            );
            console.log(colors.cyan(`   ${bu}: ${typeCount} types, ${totalMachines} machines`));
        });

        return mapping;
    }

    generateConstant(mapping) {
        console.log(colors.yellow('🔄 Generating JavaScript constant...'));

        let output = 'const MACHINE_DATA = {\n';

        const bus = Object.keys(mapping).sort();

        bus.forEach((bu, buIndex) => {
            output += `  ${bu}: {\n`;

            const types = Object.keys(mapping[bu]).sort();

            types.forEach((type, typeIndex) => {
                output += `    ${type}: {\n`;

                const sites = Object.keys(mapping[bu][type]).sort();

                sites.forEach((site, siteIndex) => {
                    const count = mapping[bu][type][site];
                    const comma = siteIndex < sites.length - 1 ? ',' : '';
                    output += `      ${site}: ${count}${comma}\n`;
                });

                const comma = typeIndex < types.length - 1 ? ',' : '';
                output += `    }${comma}\n`;
            });

            const comma = buIndex < bus.length - 1 ? ',' : '';
            output += `  }${comma}\n`;
        });

        output += '};\n';

        console.log(colors.blue(`✅ Generated constant with ${bus.length} BUs`));
        return output;
    }

    saveConstant(content) {
        try {
            fs.writeFileSync(this.outputPath, content);
            console.log(colors.green(`✅ Constant saved to: ${this.outputPath}`));
            return true;
        } catch (error) {
            console.error(colors.red('❌ Failed to save constant:'), error.message);
            throw error;
        }
    }

    displayPreview(content) {
        console.log(colors.cyan('\n📋 Preview of generated constant:'));
        console.log(colors.gray('─'.repeat(50)));

        // Show first 40 lines
        const lines = content.split('\n').slice(0, 40);
        lines.forEach(line => console.log(colors.white(line)));

        if (content.split('\n').length > 40) {
            console.log(colors.gray('  ...'));
        }

        console.log(colors.gray('─'.repeat(50)));
    }

    run() {
        try {
            console.log(colors.cyan('🚀 Machine Constant Generator Starting...\n'));

            // Read machine data
            const machines = this.readMachineData();

            // Create nested mapping
            const mapping = this.createMapping(machines);

            // Generate JavaScript constant
            const constant = this.generateConstant(mapping);

            // Save to file
            this.saveConstant(constant);

            // Display preview
            this.displayPreview(constant);

            console.log(colors.cyan('\n🎉 Constant generation completed!'));
            return constant;

        } catch (error) {
            console.error(colors.red('💥 Fatal error:'), error.message);
            process.exit(1);
        }
    }
}

// CLI execution
if (require.main === module) {
    const { program } = require('commander');

    program
        .name('create-machine-constant')
        .description('Transform machine.json into bu/type/site/count constant')
        .version('1.0.0')
        .option('-i, --input <path>', 'Input machine.json file', 'machine.json')
        .option('-o, --output <path>', 'Output JS constant file', 'machine-constant.js')
        .parse();

    const options = program.opts();

    const generator = new MachineConstantGenerator(
        options.input,
        options.output
    );

    generator.run();
}

module.exports = MachineConstantGenerator;
