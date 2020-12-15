import { MessageStream, message, uid } from "./worker-utils.js";
import { GrayImageF32N0F8 } from "./image-utils.js";

const numBayerLevels = 4;
let bayerWorker;
if (typeof process !== "undefined" && process.env.TARGET_DOMAIN) {
  bayerWorker = new Worker("./bayer-worker.js");
} else {
  bayerWorker = new Worker("./bayer-worker.js", { type: "module" });
}

const pipeline = [
  {
    id: "quantized",
    title: "Quantized",
    async process(grayscale) {
      return grayscale.copy().selfMap(v => (v > 0.5 ? 1.0 : 0.0));
    }
  },
  {
    id: "random",
    title: "Dithering",
    async process(grayscale) {
      return grayscale
        .copy()
        .selfMap(v => (v + Math.random() - 0.5 > 0.5 ? 1.0 : 0.0));
    }
  },
  ...Array.from({ length: numBayerLevels }, (_, i) => {
    return {
      id: `bayer-${i}`,
      title: `Bayer Level ${i + 1}`,
      async process(grayscale, { bayerLevels }) {
        const bayerLevel = await bayerLevels[i];
        return grayscale
          .copy()
          .selfMap((v, { i }) => (v + bayerLevel[i] - 0.5 > 0.5 ? 1.0 : 0.0));
      }
    };
  }),
  {
    id: "2derrdiff",
    title: "Simple Error Diffusion",
    async process(grayscale) {
      return errorDiffusion(
        grayscale.copy(),
        new GrayImageF32N0F8(new Float32Array([0, 1, 1, 0]), 2, 2),
        v => (v > 0.5 ? 1.0 : 0.0)
      );
    }
  },
  {
    id: "floydsteinberg",
    title: "Floyd-Steinberg Diffusion",
    async process(grayscale) {
      return errorDiffusion(
        grayscale.copy(),
        new GrayImageF32N0F8(new Float32Array([0, 0, 7, 1, 5, 3]), 3, 2),
        v => (v > 0.5 ? 1.0 : 0.0)
      );
    }
  },
  {
    id: "jjn",
    title: "Jarvis-Judice-Ninke Diffusion",
    async process(grayscale) {
      return errorDiffusion(
        grayscale.copy(),
        new GrayImageF32N0F8(
          new Float32Array([0, 0, 0, 7, 5, 3, 5, 7, 5, 3, 1, 3, 5, 3, 1]),
          5,
          3
        ),
        v => (v > 0.5 ? 1.0 : 0.0)
      );
    }
  }
];

function errorDiffusion(img, diffusor, quantizeFunc) {
  diffusor.normalizeSelf();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const original = img.pixelAt(x, y)[0];
      const quantized = quantizeFunc(original);
      img.pixelAt(x, y)[0] = quantized;
      const error = original - quantized;
      for (let diffY = 0; diffY < diffusor.height; diffY++) {
        for (let diffX = 0; diffX < diffusor.width; diffX++) {
          const offsetX = diffX - Math.floor((diffusor.width - 1) / 2);
          const offsetY = diffY;
          if (img.isInBounds(x + offsetX, y + offsetY)) {
            const pixel = img.pixelAt(x + offsetX, y + offsetY);
            pixel[0] = pixel[0] + error * diffusor.pixelAt(diffX, diffY)[0];
          }
        }
      }
    }
  }
  return img;
}

async function init() {
  const reader = MessageStream().getReader();

  while (true) {
    const { value: original } = await reader.read();
    const jobId = uid();
    const bayerLevels = Array.from({ length: numBayerLevels }, (_, i) => {
      const id = `${jobId}-${i}`;
      bayerWorker.postMessage({
        width: original.width,
        height: original.height,
        level: i,
        id
      });
      return message(bayerWorker, id).then(m => m.result);
    });

    postMessage({
      id: "original",
      title: "Original",
      imageData: original
    });

    const grayscale = GrayImageF32N0F8.fromImageData(original);
    postMessage({
      id: "grayscale",
      title: "Grayscale",
      imageData: grayscale.toImageData()
    });

    for (const step of pipeline) {
      const result = await step.process(grayscale, { bayerLevels });
      postMessage({
        resultType: step.id,
        title: step.title,
        imageData: result.toImageData()
      });
      step.result = result;
    }
  }
}
init();