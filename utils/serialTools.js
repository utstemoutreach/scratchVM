export function newSerialObject() {
    return {
        port: null,

        readStream: null,
        writeStream: null,

        inputCallback: null,
        outputCallback: null,
        readNotification: null,
        writeNotification: null,

        // a split input option, separate from `inputCallback`
        inputQueue: {},
        inputQueueTop: 0,
        inputQueueBottom: 0,
        inputQueueNotification: null,

        protocol: null,
    };
}

function* batchArray(array, batchSize) {
    for (let i = 0; i < array.length; i += batchSize) {
    yield array.subarray(i, i + batchSize);
  }
}

export function pingPongProtocol(packetSize, acceptByte) {
    return {
        allowPacket: null,
        async write(bytes, writer) {
            for (let batch of batchArray(bytes, packetSize)) {
                console.log(batch);
                writer.write(batch);
                await new Promise(res => {
                    this.allowPacket = res;
                });
            }
        },
        interpret(bytes) {
            if (!bytes.includes(acceptByte)) return;
            if (!this.allowPacket) return;
            this.allowPacket();
            this.allowPacket = null;
        }
    };
}


// Connect to serial port
export async function connectSerial(serialObj, baudRate) {
    if (baudRate == null) baudRate = 115200;
    let serialPort = null;
    try {
        // Check if Web Serial API is available
        if (!("serial" in navigator)) {
            throw new Error("Web Serial API not supported in this browser");
        }
        
        // Request port access
        serialPort = await navigator.serial.requestPort();
        
        // Open the port with appropriate baud rate for ESP32
        await serialPort.open({baudRate});
        
    } catch (error) {
        console.error("Serial connection error:", error);
        serialPort = null;
    }
    serialObj.port = serialPort;
}

export function sendInput(serialObj, input) {
    if (typeof input === "string") input = new TextEncoder().encode(input, "utf-8");
    console.log(typeof input);
    if (typeof input !== "Uint8Array") input = new Uint8Array(input);
    console.log(input);
    serialObj.inputQueue[serialObj.inputQueueTop] = input;
    serialObj.inputQueueTop++;
    serialObj.inputQueueNotification?.();
    serialObj.inputQueueNotification = null;
}

async function receiveInput(serialObj) {
    while (serialObj.inputQueueTop == serialObj.inputQueueBottom) {
        await new Promise( (res) => {
            serialObj.inputQueueNotification = res;
        });
    }
    let val = serialObj.inputQueue[serialObj.inputQueueBottom];
    delete serialObj.inputQueue[serialObj.inputQueueBottom];
    serialObj.inputQueueBottom++;
    return val;
}

async function inputLoop(serialObj) {
    serialObj.writeStream = serialObj.port.writable.getWriter();
    // the two sources will race to produce input for the port; the loser gets to persist in the next loop.
    let inputPromises = {
        "callback": null,
        "buffer": null
    };
    while (serialObj.port && serialObj.inputCallback) {
        let input = null;
        if (!inputPromises["callback"]) {
            inputPromises["callback"] = serialObj.inputCallback().then(data => {return {source: "callback", data}});
        }
        if (!inputPromises["buffer"]) {
            inputPromises["buffer"] = receiveInput(serialObj).then(data => {return {source: "buffer", data}});
        }
        input = await Promise.race(Object.values(inputPromises));
        inputPromises[input.source] = null;
        if (input.data) await serialObj.protocol.write(input.data, serialObj.writeStream);
        // send a notification to the system waiting on a write completion
        // TODO: split `writeNotification` into `writeNotification` and `writeFinishNotification`; the former, which does not break; and the latter, which does break.
        if (serialObj.writeNotification) {
            serialObj.writeNotification();
            break;
        }
    }
}

let perpetualPromise = new Promise(() => {});
// truthy no-op-but-callable defaults for `inputCallback` and `outputCallback`
export async function outputNullCallback() {}
export async function inputNullCallback() {
    await perpetualPromise;
}

async function outputLoop(serialObj) {
    serialObj.readStream = serialObj.port.readable.getReader();
    while (serialObj.port && serialObj.outputCallback) {
        let read = await serialObj.readStream.read();
        if (read.done) break;
        serialObj.protocol.interpret(read.value);
        await serialObj.outputCallback(read.value);
        // send a notification to the system waiting on a read completion
        // TODO: see TODO in `inputLoop`.
        if (serialObj.readNotification) {
            serialObj.readNotification();
            break;
        }
    }
}

export async function startSerialDaemon(serialObj) {
    Promise.all([
        inputLoop(serialObj),
        outputLoop(serialObj),
    ]).catch(error => {
        console.error(error);
        disconnectSerial(serialObj);
    });
}

export async function initSerial(inputCallback, outputCallback, baudRate) {
    let serialObj = newSerialObject();
    serialObj.protocol = pingPongProtocol(4096, 6);
    serialObj.inputCallback = inputCallback || inputNullCallback;
    serialObj.outputCallback = outputCallback || outputNullCallback;
    await connectSerial(serialObj, baudRate);
    startSerialDaemon(serialObj);
    return serialObj;
}

// Disconnect serial port
export async function disconnectSerial(serialObj, allowFinishTimeout) {
    let serialPort = serialObj.port;
    if (allowFinishTimeout) {
        let resolves = [];
        let writeFinish = new Promise( (resolve) => {
            // writer will call this when it finishes
            serialObj.writeNotification = resolve;
            resolves.push(resolve);
        }
        );
        let readFinish = new Promise ( (resolve) => {
            serialObj.readNotification = resolve;
            resolves.push(resolve);
        }
        );
        if (allowFinishTimeout > 0) {
            setTimeout(() => {
                for (let res of resolves) res();
            }, allowFinishTimeout);
        }
        await Promise.allSettled([writeFinish, readFinish]);
    }
    try {
        if (serialObj.readStream) await serialObj.readStream.cancel();
        if (serialObj.writeStream) await serialObj.writeStream.close();
        if (serialPort) await serialPort.close();
        Object.assign(serialObj, newSerialObject());
    } catch (error) {
        console.error("Disconnect error:", error);
    }
}
