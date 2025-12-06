import * as opcode from "./opcode.js";
import * as imageDrawing from "./imageDrawing.js";

const SIZERATIO = 1024;

// template for the object representing each game object
function spriteTemplate() {
    return {
        name: "",
        costumes: [],
        struct: {
            x: 0,
            y: 0,
            rotation: 0,
            visible: true,
            layer: 0,
            size: 128,
            rotationStyle: 0,
            costumeIndex: 0,
            costumeMax: 0,
            threadCount: 0,
            variableCount: 0,
            id: 0,
            threads: []
        },
    }
}

// template for the object representing a whole game
function detailsTemplate() {
    return {
        unzippedFile: null,
        imageBuffer: null,
        sprites: [],
        code: [],
        objectIndex: {}
    };
}

function toScaledInt32(x) {
    // Clamp and convert to 16-bit signed
    x = (x << 16) >> 16;
    return x << 16;
}

function degreesToScaled32(degrees) {
    degrees %= 360;
    let scaled = (degrees / 360 * (2 ** 32)) & 0xFFFFFFFF;

    return scaled;
}

// get the sb3 file from the operation layer
function getFsEntry(name) {
    return files[name];
}

// extract relevant details from the sb3 file and load them into a details template
async function getDetails(project) {
    let details = detailsTemplate();
    details.unzippedFile = project;
    let projectJson = JSON.parse(new TextDecoder("utf-8").decode(project["project.json"])); // I hate javascript
    for (let [index, target] of projectJson.targets.entries()) {
        let key = target.name;
        let sprite = spriteTemplate();
        sprite.name = target.name
        sprite.costumes = target.costumes;
        sprite.struct.id = index;
        sprite.struct.variableCount = Object.entries(target.variables).length;
        sprite.struct.x = target.x;
        sprite.struct.y = target.y;
        sprite.struct.size = target.size;
        sprite.struct.rotation = target.direction;
        sprite.struct.visible = target.visible;
        sprite.struct.costumeIndex = target.currentCostume;
        sprite.struct.costumeMax = target.costumes.length;
        sprite.struct.rotationStyle = target.rotationStyle;
        adjustSprite(sprite, target.isStage);
        details.sprites.push(sprite);
    }
    details.objectIndex = opcode.indexObjects(projectJson, {});
    console.log(details.objectIndex);
    details.code = compileSprites(details.sprites, projectJson);
    details.imageBuffer = await imageDrawing.getImageBuffer(project, details);
    return details;
}

// Initialize the threads with every block 
function indexThreads(blocks) {
    let ids = [];
    for (let [id, block] of Object.entries(blocks)) {
        if (block.topLevel && opcode.events.includes(block.opcode)) {
            ids.push(id);
        }
    }
    return ids;
}

function compileSprite(code, sprite, blocks, project) {
    opcode.processBlocks(blocks);
    let threadIds = indexThreads(blocks);
    for (let threadId of threadIds) {
        let hat = blocks[threadId];
        let thread = opcode.compileBlocks(hat, sprite, blocks, code, project);
        sprite.struct.threads.push(thread);
    }
    sprite.struct.threadCount = sprite.struct.threads.length;
}

function compileSprites(sprites, projectJson) {
    let code = [];
    for (let sprite of sprites) {
        let blocks = projectJson["targets"][sprite.struct.id]["blocks"]
        compileSprite(code, sprite, blocks, projectJson);
    }
    return code;
}

// adjust the sprite's parameters to match the quirks of my C representation
function adjustSprite(sprite, isStage) {
    if (isStage) {
        sprite.struct.visible = true;
    }
    sprite.struct.x = toScaledInt32(sprite.struct.x);
    sprite.struct.y = toScaledInt32(sprite.struct.y);
    sprite.struct.rotation = degreesToScaled32(sprite.struct.rotation);
    sprite.struct.rotationStyle = ["left-right", "don't rotate", "all around"].indexOf(sprite.struct.rotationStyle);
    sprite.struct.size = Number(+sprite.struct.size / 100 * SIZERATIO || 0);
}

function bytesToCarray(bytes, name) {
    return ["const unsigned char ", name, "[] = {", bytes.join(", "), "};"].join("");
}

function pad(array, align) {
    while ((array.length % align) !== 0) {
        array.push(0);
    }
}

export async function compileScratchProject(file) {
    let details = await getDetails(file);
    let bytes = await getProgramAsBlob(details);
    sendFile(new Uint8Array(bytes), "programData.bin");
    sendFile(bytesToCarray(bytes, "programData"), "definitions.c");
    return bytes;
}

async function sendFile(blob, name) {
    fetch("upload/" + name, {
        method: 'POST',
        headers: {},
        body: blob
    });
}

function pushInt(arr, val, size) {
    for (let i = 0; i < size; i++) {
        arr.push((val >> (i * 8)) & 0xff);
    }
}

// assume little endian and no padding
function toIntStruct(arr, sizes) {
    if (arr.length !== sizes.length) {
        console.error("toIntStruct: lengths don't match");
        return;
    }
    let intStruct = [];
    let index = 0;
    for (let i = 0; i < arr.length; i++) {
        let val = arr[i];
        let size = sizes[i];
        // arrays in the size list encode arrays in the struct
        if (Array.isArray(size)) {
            let unitSize = size[0];
            let count = size[1];
            for (let j = 0; j < count; j++) {
                pushInt(intStruct, val[j], unitSize);
            }
        }
        else {
            pushInt(intStruct, val, size);
        }
    }
    return intStruct;
}

function makeSprite(spriteBase) {
    let sizes = [
        4, 4, 4,
        2,
        1, 1, 1, 1, 1, 1, 1, 1
    ];
    return toIntStruct(
        [
            spriteBase.x, spriteBase.y, spriteBase.rotation,
            spriteBase.size,
            spriteBase.visible, spriteBase.layer, spriteBase.rotationStyle, spriteBase.costumeIndex,
            spriteBase.costumeMax, spriteBase.threadCount, spriteBase.variableCount, spriteBase.id
        ],
        sizes
    );
}

function makeThread(threadBase) {
    let sizes = [2, 2, 1];
    return toIntStruct(
        [threadBase.eventCondition, threadBase.entryPoint, threadBase.startEvent],
        sizes
    );
}

async function getProgramAsBlob(details) {
    let code = opcode.getCodeAsBuffer(details.code);
    pad(code, 4);
    const enc = new TextEncoder();
    let headerArray = [
        details.sprites.length,
        code.length,
        5,
        Object.keys(details.objectIndex.broadcasts).length,
        Object.keys(details.objectIndex.backdrops).length,
        0,
        0,
        0,
        0,
        0
    ];
    let headerArraySizes = [
        2,
        2,
        2,
        2,
        2,
        2,
        4,
        4,
        4,
        4
    ];
    // just to get a length
    let magicBytes = enc.encode("scratch!");
    let headerStruct = toIntStruct(headerArray, headerArraySizes);
    let spriteBuffer = [];
    let threadBuffer = [];
    details.sprites.forEach(sprite => {
        spriteBuffer.push(...makeSprite(sprite.struct))
        pad(spriteBuffer, 4);
        sprite.struct.threads.forEach( thread => {
            threadBuffer.push(...makeThread(thread));
            pad(threadBuffer, 2);
        });
    });
    headerArray[5] = headerStruct.length;
    headerArray[6] = headerStruct.length + code.length;
    headerArray[7] = headerStruct.length + code.length + spriteBuffer.length;
    headerArray[8] = headerStruct.length + code.length + spriteBuffer.length + threadBuffer.length;

    let imageBytes = details.imageBuffer;
    let dataSize = headerStruct.length + code.length + spriteBuffer.length + threadBuffer.length + imageBytes.length;
    headerArray[9] = dataSize;
    // for real this time
    headerStruct = toIntStruct(headerArray, headerArraySizes);
    pad(headerStruct, 4);
    let bytes = [...magicBytes, ...headerStruct, ...code, ...spriteBuffer, ...threadBuffer, ...imageBytes];
    return bytes;
}

