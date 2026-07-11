(function () {
    function letterboxImage(image, inputSize = 640) {
        const width = image.width;
        const height = image.height;
        const scale = Math.min(inputSize / width, inputSize / height);
        const resizedWidth = Math.round(width * scale);
        const resizedHeight = Math.round(height * scale);
        const padX = Math.floor((inputSize - resizedWidth) / 2);
        const padY = Math.floor((inputSize - resizedHeight) / 2);
        const canvas = new OffscreenCanvas(inputSize, inputSize);
        const ctx = canvas.getContext("2d", {willReadFrequently: true});

        ctx.fillStyle = "rgb(114, 114, 114)";
        ctx.fillRect(0, 0, inputSize, inputSize);
        ctx.drawImage(image, padX, padY, resizedWidth, resizedHeight);

        return {
            canvas,
            meta: {
                inputSize,
                originalWidth: width,
                originalHeight: height,
                scale,
                padX,
                padY,
                resizedWidth,
                resizedHeight
            }
        };
    }

    function preprocessImageToTensor(image, inputSize = 640) {
        const started = performance.now();
        const {canvas, meta} = letterboxImage(image, inputSize);
        const ctx = canvas.getContext("2d", {willReadFrequently: true});
        const imageData = ctx.getImageData(0, 0, inputSize, inputSize).data;
        const tensor = new Float32Array(1 * 3 * inputSize * inputSize);
        const area = inputSize * inputSize;

        for (let i = 0; i < area; i += 1) {
            const src = i * 4;
            tensor[i] = imageData[src] / 255;
            tensor[area + i] = imageData[src + 1] / 255;
            tensor[area * 2 + i] = imageData[src + 2] / 255;
        }

        return {
            tensor,
            dims: [1, 3, inputSize, inputSize],
            meta,
            preprocessTime: performance.now() - started
        };
    }

    function scaleBoxesToOriginal(boxes, meta) {
        return boxes.map((box) => {
            const [x1, y1, x2, y2] = box.bbox;
            const scaled = [
                (x1 - meta.padX) / meta.scale,
                (y1 - meta.padY) / meta.scale,
                (x2 - meta.padX) / meta.scale,
                (y2 - meta.padY) / meta.scale
            ];
            return {
                ...box,
                bbox: [
                    Math.max(0, Math.min(meta.originalWidth, Math.round(scaled[0]))),
                    Math.max(0, Math.min(meta.originalHeight, Math.round(scaled[1]))),
                    Math.max(0, Math.min(meta.originalWidth, Math.round(scaled[2]))),
                    Math.max(0, Math.min(meta.originalHeight, Math.round(scaled[3])))
                ]
            };
        }).filter((box) => box.bbox[2] > box.bbox[0] && box.bbox[3] > box.bbox[1]);
    }

    self.letterboxImage = letterboxImage;
    self.preprocessImageToTensor = preprocessImageToTensor;
    self.scaleBoxesToOriginal = scaleBoxesToOriginal;
}());
