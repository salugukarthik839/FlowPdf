import React, { useState } from "react";
const { storage } = require("uxp");
const { app, FitOptions, MeasurementUnits, RulerOrigin } = require("indesign");

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
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileClick = async (e) => {
    //  setUploadedFiles(["karthik", "salugu"]);
    const fs = require("uxp").storage.localFileSystem;
    const fileEntries = await fs.getFileForOpening({
      types: ["pdf", "png", "jpg", "jpeg"],
      allowMultiple: true,
    });

    if (
      !fileEntries ||
      (Array.isArray(fileEntries) && fileEntries.length === 0)
    ) {
      alert("No files selected");
      return;
    }

    if (!app.documents.length) {
      alert("No active document open in InDesign.");
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
      alert(
        "You can only process up to 50 files at a time. Only the first 50 will be used."
      );
    }
    const limitedFiles = files.slice(0, 50);

    let placedCount = 0;

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

    for (const fileEntry of limitedFiles) {
      let placed = false;

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

      // If still not placed, add a new page and place it there
      if (!placed) {
        currentPage = doc.pages.add();
        const startColumn = 0; // Start from first column on new page
        const startX = leftMargin + startColumn * columnWidth;
        const candidate = [
          topMargin,
          startX,
          topMargin + fileHeight,
          startX + fileWidth,
        ];
        const usableBottom = pageHeight - bottomMargin;
        if (candidate[2] <= usableBottom) {
          const rect = currentPage.rectangles.add({
            geometricBounds: candidate,
          });
          await rect.place(fileEntry);
          rect.fit(FitOptions.CONTENT_TO_FRAME);
          placed = true;
        } else {
          alert(
            `File "${fileEntry.name}" is too large to fit on any page at original size.`
          );
        }
      }

      if (placed) placedCount++;
    }
    // Log for debugging
    console.log(
      "Setting uploaded files:",
      limitedFiles.map((f) => f.name)
    );
    setTimeout(() => {
      setUploadedFiles(limitedFiles.map((f) => f.name));
    }, 0);

    alert(
      `Successfully placed ${placedCount} out of ${files.length} file(s) at original size, with no collision.`
    );
  };

  return (
    <div>
      <button onClick={fileClick}>Upload</button>
      <div style={{ marginTop: 8 }}>
        <label>Uploaded Files ({uploadedFiles.length}):</label>
        <div
          style={{
            maxHeight: 220, // or whatever fits your panel
            overflowY: "auto",
            background: "#222",
            borderRadius: 4,
            padding: "8px 4px",
            marginTop: 4,
            border: "1px solid #444",
          }}
        >
          <ul style={{ margin: 0, padding: 0, listStyle: "decimal inside" }}>
            {uploadedFiles.map((name, idx) => (
              <li
                key={idx}
                style={{
                  color: "#fff",
                  fontSize: 13,
                  marginBottom: 2,
                  wordBreak: "break-all",
                  background: "none",
                  border: "none",
                  padding: 0,
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default FlowPdf;
