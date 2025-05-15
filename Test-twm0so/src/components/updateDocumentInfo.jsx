import React, { useState, useEffect, useCallback } from "react";

const {
  app,
  UndoModes,
  ScriptLanguage,
  VerticalJustification,
  Justification,
  FitOptions,
} = require("indesign");
const fs = require("uxp").storage.localFileSystem;

const UpdateDocumentInfo = () => {
  const [docInfo, setDocInfo] = useState({
    name: "-",
    columns: "-",
    columnWidth: "-",
    columnGutter: "-",
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [error, setError] = useState("");

  // Function to update document information
  const updateDocumentInfo = useCallback(() => {
    try {
      if (!app) {
        setDocInfo({
          name: "InDesign not available",
          columns: "-",
          columnWidth: "-",
          columnGutter: "-",
        });
        return;
      }
      if (!app.documents) {
        setDocInfo({
          name: "Documents not available",
          columns: "-",
          columnWidth: "-",
          columnGutter: "-",
        });
        return;
      }
      if (app.documents.length > 0) {
        const activeDocument = app.activeDocument;
        if (activeDocument) {
          try {
            const docPrefs = activeDocument.documentPreferences;
            const marginPrefs = activeDocument.marginPreferences;
            if (docPrefs && marginPrefs) {
              const columns = marginPrefs.columnCount || 1;
              const columnGutter = marginPrefs.columnGutter || 0;
              const pageWidth = docPrefs.pageWidth;
              const leftMargin = marginPrefs.left || 0;
              const rightMargin = marginPrefs.right || 0;
              const availableWidth = pageWidth - leftMargin - rightMargin;
              const totalGutterWidth = columnGutter * (columns - 1);
              const columnWidth = (availableWidth - totalGutterWidth) / columns;
              const columnWidthInPoints = Math.round(columnWidth * 100) / 100;
              const columnGutterInPoints = Math.round(columnGutter * 100000) / 100000;
              setDocInfo({
                name: activeDocument.name || "Unnamed document",
                columns,
                columnWidth: `${columnWidthInPoints} pt`,
                columnGutter: `${columnGutterInPoints} pt`,
              });
            } else {
              setDocInfo({
                name: activeDocument.name || "Unnamed document",
                columns: "No preferences available",
                columnWidth: "N/A",
                columnGutter: "N/A",
              });
            }
          } catch (error) {
            setDocInfo({
              name: activeDocument.name || "Unnamed document",
              columns: "Error",
              columnWidth: "Error",
              columnGutter: "Error",
            });
          }
        } else {
          setDocInfo({
            name: "No active document",
            columns: "-",
            columnWidth: "-",
            columnGutter: "-",
          });
        }
      } else {
        setDocInfo({
          name: "No document open",
          columns: "-",
          columnWidth: "-",
          columnGutter: "-",
        });
      }
    } catch (error) {
      setDocInfo({
        name: "Error getting document name",
        columns: "-",
        columnWidth: "-",
        columnGutter: "-",
      });
      setError(error.message || String(error));
    }
  }, []);

  // Select files from explorer
  const selectFilesFromExplorer = async () => {
    let files = [];
    try {
      const result = await fs.getFileForOpening({
        allowMultiple: true,
        types: ["pdf"],
      });
      if (!result || (Array.isArray(result) && result.length === 0)) {
        setSelectedFiles([]);
        return [];
      }
      files = Array.isArray(result) ? result : [result];
      const filesInfo = files.map((file) => ({
        name: file.name,
        path: file.nativePath,
        size: file.size || 0,
        dateModified: file.dateModified || new Date(),
        extension: file.name.split(".").pop().toLowerCase(),
      }));
      setSelectedFiles(filesInfo);
      return filesInfo;
    } catch (e) {
      setError(e.message || String(e));
      return [];
    }
  };

  // Place files in document
  const placeFilesInDocument = async (filesInfo) => {
    try {
      if (!app.documents.length) {
        setError("No active document. Please open a document first.");
        return false;
      }
      const doc = app.activeDocument;
      if (!doc.pages.length) {
        doc.pages.add();
      }
      const firstPage = doc.pages.item(0);
      const marginPrefs = doc.marginPreferences;
      const pageHeight = doc.documentPreferences.pageHeight;
      const pageWidth = doc.documentPreferences.pageWidth;
      const columns = marginPrefs.columnCount || 1;
      const columnGutter = marginPrefs.columnGutter || 0;
      const leftMargin = marginPrefs.left || 0;
      const topMargin = marginPrefs.top || 0;
      const rightMargin = marginPrefs.right || 0;
      const bottomMargin = marginPrefs.bottom || 0;
      const availableWidth = pageWidth - leftMargin - rightMargin;
      const totalGutterWidth = columnGutter * (columns - 1);
      const columnWidth = (availableWidth - totalGutterWidth) / columns;
      const availableHeight = pageHeight - topMargin - bottomMargin;
      let col = 0;
      let y = topMargin;
      for (const fileInfo of filesInfo) {
        if (col >= columns) break;
        const x = leftMargin + col * (columnWidth + columnGutter);
        const rect = firstPage.rectangles.add({
          geometricBounds: [y, x, y + 100, x + columnWidth],
        });
        const file = await fs.getFileForOpening(fileInfo.path);
        rect.place(file);
        rect.fit(FitOptions.FILL_PROPORTIONALLY);
        const gb = rect.geometricBounds;
        const placedHeight = gb[2] - gb[0];
        if (y + placedHeight > topMargin + availableHeight) {
          col++;
          y = topMargin;
          if (col < columns) {
            const newX = leftMargin + col * (columnWidth + columnGutter);
            rect.geometricBounds = [y, newX, y + placedHeight, newX + columnWidth];
            y += placedHeight;
          }
        } else {
          y += placedHeight;
        }
      }
      return true;
    } catch (error) {
      setError(error.message || String(error));
      return false;
    }
  };

  // Create a text frame with FLOWPDF
  const createTextFrame = async () => {
    try {
      if (!app.documents.length) {
        setError("No active document. Please open a document first.");
        return false;
      }
      const doc = app.activeDocument;
      if (!doc.pages.length) {
        doc.pages.add();
      }
      const firstPage = doc.pages.item(0);
      const pageWidth = doc.documentPreferences.pageWidth;
      const pageHeight = doc.documentPreferences.pageHeight;
      const marginPrefs = doc.marginPreferences;
      const columns = marginPrefs.columnCount || 1;
      const columnGutter = marginPrefs.columnGutter || 0;
      const leftMargin = marginPrefs.left || 0;
      const rightMargin = marginPrefs.right || 0;
      const availableWidth = pageWidth - leftMargin - rightMargin;
      const totalGutterWidth = columnGutter * (columns - 1);
      const columnWidth = (availableWidth - totalGutterWidth) / columns;
      const file = await fs.getFileForOpening({
        types: ["pdf"],
        allowMultiple: false,
      });
      if (file) {
        const topMargin = marginPrefs.top || 0;
        const leftMargin = marginPrefs.left || 0;
        const rect = firstPage.rectangles.add({
          geometricBounds: [
            topMargin,
            leftMargin,
            topMargin + pageHeight / 2,
            leftMargin + columnWidth,
          ],
        });
        rect.place(file);
        rect.fit(FitOptions.FILL_PROPORTIONALLY);
      }
      return true;
    } catch (error) {
      setError(error.message || String(error));
      return false;
    }
  };

  // Close button handler
  const handleClose = () => {
    try {
      window.close();
    } catch (error) {
      setError(error.message || String(error));
    }
  };

  // Setup event listeners for InDesign events
  useEffect(() => {
    updateDocumentInfo();
    if (app) {
      app.addEventListener("afterOpen", updateDocumentInfo);
      app.addEventListener("afterClose", updateDocumentInfo);
      app.addEventListener("afterActivate", updateDocumentInfo);
      app.addEventListener("afterSelectionChanged", updateDocumentInfo);
      app.addEventListener("afterAttributeChanged", updateDocumentInfo);
      return () => {
        app.removeEventListener("afterOpen", updateDocumentInfo);
        app.removeEventListener("afterClose", updateDocumentInfo);
        app.removeEventListener("afterActivate", updateDocumentInfo);
        app.removeEventListener("afterSelectionChanged", updateDocumentInfo);
        app.removeEventListener("afterAttributeChanged", updateDocumentInfo);
      };
    }
  }, [updateDocumentInfo]);

  // UI rendering
  return (
    <div className="update-document-info">
      <h2>Document Information</h2>
      <div>
        <strong>Name:</strong> <span>{docInfo.name}</span>
      </div>
      <div>
        <strong>Columns:</strong> <span>{docInfo.columns}</span>
      </div>
      <div>
        <strong>Column Width:</strong> <span>{docInfo.columnWidth}</span>
      </div>
      <div>
        <strong>Column Gutter:</strong> <span>{docInfo.columnGutter}</span>
      </div>
      <div style={{ marginTop: 16 }}>
        <button id="selectFilesButton" onClick={async () => {
          const files = await selectFilesFromExplorer();
          if (files && files.length > 0) {
            await placeFilesInDocument(files);
          }
        }}>
          Select PDF Files and Place
        </button>
        <button id="createTextFrameButton" style={{ marginLeft: 8 }} onClick={createTextFrame}>
          Create Text Frame with PDF
        </button>
        <button id="closeButton" style={{ marginLeft: 8 }} onClick={handleClose}>
          Close
        </button>
      </div>
      <div id="selectedFiles" style={{ marginTop: 16 }}>
        <h3>Selected Files</h3>
        {selectedFiles.length === 0 && <div>No files selected</div>}
        {selectedFiles.map((file, idx) => (
          <div className="selected-file" key={idx}>
            <span className="selected-file-name">{file.name}</span>
            <span className="selected-file-size" style={{ marginLeft: 8 }}>
              {`${(file.size / 1024).toFixed(1)} KB`}
            </span>
          </div>
        ))}
      </div>
      {error && (
        <div style={{ color: "red", marginTop: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
};

export default UpdateDocumentInfo;
