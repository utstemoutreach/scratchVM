import * as opcode from "./opcode.js";
import * as imageDrawing from "./imageDrawing.js";

// TODO: use `struct` library for serialization instead of manual
// TODO: potentially fetch the declaration of each struct from the actual source so desyncs are updated instantly

const SIZERATIO = 1024;

// struct-like object representing each game object
function newSpriteStruct() {
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
            listCount: 0,
            id: 0,
            threads: []
        },
    }
}

// template for the object representing a whole game
function newProjectBlob() {
    return {
        sprites: [],
        code: [],
        imageBuffer: null,
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

function serializeProject(project, json) {
    let directory = {
        code: project.code,
        spriteStructs: [],
        imageBuffer: null,
        broadcasts: [],
        backdrops: null,
    };
    for (let [index, target] of Object.entries(json.targets)) {
        let key = target.name;
        let sprite = newSpriteStruct();
        sprite.name = target.name;
        sprite.costumes = target.costumes;
        sprite.struct.id = index;
        sprite.struct.variableCount = Object.entries(target.variables).length;
        sprite.struct.x = target.x;
        sprite.struct.y = target.y;
        sprite.struct.size = target.size;
        sprite.struct.visible = target.visible;
        sprite.struct.rotation = target.direction;
        sprite.struct.costumeMax = target.costumes.length;
        sprite.struct.costumeIndex = target.currentCostume;
        sprite.struct.rotationStyle = target.rotationStyle;

        adjustSprite(sprite, target.isStage);

        sprite.threads = project.sprites[index].threads;
        sprite.struct.threadCount = sprite.threads.length;

        directory.spriteStructs.push(sprite);
        directory.broadcasts.push(target.broadcasts);
    }
    directory.backdrops = Object.entries(directory.spriteStructs[0].costumes).length
    return directory;
}

// compile an sb3 file into a structured and serialized directory ready to emit a project blob
async function compile(sb3) {
    let json = JSON.parse(new TextDecoder("utf-8").decode(sb3["project.json"]));
    let project = await opcode.compileProjectFile(json);
    let directory = serializeProject(project, json);
    directory.imageBuffer = await imageDrawing.getImageBuffer(sb3, directory);
    return directory;
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
    let directory = await compile(file);
    let bytes = await getProgramAsBlob(directory);
    sendFile(new Uint8Array(bytes), "programData.bin");
    sendFile(bytesToCarray(bytes, "programData"), "definitions.c");
    return bytes;
}

async function sendFile(blob, name) {
    console.log("sending", name);
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
        1, 1, 1, 1, 1, 1, 1, 1, 1
    ];
    return toIntStruct(
        [
            spriteBase.x, spriteBase.y, spriteBase.rotation,
            spriteBase.size,
            spriteBase.visible, spriteBase.layer, spriteBase.rotationStyle, spriteBase.costumeIndex,
            spriteBase.costumeMax, spriteBase.threadCount, spriteBase.variableCount, 0, spriteBase.id
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

async function getProgramAsBlob(directory) {
    pad(directory.code, 4);
    const enc = new TextEncoder();
    let headerArray = [
        directory.spriteStructs.length,
        directory.code.length,
        5,
        Object.keys(directory.broadcasts).length,
        Object.keys(directory.backdrops).length,
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
    for (let sprite of directory.spriteStructs) {
        spriteBuffer.push(...makeSprite(sprite.struct));
        pad(spriteBuffer, 4);
        for (let thread of sprite.threads) {
            threadBuffer.push(...makeThread(thread));
            pad(threadBuffer, 2);
        };
    };
    headerArray[5] = headerStruct.length;
    headerArray[6] = headerStruct.length + directory.code.length;
    headerArray[7] = headerStruct.length + directory.code.length + spriteBuffer.length;
    headerArray[8] = headerStruct.length + directory.code.length + spriteBuffer.length + threadBuffer.length;

    let imageBytes = directory.imageBuffer;
    let dataSize = headerStruct.length + directory.code.length + spriteBuffer.length + threadBuffer.length + imageBytes.length;
    headerArray[9] = dataSize;
    // for real this time
    headerStruct = toIntStruct(headerArray, headerArraySizes);
    pad(headerStruct, 4);
    let bytes = [...magicBytes, ...headerStruct, ...directory.code, ...spriteBuffer, ...threadBuffer, ...imageBytes];
    return bytes;
}

