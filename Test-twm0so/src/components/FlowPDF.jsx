import React, { useState, useRef, useMemo, useCallback } from "react";
const { app, FitOptions, MeasurementUnits, RulerOrigin } = require("indesign");

// Constants
const PRIMARY_BLUE = "#38bdf8";
const MAX_FILES_PER_BATCH = 50;
const COLUMN_FULL_THRESHOLD = 50;
const TOAST_AUTO_DISMISS_MS = 5000;

// Utility: Check if two rectangles overlap
function rectsOverlap(r1, r2) {
  return !(
    r2[0] >= r1[2] || // r2 top >= r1 bottom
    r2[2] <= r1[0] || // r2 bottom <= r1 top
    r2[1] >= r1[3] || // r2 left >= r1 right
    r2[3] <= r1[1]    // r2 right <= r1 left
  );
}

// Custom Hook: Toast notifications
function useToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_AUTO_DISMISS_MS);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}

// Custom Hook: Document-specific state management
function useDocumentState() {
  const [documentData, setDocumentData] = useState({});
  const activeColumnRef = useRef(null);

  const getCurrentDocumentId = useCallback(() => {
    try {
      if (!app.documents.length) return null;
      const doc = app.activeDocument;
      return doc.name || doc.fullName || 'default';
    } catch (e) {
      return null;
    }
  }, []);

  const getAllDocumentIds = useCallback(() => {
    try {
      if (!app.documents.length) return [];
      const docIds = [];
      for (let i = 0; i < app.documents.length; i++) {
        const doc = app.documents.item(i);
        const docId = doc.name || doc.fullName || 'default';
        docIds.push(docId);
      }
      return docIds;
    } catch (e) {
      return [];
    }
  }, []);

  const getUploadedFileNames = useCallback(() => {
    const docId = getCurrentDocumentId();
    if (!docId || !documentData[docId]) return new Set();
    const fileNamesArray = documentData[docId].uploadedFileNames || [];
    return new Set(fileNamesArray);
  }, [documentData, getCurrentDocumentId]);

  const setUploadedFileNames = useCallback((updater) => {
    const docId = getCurrentDocumentId();
    if (!docId) return;

    setDocumentData(prev => {
      const currentArray = prev[docId]?.uploadedFileNames || [];
      const currentSet = new Set(currentArray);
      const newSet = typeof updater === 'function' ? updater(currentSet) : updater;
      const newArray = Array.from(newSet);

      return {
        ...prev,
        [docId]: {
          ...prev[docId],
          uploadedFileNames: newArray
        }
      };
    });
  }, [getCurrentDocumentId]);

  const getActiveColumn = useCallback(() => {
    const docId = getCurrentDocumentId();
    if (!docId || !documentData[docId]) return null;
    return documentData[docId].activeColumn || null;
  }, [documentData, getCurrentDocumentId]);

  const setActiveColumn = useCallback((columnData) => {
    const docId = getCurrentDocumentId();
    if (!docId) return;

    setDocumentData(prev => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        activeColumn: columnData
      }
    }));

    activeColumnRef.current = columnData;
  }, [getCurrentDocumentId]);

  const removeDocumentData = useCallback((docId) => {
    if (!docId) return;
    setDocumentData(prev => {
      const newData = { ...prev };
      delete newData[docId];
      return newData;
    });
  }, []);

  const cleanupRemovedDocuments = useCallback(() => {
    const currentDocIds = getAllDocumentIds();
    setDocumentData(prev => {
      const newData = {};
      let hasChanges = false;
      
      // Keep only data for documents that still exist
      for (const docId in prev) {
        if (currentDocIds.includes(docId)) {
          newData[docId] = prev[docId];
        } else {
          hasChanges = true;
        }
      }
      
      return hasChanges ? newData : prev;
    });
  }, [getAllDocumentIds]);

  return {
    getCurrentDocumentId,
    getAllDocumentIds,
    getUploadedFileNames,
    setUploadedFileNames,
    getActiveColumn,
    setActiveColumn,
    removeDocumentData,
    cleanupRemovedDocuments,
    activeColumnRef
  };
}

// Sub-component: File Item
const FileItem = React.memo(({ file }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px",
    borderRadius: 6,
    background: "#ffffff",
    border: "1px solid #e8e8e8",
    marginBottom: 8,
    transition: "all 150ms ease",
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        overflow: "hidden",
        marginBottom: 2,
      }}>
        {file.name}
      </div>
      <div style={{ fontSize: 10, color: "#757575" }}>
        {typeof file.size === "number" ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : ""}
      </div>
      {file.status === "failed" && file.error && (
        <div style={{
          fontSize: 10,
          color: "#d32f2f",
          marginTop: 3,
          background: "#ffebee",
          padding: "3px 6px",
          borderRadius: 3,
        }}>
          {file.error}
        </div>
      )}
    </div>
    <div style={{ fontSize: 16, flex: "0 0 auto" }}>
      {file.status === "success" ? "✅" : file.status === "failed" ? "❌" : "⏳"}
    </div>
  </div>
));

// Sub-component: Toast
const Toast = React.memo(({ toast, onClose }) => {
  const colors = {
    success: { bg: "#10b981", border: "#059669" },
    error: { bg: "#ef4444", border: "#dc2626" },
    warning: { bg: "#f59e0b", border: "#d97706" },
    info: { bg: "#3b82f6", border: "#2563eb" }
  };
  const color = colors[toast.type] || colors.info;

  return (
    <div style={{
      background: color.bg,
      border: `2px solid ${color.border}`,
      borderRadius: 6,
      padding: "8px 12px",
      boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      gap: 8,
      color: "#ffffff",
      minWidth: 200,
    }}>
      <div style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>
        {toast.message}
      </div>
      <button
        onClick={() => onClose(toast.id)}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "none",
          color: "#ffffff",
          fontSize: 14,
          cursor: "pointer",
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
        }}
        title="Close"
      >
        ×
      </button>
    </div>
  );
});

function FlowPdf() {
  const [fileItems, setFileItems] = useState([]);
  const [uploadHover, setUploadHover] = useState(false);
  const [uploadActive, setUploadActive] = useState(false);
  const [activeTab, setActiveTab] = useState("uploaded");
  const [hoveredTab, setHoveredTab] = useState(null);

  const { toasts, showToast, removeToast } = useToast();
  const {
    getCurrentDocumentId,
    getAllDocumentIds,
    getUploadedFileNames,
    setUploadedFileNames,
    getActiveColumn,
    setActiveColumn,
    removeDocumentData,
    cleanupRemovedDocuments,
    activeColumnRef
  } = useDocumentState();

  // Cleanup document data when documents are closed or activated
  React.useEffect(() => {
    const handleDocumentClose = () => {
      cleanupRemovedDocuments();
    };

    const handleDocumentActivate = () => {
      // Also cleanup when switching documents to ensure stale data is removed
      cleanupRemovedDocuments();
    };

    if (app) {
      app.addEventListener("afterClose", handleDocumentClose);
      app.addEventListener("afterActivate", handleDocumentActivate);
      return () => {
        app.removeEventListener("afterClose", handleDocumentClose);
        app.removeEventListener("afterActivate", handleDocumentActivate);
      };
    }
  }, [cleanupRemovedDocuments]);

  // Memoized file lists
  const uploadedFiles = useMemo(() => 
    fileItems.filter(f => f.status === "success"), 
    [fileItems]
  );
  const failedFiles = useMemo(() => 
    fileItems.filter(f => f.status === "failed"), 
    [fileItems]
  );
  const displayFiles = useMemo(() => 
    activeTab === "uploaded" ? uploadedFiles : failedFiles,
    [activeTab, uploadedFiles, failedFiles]
  );

  // Memoized style functions
  const getTabStyle = useCallback((tab) => {
    const isActive = activeTab === tab;
    const isHover = hoveredTab === tab;
    return {
      flex: 1,
      padding: "9px 12px",
      backgroundColor: isHover ? PRIMARY_BLUE : isActive ? "#f0faff" : "#ffffff",
      border: isHover ? "2px solid transparent" : `2px solid ${PRIMARY_BLUE}`,
      borderRadius: 20,
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 13,
      color: isHover ? "#ffffff" : PRIMARY_BLUE,
      transition: "all 200ms ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      margin: 8,
      outline: "none",
      boxShadow: !isHover && isActive ? "0 0 0 2px rgba(56, 189, 248, 0.25)" : "none",
      boxSizing: "border-box",
      userSelect: "none",
    };
  }, [activeTab, hoveredTab]);

  const getBadgeStyle = useCallback((tab) => {
    const isHover = hoveredTab === tab;
    return {
      color: isHover ? "#ffffff" : PRIMARY_BLUE,
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      minWidth: 20,
      textAlign: "center",
    };
  }, [hoveredTab]);

  // Event handlers
  const handleKeyActivate = useCallback((event, handler) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  }, []);

  const handleTabClick = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  const handleTabMouseEnter = useCallback((tab) => {
    setHoveredTab(tab);
  }, []);

  const handleTabMouseLeave = useCallback(() => {
    setHoveredTab(null);
  }, []);

  const handleUploadMouseEnter = useCallback(() => {
    setUploadHover(true);
  }, []);

  const handleUploadMouseLeave = useCallback(() => {
    setUploadHover(false);
    setUploadActive(false);
  }, []);

  const handleUploadMouseDown = useCallback(() => {
    setUploadActive(true);
  }, []);

  const handleUploadMouseUp = useCallback(() => {
    setUploadActive(false);
  }, []);

  const updateItem = useCallback((id, data) => {
    setFileItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));
  }, []);

  // Main file upload handler
  const fileClick = useCallback(async () => {
    const fs = require("uxp").storage.localFileSystem;
    const fileEntries = await fs.getFileForOpening({
      types: ["pdf", "png", "jpg", "jpeg"],
      allowMultiple: true,
    });

    if (!app.documents.length) {
      showToast("No active document open in InDesign", "error");
      return;
    }

    const doc = app.activeDocument;
    const docId = getCurrentDocumentId();
    if (!docId) {
      showToast("Could not identify document", "error");
      return;
    }

    const savedActiveColumn = getActiveColumn();
    activeColumnRef.current = savedActiveColumn || null;

    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
    doc.documentPreferences.facingPages = false;

    const marginPrefs = doc.marginPreferences;
    const docPrefs = doc.documentPreferences;
    const topMargin = marginPrefs.top || 0;
    const leftMargin = marginPrefs.left || 0;
    const bottomMargin = marginPrefs.bottom || 0;
    const pageWidth = docPrefs.pageWidth;
    const pageHeight = docPrefs.pageHeight;
    const rightMargin = marginPrefs.right || 0;
    const columnGutter = marginPrefs.columnGutter || 0;
    const columnCount = marginPrefs.columnCount || 1;

    const usableWidth = pageWidth - leftMargin - rightMargin;
    const columnWidth = (usableWidth - columnGutter * (columnCount - 1)) / columnCount;
    const numColumns = columnCount;

    let files = Array.isArray(fileEntries) ? fileEntries : [fileEntries];
    files = files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

    if (files.length > MAX_FILES_PER_BATCH) {
      showToast(
        `You can only process up to ${MAX_FILES_PER_BATCH} files at a time. Only the first ${MAX_FILES_PER_BATCH} will be used.`,
        "warning"
      );
      return;
    }

    const limitedFiles = files.slice(0, MAX_FILES_PER_BATCH);
    const initialItems = limitedFiles.map((f, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: typeof f.size === "number" ? f.size : null,
      status: "pending",
    }));

    setFileItems(prev => [...prev, ...initialItems]);

    let placedCount = 0;
    const successItems = [];
    const failedItems = [];

    // Helper functions for file placement
    const detectDeletedFiles = () => {
      const uploadedFileNames = getUploadedFileNames();
      const currentUploadedFiles = new Set();

      for (let i = 0; i < doc.pages.length; i++) {
        const page = doc.pages.item(i);
        for (let j = 0; j < page.rectangles.length; j++) {
          const rect = page.rectangles.item(j);
          try {
            if (rect.graphics && rect.graphics.length > 0) {
              const graphic = rect.graphics.item(0);
              if (graphic.itemLink && graphic.itemLink.name) {
                const fileName = graphic.itemLink.name;
                if (uploadedFileNames.has(fileName)) {
                  currentUploadedFiles.add(fileName);
                }
              }
            }
          } catch (e) {
            // Continue if we can't get file name
          }
        }
      }

      const deletedFiles = Array.from(uploadedFileNames).filter(name => !currentUploadedFiles.has(name));
      if (deletedFiles.length > 0) {
        setUploadedFileNames(prev => {
          const newSet = new Set(prev);
          deletedFiles.forEach(name => newSet.delete(name));
          return newSet;
        });
      }
    };

    const getExistingRects = (page) => {
      const uploadedFileNames = getUploadedFileNames();
      const rects = [];

      for (let i = 0; i < page.rectangles.length; i++) {
        const rect = page.rectangles.item(i);
        const gb = rect.geometricBounds;
        let fileName = null;

        try {
          if (rect.graphics && rect.graphics.length > 0) {
            const graphic = rect.graphics.item(0);
            if (graphic.itemLink && graphic.itemLink.name) {
              fileName = graphic.itemLink.name;
            }
          }
        } catch (e) {
          // Continue if we can't get file name
        }

        rects.push({
          bounds: gb,
          fileName: fileName,
          isUploaded: fileName ? uploadedFileNames.has(fileName) : false
        });
      }

      return rects;
    };

    const updateActiveColumn = () => {
      const activePage = doc.layoutWindows.item(0).activePage;
      const activePageIndex = activePage.documentOffset;
      const currentPage = doc.pages.item(activePageIndex);
      const existingRects = getExistingRects(currentPage);
      const usableBottom = pageHeight - bottomMargin;
      const uploadedRects = existingRects.filter(rect => rect.isUploaded);

      if (uploadedRects.length === 0) {
        setActiveColumn({
          pageIndex: activePageIndex,
          columnIndex: 0,
          bottomY: topMargin
        });
        return;
      }

      let highestColumnIndex = -1;
      let highestColumnBottomY = topMargin - 1;

      for (let col = 0; col < numColumns; col++) {
        const colStart = leftMargin + col * (columnWidth + columnGutter);
        const colEnd = colStart + columnWidth;
        const uploadedRectsInColumn = uploadedRects.filter((rect) => {
          const bounds = rect.bounds;
          return bounds[1] < colEnd && bounds[3] > colStart;
        });

        if (uploadedRectsInColumn.length > 0) {
          let columnBottom = topMargin;
          for (const rect of uploadedRectsInColumn) {
            const bounds = rect.bounds;
            if (bounds[2] > columnBottom) {
              columnBottom = bounds[2];
            }
          }

          if (col > highestColumnIndex || (col === highestColumnIndex && columnBottom > highestColumnBottomY)) {
            highestColumnIndex = col;
            highestColumnBottomY = columnBottom;
          }
        }
      }

      const spaceLeft = usableBottom - highestColumnBottomY;
      const isColumnFull = spaceLeft < COLUMN_FULL_THRESHOLD;

      let columnData;
      if (isColumnFull && highestColumnIndex < numColumns - 1) {
        columnData = {
          pageIndex: activePageIndex,
          columnIndex: highestColumnIndex + 1,
          bottomY: topMargin
        };
      } else if (isColumnFull && highestColumnIndex === numColumns - 1) {
        if (activePageIndex < doc.pages.length - 1) {
          columnData = {
            pageIndex: activePageIndex + 1,
            columnIndex: 0,
            bottomY: topMargin
          };
        } else {
          columnData = {
            pageIndex: activePageIndex,
            columnIndex: highestColumnIndex,
            bottomY: topMargin
          };
        }
      } else {
        columnData = {
          pageIndex: activePageIndex,
          columnIndex: highestColumnIndex,
          bottomY: Math.max(topMargin, highestColumnBottomY)
        };
      }
      setActiveColumn(columnData);
    };

    const tryPlaceOnPage = async (page, fileEntry, fileWidth, fileHeight, startColumn = 0, minY = topMargin) => {
      const usableBottom = pageHeight - bottomMargin;
      const existingRects = getExistingRects(page);
      const columnsNeeded = Math.ceil(fileWidth / columnWidth);

      for (let col = startColumn; col < numColumns; col++) {
        const columnStart = leftMargin + col * (columnWidth + columnGutter);
        const columnEnd = columnStart + columnsNeeded * columnWidth;

        if (columnEnd > pageWidth - rightMargin) {
          continue;
        }

        const rectsInColumn = existingRects
          .filter((rect) => {
            const bounds = rect.bounds;
            return bounds[1] < columnEnd && bounds[3] > columnStart;
          })
          .sort((a, b) => a.bounds[0] - b.bounds[0]);

        let searchStartY = (col === startColumn) ? Math.max(topMargin, minY) : topMargin;
        let lastBottom = searchStartY;

        for (let i = 0; i <= rectsInColumn.length; i++) {
          if (i < rectsInColumn.length && rectsInColumn[i].bounds[2] < searchStartY) {
            lastBottom = Math.max(lastBottom, rectsInColumn[i].bounds[2]);
            continue;
          }

          let nextTop = i < rectsInColumn.length
            ? rectsInColumn[i].bounds[0]
            : pageHeight - bottomMargin;

          if (nextTop > lastBottom && lastBottom >= searchStartY) {
            let gapHeight = nextTop - lastBottom;
            if (gapHeight >= fileHeight) {
              for (let offset = 0; offset <= 5; offset += 5) {
                const candidateTop = lastBottom + offset;
                const candidateBottom = candidateTop + fileHeight;
                if (candidateBottom > nextTop || candidateBottom > pageHeight - bottomMargin) {
                  continue;
                }
                const candidate = [
                  candidateTop,
                  columnStart,
                  candidateBottom,
                  columnStart + fileWidth,
                ];
                let overlap = false;
                for (const r of existingRects) {
                  if (rectsOverlap(candidate, r.bounds)) {
                    overlap = true;
                    break;
                  }
                }
                if (!overlap) {
                  const rect = page.rectangles.add({
                    geometricBounds: candidate,
                  });
                  await rect.place(fileEntry);
                  rect.fit(FitOptions.CONTENT_TO_FRAME);
                  return { success: true, columnIndex: col, bottomY: candidateBottom };
                }
              }
            }
          }
          if (i < rectsInColumn.length && rectsInColumn[i].bounds[2] > lastBottom) {
            lastBottom = rectsInColumn[i].bounds[2];
          }
        }
      }
      return { success: false };
    };

    const checkColumnFullness = (page, columnIndex) => {
      const existingRects = getExistingRects(page);
      const usableBottom = pageHeight - bottomMargin;
      const colStart = leftMargin + columnIndex * (columnWidth + columnGutter);
      const colEnd = colStart + columnWidth;
      const uploadedRectsInColumn = existingRects.filter((rect) => {
        if (!rect.isUploaded) return false;
        const bounds = rect.bounds;
        return bounds[1] < colEnd && bounds[3] > colStart;
      });

      let columnBottom = topMargin;
      for (const rect of uploadedRectsInColumn) {
        const bounds = rect.bounds;
        if (bounds[2] > columnBottom) {
          columnBottom = bounds[2];
        }
      }

      const spaceLeft = usableBottom - columnBottom;
      return spaceLeft < COLUMN_FULL_THRESHOLD;
    };

    detectDeletedFiles();
    updateActiveColumn();

    const initialActiveColumn = activeColumnRef.current || {
      pageIndex: 0,
      columnIndex: 0,
      bottomY: topMargin
    };
    let batchPageIndex = initialActiveColumn.pageIndex;
    let batchColumnIndex = initialActiveColumn.columnIndex;
    let batchMinY = initialActiveColumn.bottomY;

    for (let index = 0; index < limitedFiles.length; index++) {
      const fileEntry = limitedFiles[index];
      const itemId = initialItems[index].id;
      let placed = false;

      await new Promise(resolve => setTimeout(resolve, 100));

      let currentPageIndex = batchPageIndex;
      let currentColumnIndex = batchColumnIndex;
      let currentMinY = batchMinY;

      if (currentPageIndex >= doc.pages.length) {
        currentPageIndex = Math.max(0, doc.pages.length - 1);
        currentColumnIndex = 0;
        currentMinY = topMargin;
      }

      const tempPage = doc.pages.item(0);
      const tempRect = tempPage.rectangles.add({
        geometricBounds: [0, 0, 100, 100],
      });
      await tempRect.place(fileEntry);
      const graphic = tempRect.graphics.item(0);
      const gb = graphic.geometricBounds;
      const fileHeight = gb[2] - gb[0];
      const fileWidth = gb[3] - gb[1];
      tempRect.remove();

      let result = null;
      if (currentPageIndex < doc.pages.length) {
        const pageToTry = doc.pages.item(currentPageIndex);
        result = await tryPlaceOnPage(pageToTry, fileEntry, fileWidth, fileHeight, currentColumnIndex, currentMinY);
        placed = result.success;
      } else {
        placed = false;
      }

      if (placed && result && result.success) {
        setUploadedFileNames(prev => {
          const newSet = new Set(prev);
          newSet.add(fileEntry.name);
          return newSet;
        });
        batchPageIndex = currentPageIndex;
        batchColumnIndex = result.columnIndex;
        batchMinY = result.bottomY;

        if (checkColumnFullness(doc.pages.item(currentPageIndex), batchColumnIndex) && batchColumnIndex < numColumns - 1) {
          batchColumnIndex = batchColumnIndex + 1;
          batchMinY = topMargin;
        }
      }

      if (!placed) {
        for (let i = batchPageIndex + 1; i < doc.pages.length; i++) {
          const page = doc.pages.item(i);
          result = await tryPlaceOnPage(page, fileEntry, fileWidth, fileHeight, 0, topMargin);
          if (result.success) {
            placed = true;
            setUploadedFileNames(prev => {
              const newSet = new Set(prev);
              newSet.add(fileEntry.name);
              return newSet;
            });
            batchPageIndex = i;
            batchColumnIndex = result.columnIndex;
            batchMinY = result.bottomY;

            if (checkColumnFullness(doc.pages.item(i), batchColumnIndex) && batchColumnIndex < numColumns - 1) {
              batchColumnIndex = batchColumnIndex + 1;
              batchMinY = topMargin;
            }
            break;
          }
        }
      }

      if (!placed) {
        const usableBottom = pageHeight - bottomMargin;
        const usableWidth = pageWidth - leftMargin - rightMargin;
        const columnsNeeded = Math.ceil(fileWidth / columnWidth);
        const requiredWidth = columnsNeeded * columnWidth + (columnsNeeded - 1) * columnGutter;
        
        // Check if file can fit on a blank page (height and width)
        if (fileHeight <= (usableBottom - topMargin) && requiredWidth <= usableWidth) {
          // Try to place using tryPlaceOnPage first to ensure proper placement logic
          const newPage = doc.pages.add();
          const newPageIndex = newPage.documentOffset;
          const placementResult = await tryPlaceOnPage(newPage, fileEntry, fileWidth, fileHeight, 0, topMargin);
          
          if (placementResult.success) {
            placed = true;
            setUploadedFileNames(prev => {
              const newSet = new Set(prev);
              newSet.add(fileEntry.name);
              return newSet;
            });

            batchPageIndex = newPageIndex;
            batchColumnIndex = placementResult.columnIndex;
            batchMinY = placementResult.bottomY;

            if (checkColumnFullness(doc.pages.item(newPageIndex), batchColumnIndex) && batchColumnIndex < numColumns - 1) {
              batchColumnIndex = batchColumnIndex + 1;
              batchMinY = topMargin;
            }
          } else {
            // If tryPlaceOnPage failed, remove the page we just created and mark as failed
            newPage.remove();
            const message = "File could not be placed on a new page.";
            failedItems.push({ name: fileEntry.name, error: message });
            updateItem(itemId, { status: "failed", error: message });
          }
        } else {
          const message = "File is too large to fit on any page at original size.";
          failedItems.push({ name: fileEntry.name, error: message });
          updateItem(itemId, { status: "failed", error: message });
        }
      }

      if (placed) {
        placedCount++;
        successItems.push({ name: fileEntry.name });
        updateItem(itemId, { status: "success" });
      }
    }

    setActiveColumn({
      pageIndex: batchPageIndex,
      columnIndex: batchColumnIndex,
      bottomY: batchMinY
    });

    const successMessage = `Placed ${placedCount} of ${files.length} files. ${failedItems.length > 0 ? failedItems.length + ' failed.' : ''}`;
    showToast(successMessage, placedCount > 0 ? "success" : "error");
  }, [getCurrentDocumentId, getActiveColumn, getUploadedFileNames, setUploadedFileNames, setActiveColumn, activeColumnRef, showToast, updateItem]);

  return (
    <div style={{
      background: "#f8f9fa",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #0c4a6e, #38bdf8)",
        padding: "15px 15px",
      }}>
        <h2 style={{
          margin: 0,
          color: "#ffffff",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: 0.3,
        }}>FlowPDF</h2>
      </div>

      <div style={{
        flex: 1,
        background: "#ffffff",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 12 }}>
          <div
            role="button"
            tabIndex={0}
            onMouseEnter={handleUploadMouseEnter}
            onMouseLeave={handleUploadMouseLeave}
            onMouseDown={handleUploadMouseDown}
            onMouseUp={handleUploadMouseUp}
            onClick={fileClick}
            onKeyDown={(event) => handleKeyActivate(event, fileClick)}
            style={{
              padding: "9px 12px",
              backgroundColor: uploadHover || uploadActive ? PRIMARY_BLUE : "#ffffff",
              color: uploadHover || uploadActive ? "#ffffff" : PRIMARY_BLUE,
              borderRadius: 20,
              border: uploadHover || uploadActive ? "2px solid transparent" : `2px solid ${PRIMARY_BLUE}`,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: 0.3,
              transition: "all 200ms ease",
              outline: "none",
              boxShadow: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              userSelect: "none",
            }}
            title="Upload files"
          >
            Upload
          </div>
        </div>

        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          background: "#fafafa",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            background: "#ffffff",
            borderBottom: "2px solid #e5e7eb",
          }}>
            <div
              role="tab"
              tabIndex={0}
              onClick={() => handleTabClick("uploaded")}
              onMouseEnter={() => handleTabMouseEnter("uploaded")}
              onMouseLeave={handleTabMouseLeave}
              onKeyDown={(event) => handleKeyActivate(event, () => handleTabClick("uploaded"))}
              style={getTabStyle("uploaded")}
            >
              <span>Uploaded Files</span>
              {uploadedFiles.length > 0 && (
                <span style={getBadgeStyle("uploaded")}>
                  ({uploadedFiles.length})
                </span>
              )}
            </div>
            <div
              role="tab"
              tabIndex={0}
              onClick={() => handleTabClick("failed")}
              onMouseEnter={() => handleTabMouseEnter("failed")}
              onMouseLeave={handleTabMouseLeave}
              onKeyDown={(event) => handleKeyActivate(event, () => handleTabClick("failed"))}
              style={getTabStyle("failed")}
            >
              <span>Failed Files </span>
              {failedFiles.length > 0 && (
                <span style={getBadgeStyle("failed")}>
                  ({failedFiles.length})
                </span>
              )}
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
          }}>
            {displayFiles.length === 0 && (
              <div style={{
                padding: "40px 20px",
                textAlign: "center",
                fontSize: 13,
              }}>
                {activeTab === "uploaded" ? "No uploaded files yet." : "No failed files."}
              </div>
            )}
            {displayFiles.map((file) => (
              <FileItem key={file.id} file={file} />
            ))}
          </div>
        </div>
      </div>

      <div style={{
        background: "linear-gradient(135deg, #0c4a6e, #38bdf8)",
        padding: "10px 16px",
        color: "#ffffff",
        fontSize: 11,
        textAlign: "center",
      }}>
        FlowPDF Plugin v1.1
      </div>

      <div style={{
        position: "fixed",
        bottom: 20,
        right: -12,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 200,
        width: "100%",
        alignItems: "flex-end",
        paddingRight: 20,
      }}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
}

export default FlowPdf;
