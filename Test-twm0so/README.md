# FlowPDF - InDesign Plugin

A powerful Adobe InDesign UXP plugin that streamlines the process of uploading and placing multiple PDF and image files into InDesign documents with intelligent column-based placement.

## Overview

FlowPDF is a React-based InDesign plugin that automates the placement of multiple files (PDF, PNG, JPG, JPEG) into InDesign documents. It features smart column-based placement logic that ensures files are placed sequentially without overlapping, respecting document margins, columns, and existing content.

## Features

### 🚀 Core Functionality
- **Bulk File Upload**: Upload up to 50 files at once
- **Smart Placement**: Automatically places files in columns, moving forward sequentially
- **Document-Aware**: Tracks uploaded files per document, maintaining separate state for each document
- **Template Support**: Distinguishes between template/default files and uploaded files
- **Column Management**: Intelligently fills columns and moves to the next when full
- **Page Creation**: Automatically creates new pages when needed

### 📊 User Interface
- **Tabbed Interface**: Separate views for uploaded and failed files
- **Real-time Status**: Visual indicators for pending, success, and failed uploads
- **Toast Notifications**: User-friendly notifications for upload results
- **File Information**: Displays file names and sizes
- **Error Handling**: Clear error messages for failed uploads

### 🎯 Advanced Features
- **Forward-Only Placement**: Never checks backward, ensuring efficient sequential placement
- **Batch Processing**: Processes multiple files in sequence with progress tracking
- **Deletion Detection**: Automatically detects and handles deleted files
- **Overlap Prevention**: Ensures no files overlap with existing content (template or uploaded)
- **Column Fullness Detection**: Automatically moves to next column when current is full

## Prerequisites

- **Node.js**: v17.0 or below (required for building)
- **Adobe InDesign**: v18.5 or later
- **UXP Developer Tools (UDT)**: For loading and testing the plugin
- **npm** or **yarn**: Package manager

## Installation

### 1. Clone or Download the Project

```bash
git clone <repository-url>
cd FlowPDF
```

### 2. Install Dependencies

```bash
npm install
```

**Optional**: If you prefer Yarn:
```bash
yarn import  # After npm install
```

### 3. Build the Plugin

**For Development** (auto-rebuild on changes):
```bash
npm run watch
```

**For Production** (one-time build):
```bash
npm run build
```

This creates a `dist` folder with the transpiled code.

### 4. Load Plugin in InDesign

1. Open **UXP Developer Tools (UDT)**
2. Ensure InDesign is running and visible under "Connected apps"
3. Add the plugin:
   - Use the `plugin/manifest.json` file to "Add plugin" to the workspace
   - Or select the plugin from the "Create Plugin" dialog
4. Configure the plugin:
   - Go to plugin's action menu (•••)
   - Select `More` → `Advanced`
   - Configure the `/dist` folder as the plugin source
5. Load the plugin:
   - Click `Load` to view the plugin in InDesign
   - (Optional) Click `Watch` to auto-reload on code changes

## Usage

### Basic Workflow

1. **Open InDesign**: Ensure you have an active InDesign document open
2. **Open FlowPDF Panel**: The plugin panel should appear in InDesign
3. **Upload Files**:
   - Click the "Upload" button
   - Select one or more files (PDF, PNG, JPG, JPEG)
   - Files are automatically sorted alphabetically
4. **Monitor Progress**: Watch the real-time status updates
5. **Review Results**: Check the "Uploaded Files" or "Failed Files" tabs

### File Placement Logic

FlowPDF uses intelligent placement logic:

- **Column-Based**: Files are placed sequentially in columns from left to right
- **Forward-Only**: Never checks previous columns or pages
- **Template-Aware**: Respects existing template files, placing new files after them
- **Auto-Advance**: Automatically moves to the next column when current is full
- **Page Creation**: Creates new pages when all columns on current page are full

### Document State Management

- Each document maintains its own state
- Uploaded file tracking is document-specific
- Active column position is saved per document
- Switching documents preserves each document's state independently

## Project Structure

```
FlowPDF/
├── src/
│   ├── components/
│   │   └── FlowPDF.jsx          # Main plugin component
│   ├── controllers/
│   │   └── PanelController.jsx  # Panel controller
│   ├── panels/
│   │   └── Demos.jsx           # Panel demo component
│   ├── index.jsx               # Entry point
│   └── FlowPDF.css             # Styles
├── plugin/
│   ├── manifest.json           # Plugin manifest
│   └── index.html              # Plugin HTML
├── dist/                       # Built files (generated)
├── package.json                # Dependencies and scripts
├── webpack.config.js           # Webpack configuration
└── README.md                   # This file
```

## Development

### Available Scripts

- `npm run watch` - Watch mode for development (auto-rebuild)
- `npm run build` - One-time production build
- `npm run uxp:load` - Load plugin in InDesign
- `npm run uxp:reload` - Reload plugin
- `npm run uxp:watch` - Auto-reload on file changes
- `npm run uxp:debug` - Debug plugin

### Code Architecture

The plugin is built with:
- **React 16.8+**: Component-based UI
- **Custom Hooks**: `useToast`, `useDocumentState` for state management
- **Memoization**: Optimized with `useMemo` and `useCallback`
- **Component Extraction**: Reusable `FileItem` and `Toast` components

### Key Components

- **FlowPDF**: Main component handling file uploads and placement
- **useToast**: Custom hook for notification management
- **useDocumentState**: Custom hook for document-specific state
- **FileItem**: Memoized component for displaying file information
- **Toast**: Memoized component for notifications

## Configuration

### Constants

Key constants can be modified in `src/components/FlowPDF.jsx`:

- `MAX_FILES_PER_BATCH`: Maximum files per upload (default: 50)
- `COLUMN_FULL_THRESHOLD`: Minimum space required in points (default: 50)
- `TOAST_AUTO_DISMISS_MS`: Toast notification duration (default: 5000ms)

## Troubleshooting

### Build Issues

**Problem**: Errors during `npm install`
```bash
# Solution:
rm -rf node_modules
rm package-lock.json
npm install
```

**Problem**: Lockfile conflicts with Yarn
- Delete existing `yarn.lock` if present
- Or continue with npm instead

### Plugin Loading Issues

1. **Plugin not appearing**: 
   - Ensure `/dist` folder is configured correctly in UDT
   - Check that build completed successfully
   - Verify InDesign version is 18.5+

2. **Files not placing**:
   - Ensure document has proper margins and columns configured
   - Check that files are not too large for the page
   - Verify document is not locked or read-only

3. **State not persisting**:
   - Document state is per-document based on document name
   - Switching documents loads the correct state automatically

### Common Errors

- **"No active document open"**: Open an InDesign document first
- **"Could not identify document"**: Ensure document has a valid name
- **"File too large"**: File exceeds page dimensions

## Technical Details

### File Format Support
- PDF (`.pdf`)
- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)

### Placement Algorithm

1. **Initialization**: Detects deleted files and initializes active column
2. **Batch Processing**: Processes files sequentially
3. **Placement Strategy**:
   - Try current page/column first
   - Try forward pages if needed
   - Create new page if necessary
4. **State Update**: Updates document state after each successful placement

### Performance Optimizations

- Memoized computed values
- Callback memoization for event handlers
- Component memoization to prevent unnecessary re-renders
- Efficient batch processing with progress tracking

## Compatibility

- **InDesign**: v18.5+
- **UXP**: v7.1+
- **Node.js**: v17.0 or below (for building)
- **React**: 16.8.6+

## License

Apache-2.0

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns
- Components are properly memoized
- State management uses custom hooks where appropriate
- UI remains consistent with existing design

## Support

For issues, questions, or contributions, please refer to the project repository.

## Version History

- **v1.0.0**: Initial release with core functionality
  - Bulk file upload
  - Column-based placement
  - Document-specific state management
  - Template file awareness

---

**Note**: This plugin requires Adobe InDesign and UXP Developer Tools for development and testing.
