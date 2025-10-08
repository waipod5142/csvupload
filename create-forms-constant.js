const fs = require('fs');
const colors = require('colors');

/**
 * Convert forms.json to JavaScript constant format
 *
 * Input: forms.json (array of form objects from Firestore)
 * Output: const INSPECTION_FREQUENCIES = { site: { type: 'frequency' } }
 */

class FormsConstantGenerator {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
    }

    readFormsData() {
        try {
            console.log(colors.yellow(`📖 Reading forms data from: ${this.inputPath}`));
            const rawData = fs.readFileSync(this.inputPath, 'utf8');
            const forms = JSON.parse(rawData);

            if (!Array.isArray(forms)) {
                throw new Error('Input file must be a forms array (forms.json), not a mapping object');
            }

            console.log(colors.green(`✅ Loaded ${forms.length} forms`));
            return forms;
        } catch (error) {
            console.error(colors.red('❌ Failed to read forms data:'), error.message);
            throw error;
        }
    }

    createMapping(forms) {
        console.log(colors.yellow('🔄 Creating site/type/frequency mapping...'));

        const mapping = {};
        let processed = 0;
        let skipped = 0;

        forms.forEach(form => {
            const parts = form.id.split('_');

            if (parts.length !== 2) {
                skipped++;
                return;
            }

            const [site, type] = parts;
            const frequency = form.inspection || 'on-demand';

            if (!mapping[site]) {
                mapping[site] = {};
            }

            mapping[site][type] = frequency;
            processed++;
        });

        console.log(colors.blue(`📊 Processed: ${processed} forms, Skipped: ${skipped} forms`));
        return mapping;
    }

    generateConstant(mapping) {
        console.log(colors.yellow('🔄 Generating JavaScript constant...'));

        let output = 'const INSPECTION_FREQUENCIES = {\n';

        const sites = Object.keys(mapping).sort();

        sites.forEach((site, siteIndex) => {
            output += `  ${site}: {\n`;

            const types = Object.keys(mapping[site]).sort();

            types.forEach((type, typeIndex) => {
                const freq = mapping[site][type];
                const comma = typeIndex < types.length - 1 ? ',' : '';
                output += `    ${type}: '${freq}'${comma}\n`;
            });

            const comma = siteIndex < sites.length - 1 ? ',' : '';
            output += `  }${comma}\n`;
        });

        output += '};\n';

        console.log(colors.blue(`✅ Generated constant with ${sites.length} sites`));
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

        // Show first 30 lines
        const lines = content.split('\n').slice(0, 30);
        lines.forEach(line => console.log(colors.white(line)));

        if (content.split('\n').length > 30) {
            console.log(colors.gray('  ...'));
        }

        console.log(colors.gray('─'.repeat(50)));
    }

    run() {
        try {
            console.log(colors.cyan('🚀 Forms Constant Generator Starting...\n'));

            // Read forms data
            const forms = this.readFormsData();

            // Create mapping from forms
            const mapping = this.createMapping(forms);

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
        .name('create-forms-constant')
        .description('Convert forms.json to JavaScript constant')
        .version('1.0.0')
        .option('-i, --input <path>', 'Input forms.json file', 'forms.json')
        .option('-o, --output <path>', 'Output JS constant file', 'forms-constant.js')
        .parse();

    const options = program.opts();

    const generator = new FormsConstantGenerator(
        options.input,
        options.output
    );

    generator.run();
}

module.exports = FormsConstantGenerator;
