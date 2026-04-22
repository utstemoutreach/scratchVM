function toScaledInt32Tuple(number) {
    let whole = Math.floor(number);
    let fraction = number - whole;

    // fraction is given in scale 0 -> 1
    // I need to transform it to the scale 0 -> 65k (16bit int limit)
    
    fraction *= 65535;
    fraction = Math.round(fraction);

    let componentBytes = new Uint8Array([fraction, fraction >> 8, whole, whole >> 8]); // All params implicitly masked by 8
    return componentBytes;
}

function toCString(string) {
    const bytes = new TextEncoder().encode(string + '\0');
    return bytes;
}

function toCodeLiteral(number, byteSize) {
    let bytes = [];
    for (let i = 0; i < byteSize; i++) {
        bytes.push(number & 0xff);
        number >>= 8;
    }
    return bytes;
}

export const argProcessors = {
    id: (value) => {
        return toCodeLiteral(value, 2);
    },
    fraction: (value) => {
        return toScaledInt32Tuple(value);
    },
    wholeNumber: (value) => {
        return toCodeLiteral(value, 4);
    },
    string: (value) => {
        return toCString(value);
    },
};

class PromiseLog {
    perpetualPromise = new Promise(res=>{});
    constructor() {
        this.unsettled = {};
        this.unsettledCount = 0;
        this.unsettledId = 0;
        this.settledPromise = Promise.resolve();
        this.settledResolve = null;
        this.settled = true;
    }
    // LLMs will think there is a race condition because they are stupid. There is no race condition.
    // The thread that depends on the value of `unsettledCount` is always the thread that modified `unsettledCount`,
    // and it gets to finish BEFORE letting any other threads get a turn.
    depend(promise) {
        let id = this.unsettledId;
        this.unsettledId++;
        this.unsettled[id] = promise;
        this.unsettledCount++;
        // add itself to the `unsettled` queue and, if it was empty, create a hook for outsiders to wait for the queue to be empty again.
        if (this.unsettledCount == 1) {
            this.settledPromise = new Promise(res => {
                this.settledResolve = res;
            });
            this.settled = false;
        }
        // delete itself when resolved and notify anyone waiting for `this.settledPromise` if deleting itself clears the `unsettled` queue.
        let promiseResponse = value => {
            delete this.unsettled[id];
            this.unsettledCount--;
            if (this.unsettledCount == 0) {
                this.settledResolve();
                this.settled = true;
            }
        };
        promise.then(promiseResponse, promiseResponse);
    }
    async settle(timeout) {
        let timeoutPromise = this.perpetualPromise; 
        if (timeout) timeoutPromise = new Promise(res => {
            setTimeout(res, timeout);
        });
        // if (!timeout), `timeoutPromise` will never win
        await Promise.race([this.settledPromise, timeoutPromise]);
        return this.settled;
    }
    setProperty(obj, prop, promise) {
        if (typeof promise.then !== "function") {
            obj[prop] = promise;
            return;
        }
        this.depend(promise);
        promise.then(value => {
            obj[prop] = value;
        });
    }
}

class Frame {
    constructor() {
        this.args = {};
        this.currentSize = 0;
        this.maxSize = 0;
        this.resolveSize = null;
        this.finalSize = new Promise(res => this.resolveSize = res);
    }
    getStorage(size) {
        let base = this.currentSize;
        this.currentSize += size;
        if (this.currentSize > this.maxSize) this.maxSize = this.currentSize;
        console.log("allocating", size, "(maxSize", this.maxSize, ")");
        return base;
    }
    returnStorage(size) {
        this.currentSize -= size;
    }
    finish() {
        this.resolveSize(this.maxSize);
        return this.maxSize;
    }
}

const defaultAlignmentMask = 3;
export class Thread {
    constructor(projectIndex, sprite, hat, code, isFunction) {
        this.frame = new Frame();
        if (isFunction) {
            this.frame.getStorage(1); // return address
        }
        this.isFunction = isFunction;
        this.args = {};
        this.promises = new PromiseLog();

        this.serialized = code || [];

        this.projectIndex = projectIndex;
        this.sprite = sprite;
        this.blocks = sprite.body.blocks;

        hat = processBlock(hat, this.blocks);
        this.entryPoint = code.length;
        this.startEvent = events.indexOf(hat.opcode);
        this.eventCondition = null;
        this.promises.setProperty(this, "eventCondition", getEventCondition(hat, projectIndex));

        this.pushPrologue();
        this.compileBlock(this.blocks[hat.next]);
        this.frame.finish();
        this.pushEpilogue();
    }
    async settle(timeout) {
        return await this.promises.settle(timeout);
    }
    depend(promise) {
        return this.promises.depend(promise);
    }
    settled() {
        return this.promises.settled;
    }
    pushPrologue() {
        if (this.isFunction) return;
        let frameSize = 0;
        this.pushOpcode("INNER_PUSHFRAME");
        this.align();
        let codePosition = this.serialized.length;
        this.pushId(frameSize);
        this.frame.finalSize.then(val => {
            this.splice(argProcessors.id(val), codePosition);
        });
    }
    pushDestroyFrame() {
        this.pushOpcode("INNER_POPFRAME");
        this.pushId(this.frame.maxSize);
    }
    pushEpilogue() {
        if (!this.isFunction) {
            this.pushDestroyFrame();
            this.pushOpcode("INNER_PUSHID");
            this.pushId(0);
            this.pushOpcode("CONTROL_STOP");
        }
        else {
            this.pushOpcode("INNER_GETFRAMEVAR");
            this.pushId(0);
            this.pushOpcode("INNER_JUMPINDIRECT");
        }
    }
    align(mask) {
        mask = mask || defaultAlignmentMask;
        while (this.serialized.length != (this.serialized.length & ~mask)) {
            this.serialized.push(0);
        }
    }
    splice(bytes, position) {
        if (position == null) position = this.serialized.length;
        let dest = position + bytes.length;
        while (this.serialized.length < dest) this.serialized.push(0);
        for (let [index, val] of bytes.entries()) {
            this.serialized[index + position] = bytes[index];
        }
    }
    pushFunctionCall(args, proccode) {
        // TODO: implement arguments
        this.pushOpcode("INNER_PUSHFRAME");
        this.align();
        let frameAllocPosition = this.serialized.length;
        this.pushId(0);
        this.pushOpcode("INNER_PUSHID");
        let returnAddr = this.pushNewCodeRef();
        this.pushOpcode("INNER_SETFRAMEVAR");
        this.pushId(0);

        this.pushOpcode("INNER_JUMP");
        this.align();
        let callAddr = this.pushNewCodeRef();
        this.satisfyCodeRef(returnAddr);
        this.pushOpcode("INNER_POPFRAME");
        this.align();
        let frameDestroyPosition = this.serialized.length;
        this.pushId(0);

        this.projectIndex.getSymbol(this.sprite.id, symbolTypes.func, proccode).value
            .then(thread => {
                this.splice(argProcessors.id(thread.frame.maxSize), frameAllocPosition);
                this.splice(argProcessors.id(thread.frame.maxSize), frameDestroyPosition);
                this.satisfyCodeRef(callAddr, thread.entryPoint);
            });
    }
    pushArg(value, process) {
        if (process != argProcessors.string) this.align();
        this.serialized.push(...process(value));
    }
    pushId(value) {
        this.pushArg(value, argProcessors.id);
    }
    pushSymbolArg(type, id) {
        this.align();
        let place = this.serialized.length;
        let placeholder = argProcessors.id(0);
        this.serialized.push(...placeholder);
        let value = this.projectIndex.getSymbol(this.sprite.id, type, id);
        let process = argProcessors.id;
        value.value.then((val) => {
            if (val == undefined) console.warn("val", type, id, "satisfied with undefined");
            let bytes = process(val);
            this.splice(bytes, place);
        });
    }
    pushVariableArg(id) {
        let placeholder = argProcessors.id(0);

        this.align();
        let spriteIdPlace = this.serialized.length;
        this.serialized.push(...placeholder);

        this.align();
        let varIdPlace = this.serialized.length;
        this.serialized.push(...placeholder);

        let value = this.projectIndex.getSymbol(this.sprite.id, symbolTypes.variable, id);

        let process = argProcessors.id;
        value.value.then((variable) => {
            let [spriteId, varId] = variable;
            this.splice(process(spriteId), spriteIdPlace);
            this.splice(process(varId), varIdPlace);
        });
    }
    pushOpcode(opcode) {
        console.log("pushing opcode", opcode, "(program counter", this.serialized.length, ")");
        let opcodeNum = opcodeEnum[opcode];
        if(!opcodeNum) console.warn("opcode", opcode, "not found");
        this.serialized.push(opcodeNum || 0);
    }
    pushCodeRef(ref) {
        let placeholder = argProcessors.id(0);
        this.align();
        let place = this.serialized.length;
        this.serialized.push(...placeholder);
        ref.dest.then((dest) => {
            this.splice(argProcessors.id(dest), place);
        });
    }
    pushNewCodeRef() {
        let resolve;
        let ref = {
            dest: null,
            resolve: null,
        };
        ref.dest = new Promise((res) => {
            ref.resolve = res;
        });
        this.pushCodeRef(ref);
        return ref;
    }
    satisfyCodeRef(ref, offset) {
        offset = offset || this.serialized.length;
        ref.resolve(offset);
    }
    pushFuncs = {
        NUM: (input) => {
            this.pushOpcode("INNER_PUSHNUMBER");
            this.pushArg(input.value[0], argProcessors.fraction);
        },
        POSNUM: "NUM",
        WHOLENUM: "NUM",
        INTNUM: "NUM",
        ANGLENUM: (input) => {
            this.pushOpcode("INNER_PUSHDEGREES");
            let degrees = Number(input.value[0]);
            degrees *= ((UINT32_MAX + 1) / 360);
            this.pushArg(degrees, argProcessors.wholeNumber);
        },
        COLOR: (input) => {
            console.error("COLOR");
        },
        TEXT: (input) => {
            if (!isNaN(input.value[0])) {
                this.pushFuncs.NUM(input);
                return;
            }
            this.pushOpcode("INNER_PUSHTEXT");
            this.pushArg(input.value[0], argProcessors.string);
        },
        BROADCAST: (input) => {
            this.pushOpcode("INNER_PUSHID");
            this.pushSymbolArg(symbolTypes.broadcast, input.value[0]);
        },
        VAR: (input) => {
            this.pushOpcode("INNER_FETCHVAR");
            this.pushVariableArg(input.value[1], null);
        },
        LIST: (input) => {
            console.error("LIST");
        },
        OBJECTREF: (input) => {
            let block = this.blocks[input.value];
            this.compileBlock(block);
        }
    }
    pushInput(block, input) {
        if (!input) {
            console.warn("empty input pased to `pushInput`");
            return;
        }
        let pushFunc = input.type;
        while (typeof pushFunc === "string") {
            pushFunc = this.pushFuncs[pushFunc];
        }
        if (pushFunc === undefined) {
            console.error("pushFuncs does not contain value for", input);
            return;
        }
        pushFunc(input);
    }
    compileBlock(block) {
        block = processBlock(block, this.blocks);
        if (block.opcode.startsWith("SOUND")) {
            console.warn("skipping sound block");
            return;
        }
        let specialFunction = specialFunctions[block.opcode];
        if (specialFunction !== undefined) {
            specialFunction(block, this);
        }
        else {
            for (let input of Object.values(block.inputs)) {
                this.pushInput(block, input);
            }
            this.pushOpcode(block.opcode);
            // all blocks with fields should have explicit handlers
            for (let field of Object.values(block.fields)) {
                reportField(block, field);
            }
        }
        if (block.next) this.compileBlock(this.blocks[block.next]);
    }
}

export function processInput(input) {
    let valueAnnotation = {
        type: null,
        value: null
    };
    let inputType = input[0];
    let value = input[1];
    // shadows aren't important and we don't use them for anything, but keeping track of them helps document the format better.
    let shadow = null;
    if (inputType === definitions.unobscuredShadow) {
        shadow = input[1];
    }
    else if (inputType === definitions.obscuredShadow) {
        shadow = input[2];
    }
    // strings are always references to objects
    if (typeof value === "string") {
        valueAnnotation.type = "OBJECTREF";
        valueAnnotation.value = value;
        return valueAnnotation;
    }
    if (!value) return null;
    valueAnnotation.type = definitions[value[0]];
    valueAnnotation.value = value.slice(1);
    return valueAnnotation;
}

function processBlock(block, blocks) {
    block.opcode = block.opcode.toUpperCase();
    let processed = {
        opcode: block.opcode,
        next: block.next,
        parent: block.parent,
        mutation: block.mutation,
        topLevel: block.topLevel,
        inputs: {},
        fields: {},
    };
    for (let [key, value] of Object.entries(block.inputs)) {
        processed.inputs[key] = processInput(value);
    }
    for (let [key, value] of Object.entries(block.fields)) {
        processed.fields[key] = value;
    }
    return processed;
}

let symbolTypes = {
    broadcast: "broadcast",
    backdrop: "backdrop",
    sprite: "sprite",
    stage: "stage",
    variable: "variable",
    costume: "costume",
    func: "func",
};

let ownerlessSymbolTypes = {
    broadcast: "broadcast",
    backdrop: "backdrop",
    sprite: "sprite",
    stage: "stage",
    variable: "variable"
};

const specialFunctions = {
    MOTION_POINTTOWARDS_MENU: (block, thread) => {
        let to = block.fields.TOWARDS[0];
        thread.pushOpcode("INNER_FETCHPOSITION");
        const fieldvalues = {
            _random_: -1,
            _mouse_: -2,
        };
        let fieldvalue = fieldvalues[to];
        if (fieldvalue) thread.pushId(fieldvalue);
        else thread.pushSymbolArg(symbolTypes.sprite, to);
    },

    LOOKS_CHANGEEFFECTBY: () => {},
    LOOKS_SETEFFECTTO: () => {},

    PROCEDURES_CALL: (block, thread) => {
        thread.pushFunctionCall([], block.mutation.proccode);
    },

    OPERATOR_MATHOP: (block, thread) => {
        thread.pushInput(block, block.inputs.NUM);
        thread.pushOpcode("OPERATOR_MATHOP");
        let opId = ["abs", "floor", "ceiling", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "e ^", "10 ^"].indexOf(block.fields.OPERATOR[0]);
        thread.pushId(opId);
    },

    SENSING_OF: (block, thread) => {
        thread.pushInput(block, block.inputs.OBJECT);
        let propertyEnum = 0;
        switch (block.fields.PROPERTY[0]) {
            case "backdrop #":
            case "costume #":
                propertyEnum = -1;
                break;
            case "backdrop name":
            case "costume name":
                propertyEnum = -2;
                break;
            case "volume":
                propertyEnum = -3;
                break;
            case "x position":
                propertyEnum = -4;
                break;
            case "y position":
                propertyEnum = -5;
                break;
            case "direction":
                propertyEnum = -6;
                break;
            case "size":
                propertyEnum = -7;
                break;
        }
        thread.pushOpcode("SENSING_OF");
        if (propertyEnum < 0) {
            thread.pushId(propertyEnum);
        }
        else {
            thread.pushVariableArg(block.fields.PROPERTY[0]);
        }
    },

    SENSING_OF_OBJECT_MENU: (block, thread) => {
        thread.pushOpcode("INNER_PUSHID");
        let target = block.fields.OBJECT[0];
        if (target == "_stage_") {
            thread.pushId(0);
        }
        else {
            thread.pushSymbolArg(symbolTypes.sprite, target);
        }
    },

    CONTROL_STOP: (block, thread) => {
        let options = ["this script", "all", "other scripts in sprite"];
        let index = options.indexOf(block.fields.STOP_OPTION[0]);
        thread.pushOpcode("INNER_PUSHID");
        thread.pushId(index);
        thread.pushOpcode("CONTROL_STOP");
    },

    CONTROL_CREATE_CLONE_OF_MENU: (block, thread) => {
        thread.pushOpcode("INNER_PUSHID");
        if (block.fields.CLONE_OPTION[0] === "_myself_") {
            thread.pushId(-1);
        }
        else {
            thread.pushSymbolArg(symbolTypes.sprite, block.fields.CLONE_OPTION[0]);
        }
    },

    LOOKS_SAYFORSECS: (block, thread) => {
        let framePos = thread.framePos.getStorage(1);
        thread.pushInput(block, block.inputs.MESSAGE);
        thread.pushOpcode("LOOKS_SAY");
        thread.pushInput(block, block.inputs.SECS);
        thread.pushOpcode("CONTROL_WAIT");
        thread.pushId(framePos);
        thread.pushOpcode("INNER__WAITITERATION");
        thread.pushId(framePos);
        thread.pushOpcode("INNER_PUSHTEXT");
        thread.pushArg("", argProcessors.string);
        thread.pushOpcode("LOOKS_SAY");
        thread.framePos.returnStorage(1);
    },

    LOOKS_THINKFORSECS: (block, thread) => {
        let framePos = thread.framePos.getStorage(1);
        thread.pushInput(block, block.inputs.MESSAGE);
        thread.pushOpcode("LOOKS_SAY");
        thread.pushInput(block, block.inputs.SECS);
        thread.pushOpcode("CONTROL_WAIT");
        thread.pushId(framePos);
        thread.pushOpcode("INNER__WAITITERATION");
        thread.pushId(framePos);
        thread.pushOpcode("INNER_PUSHTEXT");
        thread.pushArg("", argProcessors.string);
        thread.pushOpcode("LOOKS_THINK");
        thread.framePos.returnStorage(1);
    },

    LOOKS_SWITCHBACKDROPTO: (block, thread) => {
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode(block.opcode);
    },

    LOOKS_BACKDROPS: (block, thread) => {
        let costumeName = block.fields.BACKDROP[0];
        thread.pushOpcode("INNER_PUSHID");
        thread.pushSymbolArg(symbolTypes.backdrop, costumeName);
    },

    LOOKS_SWITCHCOSTUMETO: (block, thread) => {
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode(block.opcode);
    },

    LOOKS_COSTUME: (block, thread) => {
        let costumeName = block.fields.COSTUME[0];
        thread.pushOpcode("INNER_PUSHID");
        thread.pushSymbolArg(symbolTypes.costume, costumeName);
    },

    SENSING_TOUCHINGOBJECTMENU: (block, thread) => {
        let to = block.fields.TOUCHINGOBJECTMENU[0];
        const fieldValues = {
            _mouse_: -1,
            _edge_: -2,
        };
        let fieldValue = fieldValues[to];
        if (fieldValue) {
            thread.pushId(fieldValue);
        }
        else {
            thread.pushSymbolArg(symbolTypes.sprite, to);
        }
    },

    SENSING_TOUCHINGOBJECT: (block, thread) => {
        thread.pushOpcode(block.opcode);
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
    },

    CONTROL_REPEAT: (block, thread) => {
        thread.pushInput(block, block.inputs.TIMES);
        let framePos = thread.frame.getStorage(2);
        thread.pushOpcode("INNER_LOOPREPEATINIT");
        thread.pushId(framePos);
        let beginTarget = thread.serialized.length;
        thread.pushOpcode("INNER_LOOPREPEAT");
        thread.pushId(framePos);
        let breakout = thread.pushNewCodeRef();
        thread.pushInput(block, block.inputs.SUBSTACK)
        thread.pushOpcode("INNER_LOOPJUMP");
        let begin = thread.pushNewCodeRef();
        thread.satisfyCodeRef(begin, beginTarget);
        thread.satisfyCodeRef(breakout);
        thread.frame.returnStorage(2);
    },

    CONTROL_WAIT: (block, thread) => {
        let framePos = thread.frame.getStorage(1);
        for (let input of Object.values(block.inputs)) {
            thread.pushInput(block, input);
        }
        thread.pushOpcode(block.opcode);
        thread.pushId(framePos);
        thread.pushOpcode("INNER__WAITITERATION");
        thread.pushId(framePos);
        thread.frame.returnStorage(1);
    },

    CONTROL_WAIT_UNTIL: (block, thread) => {
        let beginTarget = thread.serialized.length;
        thread.pushInput(block, block.inputs.CONDITION);
        thread.pushOpcode("INNER_JUMPIF");
        let breakout = thread.pushNewCodeRef();
        thread.pushOpcode("INNER_LOOPJUMP");
        let begin = thread.pushNewCodeRef();
        thread.satisfyCodeRef(begin, beginTarget);
        thread.satisfyCodeRef(breakout);
    },

    CONTROL_REPEAT_UNTIL: (block, thread) => {
        let beginTarget = thread.serialized.length;
        thread.pushInput(block, block.inputs.CONDITION);
        thread.pushOpcode("INNER_JUMPIF");
        let breakout = thread.pushNewCodeRef();
        thread.pushInput(block, block.inputs.SUBSTACK);
        thread.pushOpcode("INNER_LOOPJUMP");
        let begin = thread.pushNewCodeRef();
        thread.satisfyCodeRef(begin, beginTarget);
        thread.satisfyCodeRef(breakout);
    },

    CONTROL_FOREVER: (block, thread) => {
        let beginTarget = thread.serialized.length;
        thread.pushInput(block, block.inputs.SUBSTACK);
        thread.pushOpcode("INNER_LOOPJUMP");
        let begin = thread.pushNewCodeRef();
        thread.satisfyCodeRef(begin, beginTarget);
    },

    CONTROL_IF: (block, thread) => {
        thread.pushInput(block, block.inputs.CONDITION);
        thread.pushOpcode("INNER_JUMPIFNOT");
        let falseCondition = thread.pushNewCodeRef();
        thread.pushInput(block, block.inputs.SUBSTACK);
        thread.satisfyCodeRef(falseCondition);
    },

    CONTROL_IF_ELSE: (block, thread) => {
        thread.pushInput(block, block.inputs.CONDITION);
        thread.pushOpcode("INNER_JUMPIFNOT");
        let falseCondition = thread.pushNewCodeRef();
        thread.pushInput(block, block.inputs.SUBSTACK);
        thread.pushOpcode("INNER_JUMP");
        let breakout = thread.pushNewCodeRef();
        thread.satisfyCodeRef(falseCondition);
        thread.pushInput(block, block.inputs.SUBSTACK2);
        thread.satisfyCodeRef(breakout);
    },

    LOOKS_COSTUMENUMBERNAME: (block, thread) => {
        thread.pushOpcode(block.opcode);
        if (block.fields.NUMBER_NAME[0] == "number") {
            thread.pushId(0);
        }
        else if (block.fields.NUMBER_NAME[0] == "name") {
            thread.pushId(1);
        }
    },

    SENSING_KEYOPTIONS: (block, thread) => {
        thread.pushOpcode("INNER_PUSHNUMBER");
        let option = block.fields.KEY_OPTION[0];
        let input = inputMap[option];
        thread.pushArg(input, argProcessors.fraction);
    },

    MOTION_SETROTATIONSTYLE: (block, thread) => {
        thread.pushOpcode(block.opcode);
        thread.pushId(["left-right", "don't rotate", "all around"].indexOf(block.fields.STYLE[0]));
    },

    MOTION_GOTO_MENU: (block, thread) => {
        let to = block.fields.TO[0];
        if (to === undefined) {
            console.error("incorrect assumption about the definite shape of motion_goto_menu. block is", block);
            return;
        }
        thread.pushOpcode("INNER_FETCHPOSITION");
        const fieldvalues = {
            _random_: -1,
            _mouse_: -2,
        };
        let fieldvalue = fieldvalues[to];
        if (fieldvalue) {
            thread.pushId(fieldvalue);
        }
        else {
            thread.pushSymbolArg(symbolTypes.sprite, to);
        }
    },

    MOTION_GOTO: (block, thread) => {
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode("MOTION_GOTOXY");
    },

    MOTION_GLIDETO_MENU: (block, thread) => {
        let to = block.fields.TO[0];
        if (to === undefined) {
            console.error("incorrect assumption about the definite shape of motion_glideto_menu. block is", block);
            return;
        }
        thread.pushOpcode("INNER_FETCHPOSITION");
        const fieldValues = {
            _random_: -1,
            _mouse_: -2,
        };
        let fieldvalue = fieldvalues[to];
        if (fieldvalue) {
            thread.pushId(fieldvalue);
        }
        else {
            thread.pushSymbolArg(symbolTypes.sprite, to);
        }
    },

    MOTION_GLIDESECSTOXY: (block, thread) => {
        let framePos = thread.frame.getStorage(5);
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode(block.opcode);
        thread.pushId(framePos);
        thread.pushOpcode("INNER__GLIDEITERATION");
        thread.pushId(framePos);
        thread.frame.returnStorage(5);
    },

    MOTION_GLIDETO: (block, thread) => {
        let framePos = thread.frame.getStorage(5);
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode("MOTION_GLIDESECSTOXY");
        thread.pushId(framePos);
        thread.pushOpcode("INNER__GLIDEITERATION");
        thread.pushId(framePos);
        thread.frame.returnStorage(5);
    },

    MOTION_XPOSITION: (block, thread) => {
        thread.pushOpcode(block.opcode);
        thread.pushId(-1);
    },

    MOTION_YPOSITION: (block, thread) => {
        thread.pushOpcode(block.opcode);
        thread.pushId(-1);
    },

    DATA_SETVARIABLETO: (block, thread) => {
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode(block.opcode);
        thread.pushVariableArg(block.fields.VARIABLE[1]);
    },

    DATA_CHANGEVARIABLEBY: (block, thread) => {
        for (let input of Object.values(block.inputs)) thread.pushInput(block, input);
        thread.pushOpcode(block.opcode);
        thread.pushVariableArg(block.fields.VARIABLE[1]);
    },
};


const UINT32_MAX = 4294967295;

export const opcodeArray = [
    "INNER_PARTITION_BEGINEXPRESSIONS",
    "SENSING_ANSWER",
    "SENSING_MOUSEDOWN",
    "SENSING_MOUSEX",
    "SENSING_MOUSEY",
    "SENSING_KEYPRESSED",
    "SENSING_LOUDNESS",
    "SENSING_TIMER",
    "SENSING_CURRENT",
    "SENSING_DAYSSINCE2000",
    "SENSING_USERNAME",
    "INNER_FETCHINPUT",
    "INNER_FETCHPOSITION",
    "INNER_FETCHVAR",
    "MOTION_XPOSITION",
    "MOTION_YPOSITION",
    "MOTION_DIRECTION",
    "LOOKS_COSTUME",
    "LOOKS_SIZE",
    "LOOKS_COSTUMENUMBERNAME",
    "LOOKS_BACKDROPNUMBERNAME",
    "SENSING_TOUCHINGOBJECT",
    "SENSING_TOUCHINGOBJECTMENU",
    "SENSING_TOUCHINGCOLOR",
    "SENSING_COLORISTOUCHINGCOLOR",
    "SENSING_DISTANCETO",
    "SENSING_DISTANCETOMENU",
    "SENSING_ASKANDWAIT",
    "SENSING_KEYOPTIONS",
    "SENSING_SETDRAGMODE",
    "SENSING_RESETTIMER",
    "SENSING_OF",
    "SENSING_OF_OBJECT_MENU",
    "INNER_PUSHNUMBER",
    "INNER_PUSHDEGREES",
    "INNER_PUSHTEXT",
    "INNER_PUSHID",
    "OPERATOR_ADD",
    "OPERATOR_SUBTRACT",
    "OPERATOR_MULTIPLY",
    "OPERATOR_DIVIDE",
    "OPERATOR_RANDOM",
    "OPERATOR_GT",
    "OPERATOR_LT",
    "OPERATOR_EQUALS",
    "INNER_LE",
    "INNER_GE",
    "OPERATOR_AND",
    "OPERATOR_OR",
    "OPERATOR_NOT",
    "OPERATOR_JOIN",
    "OPERATOR_LETTER_OF",
    "OPERATOR_LENGTH",
    "OPERATOR_CONTAINS",
    "OPERATOR_MOD",
    "OPERATOR_ROUND",
    "OPERATOR_MATHOP",
    "INNER_PUSHFRAME",
    "INNER_POPFRAME",
    "INNER_SETFRAMEVAR",
    "INNER_GETFRAMEVAR",
    "INNER_DEBUGEXPRESSION",
    "INNER_PARTITION_BEGINSTATEMENTS",
    "DATA_SETVARIABLETO",
    "DATA_CHANGEVARIABLEBY",
    "DATA_SHOWVARIABLE",
    "DATA_HIDEVARIABLE",
    "EVENT_BROADCAST",
    "INNER_LOOPJUMP",
    "INNER_LOOPREPEATINIT",
    "INNER_LOOPREPEAT",
    "CONTROL_CREATE_CLONE_OF",
    "CONTROL_WAIT",
    "CONTROL_WAIT_UNTIL",
    "CONTROL_CREATE_CLONE_OF_MENU",
    "CONTROL_DELETE_THIS_CLONE",
    "CONTROL_STOP",
    "INNER_JUMPIF",
    "INNER_JUMPIFNOT",
    "INNER_JUMP",
    "INNER_JUMPINDIRECT",
    "INNER__GLIDEITERATION",
    "MOTION_MOVESTEPS",
    "MOTION_TURNRIGHT",
    "MOTION_TURNLEFT",
    "MOTION_GOTO",
    "MOTION_GOTO_MENU",
    "MOTION_GOTOXY",
    "MOTION_GLIDETO",
    "MOTION_GLIDETO_MENU",
    "MOTION_GLIDESECSTOXY",
    "MOTION_POINTINDIRECTION",
    "MOTION_POINTTOWARDS",
    "MOTION_POINTTOWARDS_MENU",
    "MOTION_CHANGEXBY",
    "MOTION_SETX",
    "MOTION_CHANGEYBY",
    "MOTION_SETY",
    "MOTION_IFONEDGEBOUNCE",
    "MOTION_SETROTATIONSTYLE",
    "LOOKS_SAY",
    "LOOKS_SAYFORSECS",
    "LOOKS_THINK",
    "LOOKS_THINKFORSECS",
    "LOOKS_SWITCHCOSTUMETO",
    "LOOKS_NEXTCOSTUME",
    "LOOKS_SWITCHBACKDROPTO",
    "LOOKS_BACKDROPS",
    "LOOKS_NEXTBACKDROP",
    "LOOKS_CHANGESIZEBY",
    "LOOKS_SETSIZETO",
    "LOOKS_CHANGEEFFECTBY",
    "LOOKS_SETEFFECTTO",
    "LOOKS_CLEARGRAPHICEFFECTS",
    "LOOKS_SHOW",
    "LOOKS_HIDE",
    "LOOKS_GOTOFRONTBACK",
    "LOOKS_GOFORWARDBACKWARDLAYERS",
    "INNER__WAITITERATION",
    "INNER_DEBUGSTATEMENT",
];

export const opcodeEnum = Object.fromEntries(
  Object.entries(opcodeArray).map(([key, val]) => [val, key]),
);

const enums = {
    unobscuredShadow: 1,
    noShadow: 2,
    obscuredShadow: 3,
    NUM: 4,
    POSNUM: 5,
    WHOLENUM: 6,
    INTNUM: 7,
    ANGLENUM: 8,
    COLOR: 9,
    TEXT: 10,
    BROADCAST: 11,
    VAR: 12,
    LIST: 13,
    OBJECTREF: 14,
};

export const definitions = {};
for (const [key, value] of Object.entries(enums)) {
  definitions[key] = value;
  definitions[value] = key; // reverse mapping
}

export const inputMap = {
    "up arrow": 0,
    "w": 0,
    "left arrow": 1,
    "a": 1,
    "down arrow": 2,
    "s": 2,
    "right arrow": 3,
    "d": 3,
    "space": 4
};

export const events = [
    "EVENT_WHENKEYPRESSED",
    "EVENT_WHENBROADCASTRECEIVED",
    "EVENT_WHENBACKDROPSWITCHESTO",
    "CONTROL_START_AS_CLONE",
    "EVENT_WHENFLAGCLICKED",
    "EVENT_WHENTHISSPRITECLICKED",
    "EVENT_WHENGREATERTHAN",
];

// endianness should be supplied as a string, or not passed at all. Current design only respects little-endian.
function reportField(block, field, code) {
    console.warn("in pushField:", block, field);
}

function getEventCondition(hat, project) {
    let defaultFunc = () => {return Promise.resolve(0)};
    const eventFuncs = {
        EVENT_WHENKEYPRESSED: () => {
            return Promise.resolve(inputMap[hat.fields.KEY_OPTION[0]] || -1);
        },
        EVENT_WHENBROADCASTRECEIVED: () => {
            return project.getSymbol(null, symbolTypes.broadcast, hat.fields.BROADCAST_OPTION[0]).value;
        },
        EVENT_WHENBACKDROPSWITCHESTO: () => {
            return project.getSymbol(null, symbolTypes.backdrop, hat.fields.BACKDROP[0]).value;
        },
        CONTROL_START_AS_CLONE: defaultFunc,
        EVENT_WHENFLAGCLICKED: defaultFunc,
        EVENT_WHENTHISSPRITECLICKED: defaultFunc,
        EVENT_WHENGREATERTHAN: defaultFunc,
    };
    if (eventFuncs[hat.opcode]) return eventFuncs[hat.opcode]();
    return {};
}

function newSprite() {
    return {
        name: null,
        id: null,
        body: {},
        blocks: {},
        threads: [],
    };
}

function newProjectIndex() {
    return {
        stage: null,
        sprites: [],
        json: null,
        globalIndex: {},
        typesIndex: {},
        code: [],
        requireSymbol: function(owner, type, id) {
            if (this.typesIndex[type] == undefined) this.typesIndex[type] = 0;
            let key = JSON.stringify([owner, type, id]);
            let symbol = this.globalIndex[key];
            if (!symbol) {
                symbol = {
                    value: null,
                    resolve: null
                };
                symbol.value = new Promise((res) => {
                    symbol.resolve = res;
                });
                this.globalIndex[key] = symbol;
            }
            return symbol;
        },
        getSymbol: function(owner, type, id) {
            if (type in ownerlessSymbolTypes) owner = null;
            let symbol = this.requireSymbol(owner, type, id);
            return symbol;
        },
        declareSymbol: function(owner, type, id, value) {
            if (type in ownerlessSymbolTypes) owner = null;
            let symbol = this.requireSymbol(owner, type, id);
            value = value || this.typesIndex[type];
            this.typesIndex[type]++;
            symbol.resolve(value);
        },
    };
}

async function compileBlocks(projectIndex, sprite, blocks, code) {
    for (let [id, block] of Object.entries(blocks)) {
        if (!block.topLevel) continue;
        if (events.includes(block.opcode.toUpperCase())) {
            let thread = new Thread(projectIndex, sprite, block, code);
            let settled = await thread.settle(1000);
            if (!settled) {
                console.error("Thread", thread, "failed to resolve");
            }
            sprite.threads.push(thread);
        }
        else if (block.opcode.toUpperCase() == "PROCEDURES_DEFINITION") {
            let thread = new Thread(projectIndex, sprite, block, code, true);
            let prototype = blocks[block.inputs.custom_block[1]];
            console.warn(block, prototype);
            projectIndex.declareSymbol(sprite.id, symbolTypes.func, prototype.mutation.proccode, thread);
        }
    }
}

async function compileSprite(projectIndex, sprite, code) {
    let target = sprite.body;
    let varCount = 0;
    for (let [varId, varData] of Object.entries(target.variables)) {
        projectIndex.declareSymbol(sprite.id, symbolTypes.variable, varId, [sprite.id, varCount++]);
    }
    for (let [broadcastId, broadcastName] of Object.entries(target.broadcasts)) {
        projectIndex.declareSymbol(null, symbolTypes.broadcast, broadcastName);
    }
    for (let [index, costume] of Object.entries(sprite.body.costumes)) {
        index = Number(index);
        let owner = sprite.id;
        let type = symbolTypes.costume;
        if (sprite.body.isStage) {
            owner = null;
            type = symbolTypes.backdrop;
        }
        projectIndex.declareSymbol(owner, type, costume.name, index + 1);

    }
    let blocks = target.blocks;
    await compileBlocks(projectIndex, sprite, blocks, code);
}

export async function compileProject(projectIndex) {
    let targets = projectIndex.json.targets;
    for (let [index, target] of Object.entries(targets)) {
        projectIndex.declareSymbol(null, symbolTypes.sprite, target.name, index);
        let sprite = newSprite();
        sprite.id = index;
        sprite.name = target.name;
        sprite.body = target;
        await compileSprite(projectIndex, sprite, projectIndex.code);
        projectIndex.sprites.push(sprite);
    }
    projectIndex.stage = projectIndex.sprites[0];
}

function maskedMerge(obj1, obj2) {
  const result = {};
  for (const key of Object.keys(obj1)) {
    result[key] = key in obj2 ? obj2[key] : obj1[key];
  }
  return result;
}

export async function compileProjectFile(projectJson) {
    let project = newProjectIndex();
    project.json = projectJson;
    await compileProject(project);
    return project;
}

export function getCodeAsCarray(code) {
    let values = code.join(", ");
    return ["const uint8_t code[] = {", values, "};\n"].join("");
}

export function getCodeAsBuffer(code) {
    return code.map((num) => {
        let value = Number(opcodeEnum[num] || num);
        if (Number.isNaN(value)) {
            console.error("value ", num, " not in opcodes and not a number");
        }
        return value;
    });
}

