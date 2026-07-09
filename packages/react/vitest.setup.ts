// React 19 erwartet dieses Flag in der Testumgebung für act(...).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom implementiert kein Layout: Range.getBoundingClientRect() fehlt komplett
// (anders als Element.getBoundingClientRect, das jsdom mit einem Null-Rect stubt).
// Für Selection-basierte Positionierung (RichText-Toolbar) hier analog nachrüsten.
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    };
  };
}
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function (): DOMRectList {
    return Object.assign([], { item: () => null }) as unknown as DOMRectList;
  };
}
