# Firestore CSV Uploader

A Node.js utility to upload CSV data or Google Sheets data to Google Firestore database with batch processing, data type conversion, and comprehensive error handling.

## Features

- 🔥 **Firebase Admin SDK Integration** - Secure authentication using service account keys
- 🧠 **Intelligent Data Parsing** - Automatic data type conversion (strings, numbers, booleans, dates)
- 📊 **Google Sheets Support** - Direct integration with Google Sheets API v4
- ⚡ **Batch Processing** - Efficient uploads using Firestore batched writes (default: 500 records per batch)
- 🛡️ **Error Handling** - Comprehensive error reporting and recovery
- 🎨 **Colorized Output** - Beautiful console output with progress tracking
- ✅ **Connection Testing** - Validates Firestore connection before upload
- 🔧 **Flexible Usage** - Command-line interface and programmatic API

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Setup

1. **Get Firebase Service Account Key**:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Go to Project Settings > Service Accounts
   - Generate a new private key
   - Save the JSON file as `serviceAccountKey.json`

2. **Prepare your data source**:
   
   **For CSV files:**
   - Place your CSV file in the `data/` directory
   - Ensure the first row contains column headers
   - Supported data types: strings, numbers, booleans (true/false), dates (YYYY-MM-DD)
   
   **For Google Sheets:**
   - Share your Google Sheet with the service account email (found in your serviceAccountKey.json as `client_email`)
   - Give the service account "Viewer" permissions
   - Copy the Google Sheet URL or extract the spreadsheet ID
   - The first row should contain column headers

## Usage

### Command Line Interface

```bash
# Basic CSV usage
node firestore-uploader.js -s serviceAccountKey.json -c data/vn_daily.csv -n machine
node firestore-uploader.js -s serviceAccountKey.json -c data/forms.csv -n forms

# With custom batch size
node firestore-uploader.js -s serviceAccountKey.json -c data/users.csv -n users -b 100

# Google Sheets usage with URL
node firestore-uploader.js -s serviceAccountKey.json -c "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=0" -g -n users

# Google Sheets usage with just the spreadsheet ID
node firestore-uploader.js -s serviceAccountKey.json -c "YOUR_SHEET_ID" -g -n users

# Using npm scripts
npm test                    # Run with default test data
npm run upload -- -s serviceAccountKey.json -c data/users.csv -n users
```

### Programmatic Usage

```javascript
const FirestoreCSVUploader = require('./firestore-uploader');

const uploader = new FirestoreCSVUploader(
    './serviceAccountKey.json',
    './data/users.csv',
    'users'
);

uploader.run().then(result => {
    console.log('Upload completed:', result);
}).catch(error => {
    console.error('Upload failed:', error);
});
```

### Command Line Options

| Option | Description | Required |
|--------|-------------|----------|
| `-s, --service-account <path>` | Path to Firebase service account key file | Yes |
| `-c, --csv <path>` | Path to CSV file or Google Sheets URL | Yes |
| `-g, --google-sheet` | Treat input as Google Sheets URL instead of CSV file | No |
| `-n, --collection <name>` | Firestore collection name | Yes |
| `-d, --doc-id <id>` | Custom document ID (if not provided, auto-generated IDs will be used) | No |
| `-b, --batch-size <size>` | Batch size for uploads (default: 500) | No |
| `-h, --help` | Display help information | No |
| `-V, --version` | Display version number | No |

## Data Type Conversion

The uploader automatically converts CSV string values to appropriate data types:

- **Booleans**: `"true"` → `true`, `"false"` → `false`
- **Numbers**: `"123"` → `123`, `"45.67"` → `45.67`
- **Dates**: `"2023-01-15"` → `Date object`
- **Strings**: Everything else remains as string

## Example CSV Format

```csv
user_id,first_name,last_name,email,age,city,country,join_date,is_active,subscription_type
USR001,John,Doe,john.doe@example.com,28,New York,USA,2023-01-15,true,premium
USR002,Jane,Smith,jane.smith@example.com,32,London,UK,2023-02-20,true,basic
USR003,Carlos,Rodriguez,carlos.rodriguez@example.com,25,Madrid,Spain,2023-03-10,false,premium
```

## Output

The uploader provides detailed progress information:

```
🔥 Firestore CSV Uploader Starting...
✓ Firebase Admin SDK initialized successfully
✓ Firestore connection validated
📊 Parsed 5 records from CSV
🚀 Starting upload of 5 records to collection 'users'
✓ Batch 1 uploaded: 5/5 records

🎉 Upload Summary:
   Successfully uploaded: 5 records

✅ Upload process completed!
```

## Error Handling

- **File not found**: Validates that both service account key and CSV files exist
- **Authentication errors**: Detailed Firebase authentication error messages
- **Firestore errors**: Batch-level and record-level error reporting
- **CSV parsing errors**: Invalid format or encoding issues
- **Network errors**: Connection timeout and retry information

## File Structure

```
firestore-csv-uploader/
├── firestore-uploader.js      # Main uploader class
├── test-uploader.js           # Test script
├── serviceAccountKey.json     # Firebase service account (not in repo)
├── data/
│   └── users.csv             # Sample CSV data
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## Security Notes

- **Never commit** your `serviceAccountKey.json` to version control
- Store service account keys securely
- Use environment variables for sensitive data in production
- Ensure proper Firestore security rules are configured

## Troubleshooting

### Common Issues

1. **"Service account key file not found"**
   - Verify the path to your service account key file
   - Ensure the file exists and has proper read permissions

2. **"CSV file not found"**
   - Check the CSV file path
   - Verify file exists and is readable

3. **"Permission denied"**
   - Verify your service account has Firestore write permissions
   - Check Firebase project configuration

4. **"Collection name is invalid"**
   - Ensure collection names follow Firestore naming rules
   - Avoid reserved names or special characters

### Getting Help

If you encounter issues:
1. Check the error messages in the console output
2. Verify your Firebase project settings
3. Test with the included sample data first
4. Ensure all dependencies are installed correctly

## Downloading Collections

You can now download and view your Firestore collections in JSON format:

### Quick Commands

```bash
# View vocabulary collection
npm run view-vocabulary

# View forms collection  
npm run view-form

# View any collection
node firestore-downloader.js -s serviceAccountKey.json -c your_collection_name

# Save to file
node firestore-downloader.js -s serviceAccountKey.json -c machinetr -o machinetr.json
node firestore-downloader.js -s serviceAccountKey.json -c vocabulary -o vocabulary.json
```
# To down load
   # Download machine data:
node firestore-downloader.js -s serviceAccountKey.json -c machine -o machine.json
   Generate JavaScript constant:
node create-machine-constant.js -i machine.json -o machine-constant.js


   # Download forms from Firestore
node firestore-downloader.js -s serviceAccountKey.json -c forms -o forms.json
   # Convert to JavaScript constant:
node create-forms-constant.js -i forms.json -o forms-constant.js
   Output Files

# updated the machinetr collection in Firestore by injecting the site field from the machine collection. machinetr.id === machine.id and machinetr.bu === machine.bu and machinetr.type === machine.type

node update-machinetr-site.js -s serviceAccountKey.json -m machine.json -t machinetr.json


Created update-mantr-site.js. The script:
Matches employees.empId with mantr.id to update the site field
Supports dry-run mode to preview changes
Processes updates in batches of 500 records
Provides detailed logging and error handling
Usage:
# Preview changes (dry run)
node update-mantr-site.js -s serviceAccountKey.json --dry-run

# Execute updates
node update-mantr-site.js -s serviceAccountKey.json

# Custom file paths
node update-mantr-site.js -s serviceAccountKey.json -e employees.json -m mantr.json


### Download Command Options

| Option | Description | Required |
|--------|-------------|----------|
| `-s, --service-account <path>` | Path to Firebase service account key file | Yes |
| `-c, --collection <name>` | Firestore collection name to download | Yes |
| `-o, --output <path>` | Output JSON file path (if not provided, prints to console) | No |

### Example Output

The downloader converts your Firestore documents to clean JSON format:

```json
[
  {
    "id": "th",
    "accept": "มาตรฐานการยอมรับ",
    "bu": "th", 
    "howto": "วิธีการตรวจสอบ",
    "inspector": "ผู้ตรวจสอบ",
    "choices": [
      {
        "colorClass": "bg-green-400",
        "text": "ผ่าน",
        "value": "pass"
      }
    ],
    "uploadedAt": "2025-07-22T15:47:42.555Z"
  }
]
```

## License

ISC

## Version

1.0.0# csvupload
