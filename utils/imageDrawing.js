import mime from 'https://cdn.skypack.dev/mime'; 

const SCRATCHWIDTH = 480;
const SCRATCHHEIGHT = 360;

const structImageSize = 268;
const imageNameSize = 256;

const xScaleMax = 32;

const yScaleMax = 32;

let scaleSettingsModes = [
    "scaleFactor",
    "scaleTarget",
    "scaleMax",
    "default",
];

async function flattenAlpha(pixels, width, height) {
    let flattenedImage = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x ++) {
            let flattenedIndex = (y * width + x) * 3;
            let sourceIndex = (y * width + x) * 4;
            let alpha = pixels[sourceIndex + 3];
            flattenedImage[flattenedIndex] = pixels[sourceIndex];
            flattenedImage[flattenedIndex+1] = pixels[sourceIndex+1];
            flattenedImage[flattenedIndex+2] = pixels[sourceIndex+2];

            // replace (0, 0, 0) with (1, 1, 1) so (0, 0, 0) is reserved for transparency
            let sum = (flattenedImage[flattenedIndex] + flattenedImage[flattenedIndex + 1] + flattenedImage[flattenedIndex + 2]);
            let isBlack = sum == 0;
            if (isBlack && alpha > 32) {
                flattenedImage[flattenedIndex] = 31;
                flattenedImage[flattenedIndex + 1] = 31;
                flattenedImage[flattenedIndex + 2] = 31;
            }
            else if (alpha <= 32) {
                flattenedImage[flattenedIndex] = 0;
                flattenedImage[flattenedIndex + 1] = 0;
                flattenedImage[flattenedIndex + 2] = 0;
            }
        }
    }
    return flattenedImage;
}

function drawRGB888ToCanvas(rgbArray, width, height) {
    if (rgbArray.length !== width * height * 3) {
        throw new Error("Array length does not match width*height*3");
    }

    // Create a canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Create an ImageData object (RGBA)
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Convert RGB array to RGBA
    for (let i = 0, j = 0; i < rgbArray.length; i += 3, j += 4) {
        data[j] = rgbArray[i];       // R
        data[j + 1] = rgbArray[i + 1]; // G
        data[j + 2] = rgbArray[i + 2]; // B
        data[j + 3] = 255;           // A
    }

    // Put the image data on the canvas
    ctx.putImageData(imageData, 0, 0);

    return canvas;
}

function RGB888to565(uint8Array) {
    let result = new Uint16Array(uint8Array.length / 3);
    for (let i = 0; i < result.length; i++) {
        let sourceIndex = i * 3;
        let red = uint8Array[sourceIndex];
        let green = uint8Array[sourceIndex + 1];
        let blue = uint8Array[sourceIndex + 2];
        red = Math.floor(red * 31 / 255);
        green = Math.floor(green * 63 / 255);
        blue = Math.floor(blue * 31 / 255);
        let finalColor = red << 11 | green << 5 | blue;
        result[i] = finalColor;
    }
    return result;
}

function drawRGB565ToCanvas(rgb565Array, width, height) {
    if (rgb565Array.length !== width * height) {
        throw new Error("Array length does not match width*height");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < rgb565Array.length; i++) {
        const value = rgb565Array[i];

        // Extract R, G, B components
        const r5 = (value >> 11) & 0x1F; // 5 bits red
        const g6 = (value >> 5) & 0x3F;  // 6 bits green
        const b5 = value & 0x1F;         // 5 bits blue

        // Convert to 8-bit per channel
        const r8 = (r5 << 3) | (r5 >> 2); // replicate high bits to low
        const g8 = (g6 << 2) | (g6 >> 4);
        const b8 = (b5 << 3) | (b5 >> 2);

        const j = i * 4;
        data[j] = r8;
        data[j + 1] = g8;
        data[j + 2] = b8;
        data[j + 3] = 255; // fully opaque
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

async function getScaledImageFromFile(directory, filename, scaleSettings) {
    let file = directory[filename];
    let type = mime.getType(filename);
    let {scaledImage, width, height, targetWidth, targetHeight} = await drawAndGetPixels(file, type, scaleSettings);
    scaledImage = await flattenAlpha(scaledImage, targetWidth, targetHeight);
    return {scaledImage, width, height, targetWidth, targetHeight};
}

async function drawAndGetPixels(uint8arr, mimeType, scaleSettings) {
    const blob = new Blob([uint8arr], { type: mimeType });
    const url = URL.createObjectURL(blob);

    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        let targetWidth;
        let targetHeight;
        let width = Math.max(img.width, 1);
        let height = Math.max(img.height, 1);
        if (scaleSettings == undefined) {
            scaleSettings = {mode: "default"};
        }
        if (scaleSettings.mode === "default") {
            targetWidth = width;
            targetHeight = height;
        }
        else if (scaleSettings.mode === "scaleFactor") {
            targetWidth = width * scaleSettings.x;
            targetHeight = height * scaleSettings.y;
        }
        else if (scaleSettings.mode === "scaleTarget") {
            targetWidth = scaleSettings.x;
            targetHeight = scaleSettings.y;
        }
        else if (scaleSettings.mode === "scaleMax") {
            targetWidth = Math.min(width, scaleSettings.x);
            targetHeight = Math.min(height, scaleSettings.y);
        }

        // it is necessary to rasterize the image before drawing it in the new resolution so that svgs don't try to maintain aspect ratio.
        const rasterizeCanvas = document.createElement("canvas");
        rasterizeCanvas.width = width;
        rasterizeCanvas.height = height;
        rasterizeCanvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(rasterizeCanvas, 0, 0, targetWidth, targetHeight);

        const pixels = ctx.getImageData(0, 0, Math.max(canvas.width, 1), Math.max(canvas.height, 1)).data;

        return { scaledImage: pixels, width, height, targetWidth, targetHeight};
    } finally {
        URL.revokeObjectURL(url);
    }
}

function toInt16(i) {
    return [i & 0xff, i >> 8];
}

export async function getImageBuffer(file, details, byteBudget) {
    let totalSize = 0;
    let imageCount = 0;
    let images = [];
    for (let sprite of details.sprites) {
        for (let image of sprite.costumes) {
            imageCount++;
            images.push(image);
        }
    }
    for (let image of images) {
        let filename = image.md5ext;
        if (filename === undefined) {
            filename = image.assetId + "." + image.dataFormat;
        }
        let {scaledImage, width, height, targetWidth, targetHeight} = await getScaledImageFromFile(file, filename, {mode: "scaleMax", x: xScaleMax, y: yScaleMax});
        image.scaledImage = scaledImage;
        image.width = width;
        image.height = height;
        image.scaledWidth = targetWidth;
        image.scaledHeight = targetHeight;
        totalSize += structImageSize;
        totalSize += targetWidth * targetHeight * 2;
    }
    let buffer = new Uint8Array(totalSize);
    let isStage = true;
    let index = 0;
    for (let image of images) {
        let {scaledImage, width, height, scaledWidth, scaledHeight} = image;
        let array = scaledImage;
        array = RGB888to565(array);

        let canvas = drawRGB565ToCanvas(array, scaledWidth, scaledHeight);

        let xOffset = image.rotationCenterX / image.bitmapResolution;
        let yOffset = image.rotationCenterY / image.bitmapResolution;

        let logicalWidth = width / image.bitmapResolution;
        let logicalHeight = height / image.bitmapResolution;

        if (isStage) {
            logicalWidth = SCRATCHWIDTH;
            logicalHeight = SCRATCHHEIGHT;
        }

        let widthRatio = 255 * logicalWidth / SCRATCHWIDTH;
        let heightRatio = 255 * logicalHeight / SCRATCHHEIGHT;

        let costumeName = new TextEncoder().encode(image.name);
        let costumeNameBuffer = new Uint8Array(imageNameSize);
        costumeNameBuffer.set(costumeName);
        let imageStruct = [...toInt16(widthRatio), ...toInt16(heightRatio), ...toInt16(scaledWidth), ...toInt16(scaledHeight), ...toInt16(xOffset), ...toInt16(yOffset)];
        buffer.set(new Uint8Array(imageStruct), index);
        index += imageStruct.length;
        buffer.set(costumeNameBuffer, index);
        index += imageNameSize;
        buffer.set(new Uint8Array(array.buffer), index);
        index += array.byteLength;
        isStage = false;
    }
    return buffer;
}

export function getImageBufferAsCarray(buffer) {
    return ["const uint8_t imageBuffer[] = {", buffer.join(", "), "}\n;"].join("");
}
