import React from "react";
const { storage } = require("uxp");
const {
  app,
  FitOptions,
  MeasurementUnits,
  RulerOrigin,
} = require("indesign");

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
    r2[0] >= r1[2] || // r2 top >= r1 bottom
    r2[2] <= r1[0] || // r2 bottom <= r1 top
    r2[1] >= r1[3] || // r2 left >= r1 right
    r2[3] <= r1[1]    // r2 right <= r1 left
  );
}

function FlowPdf() {
  const fileClick = async (e) => {
    const fs = require("uxp").storage.localFileSystem;
    const fileEntries = await fs.getFileForOpening({
      types: ["pdf", "png", "jpg", "jpeg"],
      allowMultiple: true,
    });

    if (!fileEntries || (Array.isArray(fileEntries) && fileEntries.length === 0)) {
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
    let currentPage = doc.layoutWindows[0].activePage;

    // Margins and page size (all in points)
    const marginPrefs = doc.marginPreferences;
    const docPrefs = doc.documentPreferences;
    const topMargin = marginPrefs.top || 0;
    const leftMargin = marginPrefs.left || 0;
    const bottomMargin = marginPrefs.bottom || 0;
    const pageWidth = docPrefs.pageWidth;
    const pageHeight = docPrefs.pageHeight;

    // Usable area
    const usableLeft = leftMargin;
    const usableTop = topMargin;
    const usableBottom = pageHeight - bottomMargin;

    const files = Array.isArray(fileEntries) ? fileEntries : [fileEntries];
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
      const existingRects = getExistingRects(page);
      
      for (let x = usableLeft; x < pageWidth; x++) {
        for (let y = usableTop; y + fileHeight <= usableBottom; y++) {
          const candidate = [y, x, y + fileHeight, x + fileWidth];
          
          // Check boundaries
          if (x < leftMargin) continue;
          if (y < topMargin) continue;
          if (y + fileHeight > usableBottom) continue;
          
          // Check for overlaps
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
            rect.fit(FitOptions.NONE);
            return true;
          }
        }
      }
      return false;
    };

    for (const fileEntry of files) {
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
      placed = await tryPlaceOnPage(currentPage, fileEntry, fileWidth, fileHeight);
      
      // If not placed on current page, try all other pages
      if (!placed) {
        for (let i = 0; i < doc.pages.length; i++) {
          const page = doc.pages.item(i);
          if (page === currentPage) continue; // Skip current page as we already tried it
          
          placed = await tryPlaceOnPage(page, fileEntry, fileWidth, fileHeight);
          if (placed) break;
        }
      }

      // If still not placed, add a new page and place it there
      if (!placed) {
        currentPage = doc.pages.add();
        const candidate = [
          usableTop,
          usableLeft,
          usableTop + fileHeight,
          usableLeft + fileWidth,
        ];
        
        if (candidate[2] <= usableBottom) {
          const rect = currentPage.rectangles.add({
            geometricBounds: candidate,
          });
          await rect.place(fileEntry);
          rect.fit(FitOptions.NONE);
          placed = true;
        } else {
          alert(
            `File "${fileEntry.name}" is too large to fit on any page at original size.`
          );
        }
      }

      if (placed) placedCount++;
    }

    alert(
      `Successfully placed ${placedCount} out of ${files.length} file(s) at original size, with no collision.`
    );
  };

  return (
    <div>
      <button onClick={fileClick}>Submit</button>
    </div>
  );
}

export default FlowPdf;
