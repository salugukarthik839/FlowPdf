import React, { useState } from "react";
const { storage } = require("uxp");
const { app, FitOptions, MeasurementUnits, RulerOrigin } = require("indesign");

// UXP-compatible alert function
const showAlert = (message) => {
  try {
    // Try standard alert first
    if (typeof alert !== "undefined") {
      alert(message);
      return;
    }
  } catch (e) {
    console.log("Standard alert failed:", e);
  }

  try {
    // Try InDesign dialog
    if (app && app.dialogs) {
      app.dialogs
        .add({
          name: "FlowPDF Alert",
          canCancel: false,
          dialogColumns: [
            {
              staticTexts: [
                {
                  staticLabel: message,
                },
              ],
            },
          ],
        })
        .show();
      return;
    }
  } catch (e) {
    console.log("InDesign dialog failed:", e);
  }

  // Fallback to console
  console.log("ALERT:", message);
};

// Rectangle class for geometry
function Rectangle(x, y, width, height) {
  this.x = x;
  this.y = y;
  this.width = width;
  this.height = height;
  this.right = x + width;
  this.bottom = y + height;
}

Rectangle.prototype.intersects = function (other) {
  return !(
    other.x >= this.right ||
    other.right <= this.x ||
    other.y >= this.bottom ||
    other.bottom <= this.y
  );
};

Rectangle.prototype.clone = function () {
  return new Rectangle(this.x, this.y, this.width, this.height);
};

Rectangle.prototype.toString = function () {
  return `[${this.x},${this.y},${this.width},${this.height}]`;
};

Rectangle.prototype.containsRect = function (other) {
  return (
    other.x >= this.x &&
    other.y >= this.y &&
    other.right <= this.right &&
    other.bottom <= this.bottom
  );
};

// Helper: check if two rectangles overlap
function rectsOverlap(r1, r2) {
  return !(
    (
      r2[0] >= r1[2] || // r2 top >= r1 bottom
      r2[2] <= r1[0] || // r2 bottom <= r1 top
      r2[1] >= r1[3] || // r2 left >= r1 right
      r2[3] <= r1[1]
    ) // r2 right <= r1 left
  );
}

function FlowPdf() {
  const [fileItems, setFileItems] = useState([]); // {id, name, size, status: 'pending'|'success'|'failed', error?}
  const [toasts, setToasts] = useState([]); // [{id, message, type: 'success'|'error'|'warning'|'info'}]
  const [uploadHover, setUploadHover] = useState(false);
  const [uploadActive, setUploadActive] = useState(false);
  const [activeTab, setActiveTab] = useState("uploaded"); // 'uploaded' or 'failed'
  const [hoveredTab, setHoveredTab] = useState(null);
  const primaryBlue = "#38bdf8";
  const getTabStyle = (tab) => {
    const isActive = activeTab === tab;
    const isHover = hoveredTab === tab;
    return {
      flex: 1,
      padding: "9px 12px",
      background: isHover ? primaryBlue : isActive ? "#f0faff" : "#ffffff",
      backgroundColor: isHover ? primaryBlue : isActive ? "#f0faff" : "#ffffff",
      backgroundImage: "none",
      border: isHover ? "2px solid transparent" : `2px solid ${primaryBlue}`,
      borderRadius: 20,
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 13,
      color: isHover ? "#ffffff" : primaryBlue,
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
  };
  const getBadgeStyle = (tab) => {
    const isActive = activeTab === tab;
    const isHover = hoveredTab === tab;
    return {
      background: isHover
        ? "rgba(255, 255, 255, 0.2)"
        : isActive
        ? "rgba(56, 189, 248, 0.15)"
        : "#ffffff",
      color: isHover ? "#ffffff" : primaryBlue,
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      minWidth: 20,
      textAlign: "center",
    };
  };
  const handleKeyActivate = (event, handler) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };

  // Toast notification helper
  const showToast = (message, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  const fileClick = async (e) => {
    //setStatusMessage("🔄 Processing files...");
    const fs = require("uxp").storage.localFileSystem;
    const fileEntries = await fs.getFileForOpening({
      types: ["pdf", "png", "jpg", "jpeg"],
      allowMultiple: true,
    });

   //if (
      //!fileEntries ||
      //(Array.isArray(fileEntries) && fileEntries.length === 0)
    //) {
      //setStatusMessage("❌ No files selected");
      //return;
    //}

    if (!app.documents.length) {
      showToast("No active document open in InDesign", "error");
      return;
    }

    const doc = app.activeDocument;
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
    doc.documentPreferences.facingPages = false;

    // Get the current active page
    let currentPage = doc.layoutWindows.item(0).activePage;

    // Margins and page size (all in points)
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
    const columnWidth =
      (usableWidth - columnGutter * (columnCount - 1)) / columnCount;
    const numColumns = columnCount;

    let files = Array.isArray(fileEntries) ? fileEntries : [fileEntries];
    // Sort files by file name (ascending, case-insensitive)
    files = files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    if (files.length > 50) {
      const message =
        "You can only process up to 50 files at a time. Only the first 50 will be used.";
      showToast(message, "warning");
      return;
    }
    const limitedFiles = files.slice(0, 50);

    // Initialize UI with pending items - APPEND to existing items
    const initialItems = limitedFiles.map((f, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      // UXP File entries often expose size; if missing, we'll display "—"
      size: typeof f.size === "number" ? f.size : null,
      status: "pending",
    }));
    setFileItems(prev => [...prev, ...initialItems]);

    let placedCount = 0;
    const successItems = [];
    const failedItems = [];

    // Function to get existing rectangles on a page
    const getExistingRects = (page) => {
      const rects = [];
      for (let i = 0; i < page.rectangles.length; i++) {
        const rect = page.rectangles.item(i);
        const gb = rect.geometricBounds;
        rects.push(gb);
      }
      return rects;
    };

    // Function to try placing a file on a specific page
    const tryPlaceOnPage = async (page, fileEntry, fileWidth, fileHeight) => {
      const usableBottom = pageHeight - bottomMargin;
      const existingRects = getExistingRects(page);
      const columnsNeeded = Math.ceil(fileWidth / columnWidth);

      for (let col = 0; col < numColumns; col++) {
        const columnStart = leftMargin + col * (columnWidth + columnGutter);
        const columnEnd = columnStart + columnsNeeded * columnWidth;

        // 1. Collect and sort rectangles in this column group by top Y
        const rectsInColumn = existingRects
          .filter((rect) => rect[1] < columnEnd && rect[3] > columnStart)
          .sort((a, b) => a[0] - b[0]);

        // 2. Find all vertical gaps in this column group
        let lastBottom = topMargin;
        for (let i = 0; i <= rectsInColumn.length; i++) {
          let nextTop =
            i < rectsInColumn.length
              ? rectsInColumn[i][0]
              : pageHeight - bottomMargin;
          // Only process positive gaps
          if (nextTop > lastBottom) {
            let gapHeight = nextTop - lastBottom;
            if (gapHeight >= fileHeight) {
              for (let offset = 0; offset <= 5; offset += 5) {
                const candidateTop = lastBottom + offset;
                const candidateBottom = candidateTop + fileHeight;
                if (
                  candidateBottom > nextTop ||
                  candidateBottom > pageHeight - bottomMargin
                )
                  continue;
                const candidate = [
                  candidateTop,
                  columnStart,
                  candidateBottom,
                  columnStart + fileWidth,
                ];
                let overlap = false;
                for (const r of existingRects) {
                  if (rectsOverlap(candidate, r)) {
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
                  return true;
                }
              }
            }
          }
          // Always update lastBottom to the bottom of the current rectangle if it is greater
          if (i < rectsInColumn.length && rectsInColumn[i][2] > lastBottom) {
            lastBottom = rectsInColumn[i][2];
          }
        }
      }
      return false;
    };

    const updateItem = (id, data) => {
      setFileItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));
    };

    for (let index = 0; index < limitedFiles.length; index++) {
      const fileEntry = limitedFiles[index];
      const itemId = initialItems[index].id;
      let placed = false;

      // Small delay to show processing one by one (makes UI updates visible)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get original size
      const tempRect = currentPage.rectangles.add({
        geometricBounds: [0, 0, 100, 100],
      });
      await tempRect.place(fileEntry);
      const graphic = tempRect.graphics.item(0);
      const gb = graphic.geometricBounds;
      const fileHeight = gb[2] - gb[0];
      const fileWidth = gb[3] - gb[1];
      tempRect.remove();

      // Try to place on current page first
      placed = await tryPlaceOnPage(
        currentPage,
        fileEntry,
        fileWidth,
        fileHeight
      );

      // If not placed on current page, try all other pages
      if (!placed) {
        // Get the active page index
        const activePageIndex = currentPage.documentOffset;
        // Start from the page after the active page
        for (let i = activePageIndex + 1; i < doc.pages.length; i++) {
          const page = doc.pages.item(i);
          placed = await tryPlaceOnPage(page, fileEntry, fileWidth, fileHeight);
          if (placed) break;
        }
      }

      // If still not placed, check if file can fit on a new page before creating one
      if (!placed) {
        const usableBottom = pageHeight - bottomMargin;
        // Check if file would fit on a blank page
        if (fileHeight <= (usableBottom - topMargin) && fileWidth <= columnWidth) {
          // File CAN fit, so add a new page
          currentPage = doc.pages.add();
          const startColumn = 0; // Start from first column on new page
          const startX = leftMargin + startColumn * columnWidth;
          const candidate = [
            topMargin,
            startX,
            topMargin + fileHeight,
            startX + fileWidth,
          ];
          const rect = currentPage.rectangles.add({
            geometricBounds: candidate,
          });
          await rect.place(fileEntry);
          rect.fit(FitOptions.CONTENT_TO_FRAME);
          placed = true;
        } else {
          // File is too large to fit on any page
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
    // Log for debugging
    console.log(
      "Upload results:",
      { success: successItems.length, failed: failedItems.length }
    );

    const successMessage = `Placed ${placedCount} of ${files.length} files. ${failedItems.length > 0 ? failedItems.length + ' failed.' : ''}`;
    showToast(successMessage, placedCount > 0 ? "success" : "error");
  };

  // Calculate file counts
  const uploadedFiles = fileItems.filter(f => f.status === "success");
  const failedFiles = fileItems.filter(f => f.status === "failed");
  const displayFiles = activeTab === "uploaded" ? uploadedFiles : failedFiles;

  return (
    <div style={{
      background: "#f8f9fa",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Dark Blue Header */}
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

      {/* White Content Area */}
      <div style={{
        flex: 1,
        background: "#ffffff",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Upload Button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 12 }}>
          <div
            role="button"
            tabIndex={0}
            onMouseEnter={() => setUploadHover(true)}
            onMouseLeave={() => { setUploadHover(false); setUploadActive(false); }}
            onMouseDown={() => setUploadActive(true)}
            onMouseUp={() => setUploadActive(false)}
            onClick={fileClick}
            onKeyDown={(event) => handleKeyActivate(event, fileClick)}
            style={{
              padding: "9px 12px",
              background: uploadHover || uploadActive ? primaryBlue : "#ffffff",
              backgroundColor: uploadHover || uploadActive ? primaryBlue : "#ffffff",
              backgroundImage: "none",
              color: uploadHover || uploadActive ? "#ffffff" : primaryBlue,
              borderRadius: 20,
              border: uploadHover || uploadActive ? "2px solid transparent" : `2px solid ${primaryBlue}`,
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

        {/* File List Container - Flex to fill remaining space */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          background: "#fafafa",
          overflow: "hidden",
        }}>
          {/* Tabs Header - Standard Tab Bar Design */}
          <div style={{
            display: "flex",
            background: "#ffffff",
            borderBottom: "2px solid #e5e7eb",
          }}>
            <div
              role="tab"
              tabIndex={0}
              onClick={() => setActiveTab("uploaded")}
              onMouseEnter={() => setHoveredTab("uploaded")}
              onMouseLeave={() => setHoveredTab(null)}
              onKeyDown={(event) => handleKeyActivate(event, () => setActiveTab("uploaded"))}
              style={getTabStyle("uploaded")}
            >
              <span>Uploaded Files </span>
              {uploadedFiles.length > 0 && (
                <span style={getBadgeStyle("uploaded")}>
                  ({uploadedFiles.length})
                </span>
              )}
            </div>
            <div
              role="tab"
              tabIndex={0}
              onClick={() => setActiveTab("failed")}
              onMouseEnter={() => setHoveredTab("failed")}
              onMouseLeave={() => setHoveredTab(null)}
              onKeyDown={(event) => handleKeyActivate(event, () => setActiveTab("failed"))}
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

          {/* File List Content - Scrollable */}
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
              <div
                key={file.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px",
                  borderRadius: 6,
                  background: "#ffffff",
                  border: "1px solid #e8e8e8",
                  marginBottom: 8,
                  transition: "all 150ms ease",
                }}
              >
                {/*<div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: file.status === "failed" 
                    ? "linear-gradient(135deg, #ffebee, #ffcdd2)"
                    : "linear-gradient(135deg, #e3f2fd, #bbdefb)",
                  border: file.status === "failed" ? "1px solid #ef5350" : "1px solid #90caf9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flex: "0 0 auto",
                }}>
                  📄
                </div>*/}
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
                <div style={{
                  fontSize: 16,
                  flex: "0 0 auto",
                }}>
                  {file.status === "success" ? "✅" : file.status === "failed" ? "❌" : "⏳"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Blue Footer */}
      <div style={{
        background: "linear-gradient(135deg, #0c4a6e, #38bdf8)",
        padding: "10px 16px",
        color: "#ffffff",
        fontSize: 11,
        textAlign: "center",
      }}>
        FlowPDF Plugin v1.0
      </div>

      {/* Toast Notifications Container */}
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
        {toasts.map((toast) => {
          const colors = {
            success: { bg: "#10b981", border: "#059669" },
            error: { bg: "#ef4444", border: "#dc2626" },
            warning: { bg: "#f59e0b", border: "#d97706" },
            info: { bg: "#3b82f6", border: "#2563eb" }
          };
          const color = colors[toast.type] || colors.info;

          return (
            <div
              key={toast.id}
              style={{
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
              }}
            >
              <div style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>
                {toast.message}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
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
        })}
      </div>
    </div>
  );
}

export default FlowPdf;
