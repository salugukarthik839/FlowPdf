import React, { useState, useRef, useMemo, useCallback } from "react";
const { app, FitOptions, MeasurementUnits, RulerOrigin } = require("indesign");

// Constants
const PRIMARY_BLUE = "#38bdf8";
const MAX_FILES_PER_BATCH = 50;
const COLUMN_FULL_THRESHOLD = 50;
const TOAST_AUTO_DISMISS_MS = 5000;

const ICON_ARROW_POINTS = [
  [10.029, 5],
  [0, 5],
  [0, 12.967],
  [10.029, 12.967],
  [10.029, 18],
  [19.99, 8.952],
  [10.029, 0],
];
const ICON_ARROW_CENTER_X = 9.995;
const ICON_ARROW_CENTER_Y = 9;
const ICON_ARROW_WIDTH = 19.99;
const ICON_ARROW_HEIGHT = 18;
const ICON_ARROW_SCALE = 1.25;
const ARROW_HEIGHT_PT = ICON_ARROW_HEIGHT * ICON_ARROW_SCALE;
const ARROW_VERTICAL_GAP = 0;
const FLOW_ARROW_LABEL = "FlowPDFArrow";

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
  const [isInsertingArrow, setIsInsertingArrow] = useState(false);

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

  const insertArrowShape = useCallback(async () => {
    if (isInsertingArrow) {
      return;
    }
    setIsInsertingArrow(true);
    try {
      if (!app.documents.length) {
        showToast("No active document open. Please open a document first.", "error");
        return;
      }

      const doc = app.activeDocument;
      if (!doc || !doc.pages || doc.pages.length === 0) {
        showToast("Document has no pages. Please add a page first.", "error");
        return;
      }

      const getPageByIndex = (pages, index) => {
        if (!pages) return null;
        try {
          if (typeof pages.item === "function") return pages.item(index);
          return pages[index];
        } catch (e) {
          return null;
        }
      };

      const computeBestSpotOnPage = (page, pageIndex) => {
        try {
          const marginPrefs = page.marginPreferences;
          const bounds = page.bounds;
          const topMargin = marginPrefs.top || 0;
          const bottomMargin = (marginPrefs.bottom !== undefined ? marginPrefs.bottom : marginPrefs.bottomMargin) || 0;
          const leftMargin = marginPrefs.left || 0;
          const rightMargin = marginPrefs.right || 0;
          const columnCount = Math.max(1, marginPrefs.columnCount || 1);
          const columnGutter = marginPrefs.columnGutter || 0;

          const contentTop = bounds[0] + topMargin;
          const contentBottom = bounds[2] - bottomMargin;
          const contentLeft = bounds[1] + leftMargin;
          const contentRight = bounds[3] - rightMargin;
          const usableWidth = contentRight - contentLeft;
          const columnWidth = (usableWidth - columnGutter * (columnCount - 1)) / columnCount;
          if (columnWidth <= 0) return null;

          const columnSpan = columnWidth + columnGutter;
          const columnStarts = Array.from({ length: columnCount }, (_, idx) => contentLeft + idx * columnSpan);
          const columnItems = Array.from({ length: columnCount }, () => []);

          const pageItems = page.pageItems;
          const pageItemCount = typeof pageItems.length === "number" ? pageItems.length : pageItems.count();
          for (let i = 0; i < pageItemCount; i++) {
            let item = null;
            try {
              item = typeof pageItems.item === "function" ? pageItems.item(i) : pageItems[i];
            } catch (e) {
              continue;
            }
            if (!item) continue;
            let gb = null;
            try {
              gb = item.geometricBounds;
            } catch (e) {
              continue;
            }
            if (!gb || gb.length < 4) continue;
            const itemBottom = gb[2];
            const itemTop = gb[0];
            const itemCenterX = (gb[1] + gb[3]) / 2;
            if (itemBottom <= contentTop) continue;

            const relativeX = itemCenterX - contentLeft;
            let columnIndex = Math.floor(relativeX / columnSpan);
            if (isNaN(columnIndex)) columnIndex = 0;
            columnIndex = Math.max(0, Math.min(columnCount - 1, columnIndex));
            columnItems[columnIndex].push({
              top: itemTop,
              bottom: itemBottom
            });
          }

          let bestOnPage = null;
          const columnCandidates = Array(columnCount).fill(null);
          for (let col = 0; col < columnCount; col++) {
            const items = columnItems[col].sort((a, b) => a.top - b.top);
            let cursor = contentTop;
            let columnCandidate = null;

            for (const item of items) {
              const gapHeight = item.top - cursor;
              if (gapHeight >= ARROW_HEIGHT_PT) {
                columnCandidate = {
                  page,
                  pageIndex,
                  columnIndex: col,
                  top: cursor,
                  centerX: columnStarts[col] + ICON_ARROW_CENTER_X * ICON_ARROW_SCALE,
                  y: cursor + ARROW_HEIGHT_PT / 2,
                  bottom: cursor + ARROW_HEIGHT_PT,
                };
              }
              cursor = Math.max(cursor, item.bottom + ARROW_VERTICAL_GAP);
            }

            if (!columnCandidate && cursor + ARROW_HEIGHT_PT <= contentBottom) {
              columnCandidate = {
                page,
                pageIndex,
                columnIndex: col,
                top: cursor,
                centerX: columnStarts[col] + ICON_ARROW_CENTER_X * ICON_ARROW_SCALE,
                y: cursor + ARROW_HEIGHT_PT / 2,
                bottom: cursor + ARROW_HEIGHT_PT,
              };
            }

            if (!columnCandidate) continue;

            columnCandidates[col] = columnCandidate;
          }

          for (let col = 0; col < columnCount; col++) {
            const candidate = columnCandidates[col];
            if (!candidate) continue;
            if (!bestOnPage || candidate.top > bestOnPage.top) {
              bestOnPage = candidate;
            }
            break;
          }
          return bestOnPage;
        } catch (e) {
          console.log("Could not compute placement spot on page", e);
        }
        return null;
      };

      const findSpot = () => {
        const totalPages = typeof doc.pages.length === "number" ? doc.pages.length : doc.pages.count();
        let bestSpot = null;
        for (let idx = 0; idx < totalPages; idx++) {
          const page = getPageByIndex(doc.pages, idx);
          if (!page) continue;
          const spot = computeBestSpotOnPage(page, idx);
          if (!spot) continue;
          if (
            !bestSpot ||
            spot.pageIndex < bestSpot.pageIndex ||
            (spot.pageIndex === bestSpot.pageIndex && spot.columnIndex < bestSpot.columnIndex) ||
            (spot.pageIndex === bestSpot.pageIndex && spot.columnIndex === bestSpot.columnIndex && spot.top > bestSpot.top)
          ) {
            bestSpot = spot;
          }
        }
        return bestSpot;
      };

      let spot = findSpot();
      if (!spot && activeColumnRef.current) {
        try {
          const fallback = activeColumnRef.current;
          const targetPageIndex = Math.min(fallback.pageIndex || 0, (doc.pages.length || 1) - 1);
          const fallbackPage = doc.pages.item(targetPageIndex);
          const fallbackBounds = fallbackPage.bounds;
          const fallbackMargins = fallbackPage.marginPreferences;
          const fallbackLeftMargin = fallbackMargins.left || 0;
          const fallbackTop = fallback.bottomY || ((fallbackBounds[0] || 0) + (fallbackMargins.top || 0));

          spot = {
            page: fallbackPage,
            pageIndex: targetPageIndex,
            columnIndex: fallback.columnIndex || 0,
            top: fallbackTop,
            centerX: (fallbackBounds[1] + fallbackLeftMargin) + ICON_ARROW_CENTER_X * ICON_ARROW_SCALE,
            y: fallbackTop + ARROW_HEIGHT_PT / 2,
            bottom: fallbackTop + ARROW_HEIGHT_PT,
          };
        } catch (e) {
          console.log("Fallback spot creation failed", e);
        }
      }
      const spread = spot ? (spot.page.parent || doc.activeSpread) : null;
      if (!spot || !spread) {
        showToast("No free column slot available to place the arrow.", "warning");
        return;
      }

      let activeLayer = null;
      try {
        activeLayer = doc.activeLayer;
      } catch (e) {
        console.log("doc.activeLayer lookup failed", e);
      }
      if (!activeLayer) {
        try {
          activeLayer = spread.activeLayer;
        } catch (e) {
          console.log("spread.activeLayer lookup failed", e);
        }
      }
      if (!activeLayer && doc.layers) {
        try {
          if (typeof doc.layers.item === "function" && doc.layers.length > 0) {
            activeLayer = doc.layers.item(0);
          } else if (doc.layers[0]) {
            activeLayer = doc.layers[0];
          }
        } catch (e) {
          console.log("doc.layers lookup failed", e);
        }
      }
      if (!activeLayer) {
        showToast("Could not access a document layer for placement.", "error");
        return;
      }

      const arrow = spread.polygons.add(activeLayer);
      const arrowPoints = ICON_ARROW_POINTS.map(([px, py]) => [
        spot.centerX + (px - ICON_ARROW_CENTER_X) * ICON_ARROW_SCALE,
        spot.y + (py - ICON_ARROW_CENTER_Y) * ICON_ARROW_SCALE,
      ]);

      try {
        arrow.paths.item(0).entirePath = arrowPoints;
        arrow.paths.item(0).closed = true;
      } catch (e) {
        console.log("Could not set arrow path", e);
      }

      try {
        arrow.fillColor = doc.swatches.item("Black");
      } catch (e) {
        console.log("Using default fill color");
      }

      try {
        arrow.strokeWeight = 0;
      } catch (e) {
        // ignore
      }

      try {
        if (typeof arrow.select === "function") {
          arrow.select();
        }
      } catch (e) {
        console.log("Could not select arrow", e);
      }

      try {
        arrow.label = FLOW_ARROW_LABEL;
      } catch (e) {
        console.log("Could not label arrow", e);
      }
    } catch (error) {
      console.error("Error inserting arrow:", error);
      showToast("Failed to insert arrow: " + (error.message || "Unknown error"), "error");
    } finally {
      setIsInsertingArrow(false);
    }
  }, [isInsertingArrow, showToast]);

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

    const collectArrowAnchors = () => {
      const anchors = [];
      const totalPages = typeof doc.pages.length === "number" ? doc.pages.length : doc.pages.count();
      const columnSpan = columnWidth + columnGutter;
      if (columnSpan <= 0) {
        return anchors;
      }

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const page = doc.pages.item(pageIndex);
        const pageItems = page.pageItems;
        const itemCount = typeof pageItems.length === "number" ? pageItems.length : pageItems.count();
        for (let i = 0; i < itemCount; i++) {
          let item = null;
          try {
            item = typeof pageItems.item === "function" ? pageItems.item(i) : pageItems[i];
          } catch (e) {
            continue;
          }
          if (!item || item.label !== FLOW_ARROW_LABEL) continue;

          let bounds = null;
          try {
            bounds = item.geometricBounds;
          } catch (e) {
            continue;
          }
          if (!bounds || bounds.length < 4) continue;

          const pageBounds = page.bounds;
          const contentLeft = (pageBounds[1] || 0) + leftMargin;
          let relativeX = bounds[1] - contentLeft;
          let columnIndex = Math.floor(relativeX / columnSpan);
          if (isNaN(columnIndex)) columnIndex = 0;
          columnIndex = Math.max(0, Math.min(numColumns - 1, columnIndex));

          anchors.push({
            pageIndex,
            columnIndex,
            top: bounds[0],
            polygon: item
          });
        }
      }

      anchors.sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        return a.top - b.top;
      });

      return anchors;
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

    const tryPlaceOnPage = async (page, fileEntry, fileWidth, fileHeight, startColumn = 0, minY = topMargin, onlyColumn = null) => {
      const usableBottom = pageHeight - bottomMargin;
      const existingRects = getExistingRects(page);
      const columnsNeeded = Math.ceil(fileWidth / columnWidth);

      const columnIndices = onlyColumn !== null
        ? [onlyColumn]
        : Array.from({ length: numColumns - startColumn }, (_, idx) => startColumn + idx);

      for (const col of columnIndices) {
        if (col < 0 || col >= numColumns) continue;
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
    const removeAnchorPolygon = (anchor) => {
      try {
        if (anchor && anchor.polygon) {
          anchor.polygon.remove();
        }
      } catch (e) {
        // ignore
      }
    };

    let arrowAnchors = collectArrowAnchors()
      .filter(anchor => {
        try {
          const gb = anchor.polygon.geometricBounds;
          if (!gb || gb.length < 4) return false;
          return gb[0] < gb[2] && gb[1] < gb[3];
        } catch (e) {
          return false;
        }
      })
      .sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex;
        return a.top - b.top;
      });

    let nextAnchorStart = null;
    if (arrowAnchors.length > 0) {
      const firstAnchor = arrowAnchors[0];
      const anchorPageIndex = Math.min(firstAnchor.pageIndex, doc.pages.length - 1);
      nextAnchorStart = {
        pageIndex: anchorPageIndex,
        columnIndex: firstAnchor.columnIndex,
        bottomY: Math.max(topMargin, firstAnchor.top),
      };
      activeColumnRef.current = nextAnchorStart;

      arrowAnchors = arrowAnchors.filter((anchor, idx) => {
        const isOverlap =
          idx !== 0 &&
          anchor.pageIndex === anchorPageIndex &&
          anchor.columnIndex === firstAnchor.columnIndex &&
          anchor.top <= nextAnchorStart.bottomY;
        if (isOverlap) {
          removeAnchorPolygon(anchor);
          return false;
        }
        return true;
      });
    }

    const removeOverlappingAnchors = (pageIndex, columnIndex, top, bottom) => {
      arrowAnchors = arrowAnchors.filter(anchor => {
        const anchorBottom = anchor.top + ARROW_HEIGHT_PT;
        const overlaps =
          anchor.pageIndex === pageIndex &&
          anchor.columnIndex === columnIndex &&
          Math.max(top, anchor.top) < Math.min(bottom, anchorBottom);
        if (overlaps) {
          removeAnchorPolygon(anchor);
          return false;
        }
        return true;
      });
    };

    let initialActiveColumn = activeColumnRef.current || {
      pageIndex: 0,
      columnIndex: 0,
      bottomY: topMargin
    };
    let batchPageIndex = nextAnchorStart ? nextAnchorStart.pageIndex : initialActiveColumn.pageIndex;
    let batchColumnIndex = nextAnchorStart ? nextAnchorStart.columnIndex : initialActiveColumn.columnIndex;
    let batchMinY = nextAnchorStart ? nextAnchorStart.bottomY : initialActiveColumn.bottomY;
    let anchorUsedThisBatch = false;

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

      if (!placed && !anchorUsedThisBatch && arrowAnchors.length > 0) {
        anchorUsedThisBatch = true;
        const anchor = arrowAnchors.shift();
        const anchorPageIndex = Math.min(anchor.pageIndex, doc.pages.length - 1);

        currentPageIndex = anchorPageIndex;
        currentColumnIndex = anchor.columnIndex;
        currentMinY = Math.max(topMargin, anchor.top);

        const anchorPage = doc.pages.item(anchorPageIndex);
        const anchorResult = await tryPlaceOnPage(
          anchorPage,
          fileEntry,
          fileWidth,
          fileHeight,
          anchor.columnIndex,
          currentMinY,
          anchor.columnIndex
        );

        let anchorConsumed = false;
        if (anchorResult.success) {
          placed = true;
          result = anchorResult;
          anchorConsumed = true;
        } else {
          let fallbackResult = { success: false };
          const fallbackStartColumn = anchor.columnIndex + 1;
          if (fallbackStartColumn < numColumns) {
            fallbackResult = await tryPlaceOnPage(
              anchorPage,
              fileEntry,
              fileWidth,
              fileHeight,
              fallbackStartColumn,
              topMargin,
              null
            );
          }

          if (fallbackResult.success) {
            placed = true;
            result = fallbackResult;
            anchorConsumed = true;
          } else {
            removeAnchorPolygon(anchor);
            currentPageIndex = anchorPageIndex + 1;
            currentColumnIndex = 0;
            currentMinY = topMargin;
            showToast("Arrow location could not fit the file. Placing in the next available slot.", "warning");
          }
        }

        if (anchorConsumed) {
          removeAnchorPolygon(anchor);
        }
      }

      if (!placed && currentPageIndex < doc.pages.length) {
        const pageToTry = doc.pages.item(currentPageIndex);
        result = await tryPlaceOnPage(pageToTry, fileEntry, fileWidth, fileHeight, currentColumnIndex, currentMinY);
        placed = result.success;
      } else if (!placed) {
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

        const placedTop = result.bottomY - fileHeight;
        removeOverlappingAnchors(currentPageIndex, result.columnIndex, placedTop, result.bottomY);

        if (checkColumnFullness(doc.pages.item(currentPageIndex), batchColumnIndex) && batchColumnIndex < numColumns - 1) {
          batchColumnIndex = batchColumnIndex + 1;
          batchMinY = topMargin;
        } else {
          batchMinY = result.bottomY;
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div
            role="button"
            tabIndex={0}
            onClick={insertArrowShape}
            onKeyDown={(event) => handleKeyActivate(event, insertArrowShape)}
            style={{
              width: 42,
              height: 42,
              backgroundColor: isInsertingArrow ? "#cfeffc" : "#f5f5f5",
              border: "1px solid #d0d0d0",
              borderRadius: 8,
              cursor: isInsertingArrow ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 150ms ease",
              opacity: isInsertingArrow ? 0.6 : 1,
            }}
            title="Insert arrow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="19.99" height="18" style={{ fill: "#000000" }}>
              <path d="M10.029 5H0v7.967h10.029V18l9.961-9.048L10.029 0v5z" />
            </svg>
          </div>
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
