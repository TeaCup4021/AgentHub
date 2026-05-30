import "@testing-library/jest-dom/vitest";

// jsdom 未实现的浏览器 API
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: class IntersectionObserver {
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
  },
  writable: true,
});

Object.defineProperty(globalThis, "ResizeObserver", {
  value: class ResizeObserver {
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
  },
  writable: true,
});

// Semi UI 依赖 lottie-web，需要 canvas getContext
HTMLCanvasElement.prototype.getContext = (() => {
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "" as CanvasTextAlign,
    textBaseline: "" as CanvasTextBaseline,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: (text: string) => ({ width: text.length * 8 }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    closePath: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setTransform: () => {},
    transform: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createPattern: () => ({} as CanvasPattern),
    getImageData: () => ({ data: new Uint8ClampedArray(), width: 0, height: 0, colorSpace: "srgb" as PredefinedColorSpace }),
    putImageData: () => {},
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    miterLimit: 10,
    setLineDash: () => {},
    getLineDash: () => [],
  } as unknown as CanvasRenderingContext2D;
  return () => ctx;
})();
