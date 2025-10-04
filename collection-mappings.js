// Collection-specific mappings for reconstructing nested data from flattened CSV

const collectionMappings = {
    vocabulary: {
        // No nested fields mapping needed - choices is already a JSON field
        nestedFields: {}
    },
    
    forms: {
        // Example for forms collection - you can customize this based on your forms structure
        nestedFields: {}
    }
    
    // Add more collections as needed
    // users: {
    //     nestedFields: {
    //         address: {
    //             type: 'object',
    //             pattern: 'address_',
    //             structure: {
    //                 street: 'string',
    //                 city: 'string',
    //                 country: 'string'
    //             }
    //         }
    //     }
    // }
};

class NestedDataReconstructor {
    static reconstructData(flatData, collectionName) {
        const mapping = collectionMappings[collectionName];
        if (!mapping || !mapping.nestedFields) {
            // No mapping defined, return data as-is
            return flatData;
        }

        const reconstructed = { ...flatData };
        
        // Process each nested field definition
        Object.entries(mapping.nestedFields).forEach(([fieldName, config]) => {
            if (config.type === 'object') {
                reconstructed[fieldName] = this.reconstructObject(flatData, config);
            } else if (config.type === 'array') {
                reconstructed[fieldName] = this.reconstructArray(flatData, config);
            }
            
            // Remove flattened columns from the result
            this.removeFlattenedColumns(reconstructed, config.pattern);
        });

        return reconstructed;
    }
    
    static reconstructObject(flatData, config) {
        const result = {};
        const pattern = config.pattern;
        
        // Find all matching columns and extract indices
        const indices = new Set();
        Object.keys(flatData).forEach(key => {
            const match = key.match(new RegExp(pattern.replace('{index}', '(\\d+)')));
            if (match) {
                indices.add(match[1]);
            }
        });
        
        // Reconstruct object with numeric keys
        indices.forEach(index => {
            result[index] = {};
            Object.entries(config.structure).forEach(([prop, type]) => {
                const columnName = pattern.replace('{index}', index) + prop;
                if (flatData[columnName] !== undefined) {
                    result[index][prop] = this.convertType(flatData[columnName], type);
                }
            });
        });
        
        return result;
    }
    
    static reconstructArray(flatData, config) {
        const result = [];
        const pattern = config.pattern;
        
        // Find all matching columns and extract indices
        const indices = new Set();
        Object.keys(flatData).forEach(key => {
            const match = key.match(new RegExp(pattern.replace('{index}', '(\\d+)')));
            if (match) {
                indices.add(parseInt(match[1]));
            }
        });
        
        // Sort indices to maintain order
        const sortedIndices = Array.from(indices).sort((a, b) => a - b);
        
        // Reconstruct array
        sortedIndices.forEach(index => {
            const item = {};
            Object.entries(config.structure).forEach(([prop, type]) => {
                const columnName = pattern.replace('{index}', index) + prop;
                if (flatData[columnName] !== undefined) {
                    item[prop] = this.convertType(flatData[columnName], type);
                }
            });
            result.push(item);
        });
        
        return result;
    }
    
    static removeFlattenedColumns(data, pattern) {
        const regex = new RegExp(pattern.replace('{index}', '\\d+') + '\\w+');
        Object.keys(data).forEach(key => {
            if (regex.test(key)) {
                delete data[key];
            }
        });
    }
    
    static convertType(value, type) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        
        switch (type) {
            case 'boolean':
                return value.toString().toLowerCase() === 'true';
            case 'number':
                return Number(value);
            case 'array':
                try {
                    return JSON.parse(value);
                } catch (e) {
                    return value.split(',').map(item => item.trim());
                }
            case 'string':
            default:
                return value.toString();
        }
    }
}

module.exports = {
    collectionMappings,
    NestedDataReconstructor
};