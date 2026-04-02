
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
    "INNER_DEBUGEXPRESSION",
    "INNER_PARTITION_BEGINSTATEMENTS",
    "DATA_SETVARIABLETO",
    "DATA_CHANGEVARIABLEBY",
    "DATA_SHOWVARIABLE",
    "DATA_HIDEVARIABLE",
    "EVENT_BROADCAST",
    "INNER_LOOPJUMP",
    "CONTROL_CREATE_CLONE_OF",
    "CONTROL_WAIT",
    "CONTROL_WAIT_UNTIL",
    "CONTROL_CREATE_CLONE_OF_MENU",
    "CONTROL_DELETE_THIS_CLONE",
    "CONTROL_STOP",
    "INNER_LOCALS_PUSHARG",
    "INNER_LOCALS_POPARG",
    "INNER_LOCALS_GETARG",
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

const definitions = {};
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
function toScaledInt32Tuple(number, endianness) {
    if (endianness !== undefined && endianness !== "little") {
        console.error("toScaledInt32Tuple only handles little endian values");
        return undefined;
    }
    let whole = Math.floor(number);
    let fraction = number - whole;


    // fraction is given in scale 0 -> 1
    // I need to transform it to the scale 0 -> 65k (16bit int limit)
    
    fraction *= 65535;
    fraction = Math.round(fraction);

    let components = new Uint16Array([fraction, whole]);
    let componentBytes = new Uint8Array([fraction, fraction >> 8, whole, whole >> 8]); // All params implicitly masked by 8
    return componentBytes;
}

function toBytes(string) {
    const bytes = new TextEncoder().encode(string);
    return bytes;
}

function toCodeLiteral(number, byteSize, endianness) {
    if (endianness !== undefined && endianness !== "little") {
        console.error("toCodeLiteral only handles little endian values");
        return undefined;
    }
    let bytes = [];
    for (let i = 0; i < byteSize; i++) {
        bytes.push(number & 0xff);
        number >>= 8;
    }
    return bytes;
}

function alignCode(code, mask) {
    while (code.length != (code.length & ~mask)) {
        code.push(0);
    }
}

function pushArg(code, arg) {
    alignCode(code, 3);
    code.push(...arg);
}

let globalObjectIndex = {
    sprites: {},
    broadcasts: {},
    backdrops: {},
    variables: {},
    costumes: {},
    stage: null,
    functions: {},
};

export function indexObjects(project) {
    globalObjectIndex = {
        sprites: {},
        broadcasts: {},
        backdrops: {},
        variables: {},
        costumes: {},
        stage: null,
        functions: {},
        functionParams: {},
        functionArgs: {},
    };
    let spriteCount = 0;
    let broadcastCount = 0;
    let backdropCount = 1;
    let variableCounts = {};
    let costumeCounts = {};
    let stage;
    let objectIndex = globalObjectIndex;
    for (let target of project.targets) {
        objectIndex.functions[target.name] = {};
        if (target.isStage) {
            stage = target;
        }
        variableCounts[target.name] = 0;
        costumeCounts[target.name] = 1;
        objectIndex.sprites[target.name] = objectIndex.sprites[target.name] || spriteCount++;
        for (let broadcast in target.broadcasts) {
            objectIndex.broadcasts[broadcast] = objectIndex.broadcasts[broadcast] || broadcastCount++;
        }
        let spriteIndex = objectIndex.sprites[target.name];
        for (let variable in target.variables) {
            let varIndex = objectIndex.variables[variable];
            if (varIndex === undefined) varIndex = variableCounts[target.name]++;
            else varIndex = varIndex[1];
            objectIndex.variables[variable] = [spriteIndex, varIndex];
        }
        for (let costume of target.costumes) {
            let key = JSON.stringify([target.name, costume.name]);
            let costumeIndex = objectIndex.costumes[key] || costumeCounts[target.name]++;
            objectIndex.costumes[key] = costumeIndex;
        }
    }
    for (let backdrop of stage.costumes) {
        objectIndex.backdrops[backdrop.name] = backdropCount++;
    }
    return objectIndex;
}

function findSprite(name) {
    return globalObjectIndex.sprites[name];
}

function findCostume(spriteName, costumeName) {
    return globalObjectIndex.costumes[JSON.stringify([spriteName, costumeName])]
}

function findBroadcast(name, id) {
    return globalObjectIndex.broadcasts[id];
}

function findBackdrop(name) {
    return globalObjectIndex.backdrops[name];
}

function findVariable(name, id) {
    return globalObjectIndex.variables[id];
}

function findFunction(name) {
}

const pushFuncs = {
    NUM: (input, code) => {
        let number = Number(input.value[0]);
        let opcode = "INNER_PUSHNUMBER";
        code.push(opcode);
        pushArg(code, toScaledInt32Tuple(number));
    },
    POSNUM: "NUM",
    WHOLENUM: "NUM",
    INTNUM: "NUM",
    ANGLENUM: (input, code) => {
        let degrees = Number(input.value[0]);
        let opcode = "INNER_PUSHDEGREES";
        code.push(opcode);
        degrees *= ((UINT32_MAX + 1) / 360);
        pushArg(code, toCodeLiteral(degrees, 4));
    },
    COLOR: (input) => {
        console.error("COLOR");
    },
    TEXT: (input, code) => {
        if (!isNaN(input.value[0])) {
            pushFuncs.NUM(input, code);
            return;
        }
        code.push("INNER_PUSHTEXT");
        code.push(...toBytes(input.value[0]));
        code.push(0);
    },
    BROADCAST: (input, code) => {
        code.push("INNER_PUSHID");
        let eventIndex = findBroadcast(input.value[0], input.value[1]);
        pushArg(code, toCodeLiteral(eventIndex, 2));
    },
    VAR: (input, code, blocks) => {
        code.push("INNER_FETCHVAR");
        let [spriteIndex, varIndex] = findVariable(...input.value);
        pushArg(code, toCodeLiteral(spriteIndex, 2));
        pushArg(code, toCodeLiteral(varIndex, 2));
    },
    LIST: (input) => {
        console.error("LIST");
    },
    OBJECTREF: (input, code, blocks, owner) => {
        let block = blocks[input.value];
        while (block != null) {
            compileBlock(block, code, blocks, owner);
            block = blocks[block.next];
        }
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

export function processField(field) {
    return field;
    // TODO: figure out the general shape of scratch fields and handle them here.
}

export function processBlock(block) {
    // stripped version of the block that contains everything we need
    block.opcode = block.opcode.toUpperCase();
    let processed = {
        opcode: block.opcode,
        next: block.next,
        parent: block.parent,
        topLevel: block.topLevel,
        inputs: {},
        fields: {},
    };
    for (let [key, value] of Object.entries(block.inputs)) {
        processed.inputs[key] = processInput(value);
    }
    for (let [key, value] of Object.entries(block.fields)) {
        processed.fields[key] = processField(value);
    }
    return processed;
}

export function processBlocks(blocks) {
    for (let [key, value] of Object.entries(blocks)) {
        blocks[key] = processBlock(value);
    }
}

function pushInput(input, code, blocks, owner) {
    let pushFunc = input.type;
    while (typeof pushFunc === "string") {
        pushFunc = pushFuncs[pushFunc];
    }
    if (pushFunc === undefined) {
        console.error("pushFuncs does not contain value for", input);
        return;
    }
    pushFunc(input, code, blocks, owner);
}

function inlineFunction(block, code, blocks, owner) {
    let newCode = [];
    let functionBlock = 0;
}

function reportField(block, field, code) {
    console.log("in pushField:", block, field);
}

function getEventCondition(hat, project) {
    let defaultFunc = () => {return 0};
    const eventFuncs = {
        EVENT_WHENKEYPRESSED: () => {
            return inputMap[hat.fields.KEY_OPTION[0]];
        },
        EVENT_WHENBROADCASTRECEIVED: () => {
            return findBroadcast(...hat.fields.BROADCAST_OPTION);
        },
        EVENT_WHENBACKDROPSWITCHESTO: () => {
            return findBackdrop(hat.fields.BACKDROP[0]);
        },
        CONTROL_START_AS_CLONE: defaultFunc,
        EVENT_WHENFLAGCLICKED: defaultFunc,
        EVENT_WHENTHISSPRITECLICKED: defaultFunc,
        EVENT_WHENGREATERTHAN: defaultFunc,
    };
    return eventFuncs[hat.opcode]();
}

// Initially, I optimized certain opcodes by cutting out "middleman" opcodes whose purpose is only to load data for the opcode which calls them.
// My VM is capable of loading values directly from the text of the bytecode rather than the normal method, which is to first push to the stack and then pop from it.
// Scratch often uses dynamic inputs instead of fields, even when the property cannot be chosen dynamically at runtime.
// Giving myself some charity, scratch is incredibly inconsistent about what it considers an "input" vs. a "field".
// The VM was architectured to optimize cases where an "input" really cannot change at runtime and just read them as fields for "simplicity".
// It did not turn out to be simpler, and in fact led to a much higher demand on the programmer to find where inputs are really inputs.
// This was an example of premature optimization, as the VM itself runs plenty quickly, and the special cases it requires the programmer to handle are not worth the complexity.
// The inconsistent strategy you will see among these opcode handlers is reflective of a pivot from the prior strategy to a simpler interpretation where inputs are trusted as inputs.
// A refactor is needed to bring everything up to consistency.
// This will allow the list of special functions to be much smaller.

let specialFunctions = {
    LOOKS_CHANGEEFFECTBY: () => {},
    LOOKS_SETEFFECTTO: () => {},
    PROCEDURES_CALL: (block, code, blocks, owner) => {
        // look up the positional arguments for the function with this name
        // push those from the input list in order
        // push the address of the next opcode
        // look up the code position of the function with this name
        // jump to it
    },
    OPERATOR_MATHOP: (block, code, blocks, owner) => {
        pushInput(block.inputs.NUM, code, blocks, owner);
        code.push("OPERATOR_MATHOP");
        pushArg(code, toCodeLiteral(["abs", "floor", "ceiling", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "e ^", "10 ^"].indexOf(block.fields.OPERATOR[0]), 2))
        console.log(code);
    },
    SENSING_OF: (block, code, blocks, owner) => {
        console.log(block.inputs);
        pushInput(block.inputs.OBJECT, code, blocks, owner);
        let propertyEnum = -1;
        switch (block.fields.PROPERTY[0]) {
            case "backdrop #":
            case "costume #":
                propertyEnum = 0;
                break;
            case "backdrop name":
            case "costume name":
                propertyEnum = 1;
                break;
            case "volume": 
                propertyEnum = 2;
                break;
            case "x position":
                propertyEnum = 3;
                break;
            case "y position":
                propertyEnum = 4;
                break;
            case "direction":
                propertyEnum = 5
                break;
            case "size":
                propertyEnum = 6;
                break;
            default:
                propertyEnum = 7 + findVariable(block.fields.PROPERTY[0], null);
        }
        code.push("SENSING_OF");
        pushArg(code, toCodeLiteral(propertyEnum, 2));
    },
    SENSING_OF_OBJECT_MENU: (block, code, blocks, owner) => {
        let target = block.fields.OBJECT[0];
        let targetIndex;
        if (target == "_stage_") targetIndex = 0;
        else targetIndex = findSprite(target);
        code.push("INNER_PUSHID");
        pushArg(code, toCodeLiteral(targetIndex, 2));
    },
    CONTROL_STOP: (block, code, blocks, owner) => {
        let options = ["this script", "all", "other scripts in sprite"];
        let index = options.indexOf(block.fields.STOP_OPTION[0]);
        code.push("INNER_PUSHID");
        pushArg(code, toCodeLiteral(index, 2));
        code.push("CONTROL_STOP");
    },
    CONTROL_CREATE_CLONE_OF_MENU: (block, code, blocks, owner) => {
        let cloneIndex = findSprite(block.fields.CLONE_OPTION[0]);
        if (cloneIndex === undefined) cloneIndex = -1;
        code.push("INNER_PUSHID");
        pushArg(code, toCodeLiteral(cloneIndex, 2));
    },
    LOOKS_SAYFORSECS: (block, code, blocks, owner) => {
        pushInput(block.inputs.MESSAGE, code, blocks, owner);
        code.push("LOOKS_SAY");
        pushInput(block.inputs.SECS, code, blocks, owner);
        code.push("CONTROL_WAIT");
        code.push("INNER__WAITITERATION");
        code.push("INNER_PUSHTEXT");
        code.push(0);
        code.push("LOOKS_SAY");
    },
    LOOKS_THINKFORSECS: (block, code, blocks, owner) => {
        pushInput(block.inputs.MESSAGE, code, blocks, owner);
        code.push("LOOKS_SAY");
        pushInput(block.inputs.SECS, code, blocks, owner);
        code.push("CONTROL_WAIT");
        code.push("INNER__WAITITERATION");
        code.push("INNER_PUSHTEXT");
        code.push(0);
        code.push("LOOKS_THINK");
    },
    LOOKS_SWITCHBACKDROPTO: (block, code, blocks, owner) => {
        code.push(block.opcode);
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
    },
    LOOKS_BACKDROPS: (block, code, blocks, owner) => {
        let costumeName = block.fields.BACKDROP[0];
        let spriteName = owner.name;
        let costumeIndex = (findCostume(spriteName, costumeName));
        pushArg(code, toCodeLiteral(costumeIndex, 2));
    },
    LOOKS_SWITCHCOSTUMETO: (block, code, blocks, owner) => {
        code.push(block.opcode);
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
    },
    LOOKS_COSTUME: (block, code, blocks, owner) => {
        let costumeName = block.fields.COSTUME[0];
        let spriteName = owner.name;
        let costumeIndex = (findCostume(spriteName, costumeName));
        pushArg(code, toCodeLiteral(costumeIndex, 2));
    },
    SENSING_TOUCHINGOBJECTMENU: (block, code) => {
        let to = block.fields.TOUCHINGOBJECTMENU[0];
        if (to === undefined) {
            console.error("incorrect assumption about the definite shape of motion_goto_menu. block is", block);
            return;
        }
        const fieldValues = {
            _mouse_: -1,
            _edge_: -2,
        };
        let fieldValue = fieldValues[to] || findSprite(to);
        pushArg(code, toCodeLiteral(fieldValue, 2));
    },
    SENSING_TOUCHINGOBJECT: (block, code, blocks, owner) => {
        code.push(block.opcode);
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
    },
    CONTROL_REPEAT: (block, code, blocks, owner) => {
        code.push("INNER_LOOPINIT"); // get a loop frame on the loop stack to track repetition
        let loopBegin = code.length;
        pushInput(block.inputs.TIMES, code, blocks, owner);
        code.push("INNER_JUMPIFREPEATDONE");
        let loopBreakPosition = code.length;
        alignCode(code, 3);
        code.push(0, 0); // to be filled with end-of-loop
        pushInput(block.inputs.SUBSTACK, code, blocks, owner);
        code.push("INNER_LOOPINCREMENT");
        code.push("INNER_LOOPJUMP");
        pushArg(code, toCodeLiteral(loopBegin, 2))
        code[loopBreakPosition] = (code.length & 0xff);
        code[loopBreakPosition + 1] = ((code.length >> 8) & 0xff);
    },
    CONTROL_WAIT: (block, code, blocks, owner) => {
        for (let input of Object.values(block.inputs)) {
            pushInput(input, code, blocks, owner);
        }
        code.push(block.opcode);
        code.push("INNER__WAITITERATION");
    },
    CONTROL_WAIT_UNTIL: (block, code, blocks, owner) => {
        let beginningIndex = code.length;
        pushInput(block.inputs.CONDITION, code, blocks, owner);
        code.push("INNER_JUMPIF");
        alignCode(code, 3);
        let argIndex = code.length;
        code.push(...[0, 0]);
        code.push("INNER_LOOPJUMP");
        pushArg(code, toCodeLiteral(beginningIndex, 2));
        code[argIndex] = (code.length & 0xff);
        code[argIndex + 1] = ((code.length >> 8) & 0xff);
    },
    CONTROL_REPEAT_UNTIL: (block, code, blocks, owner) => {
        let beginningIndex = code.length;
        pushInput(block.inputs.CONDITION, code, blocks, owner);
        code.push("INNER_JUMPIF");
        alignCode(code, 3);
        let argIndex = code.length;
        code.push(...[0, 0]);
        pushInput(block.inputs.SUBSTACK, code, blocks, owner);
        code.push("INNER_LOOPJUMP");
        pushArg(code, toCodeLiteral(beginningIndex, 2));
        code[argIndex] = (code.length & 0xff);
        code[argIndex + 1] = ((code.length >> 8) & 0xff);
    },
    CONTROL_FOREVER: (block, code, blocks, owner) => {
        let beginning = code.length;
        pushInput(block.inputs.SUBSTACK, code, blocks, owner);
        code.push("INNER_LOOPJUMP");
        pushArg(code, toCodeLiteral(beginning, 2));
    },
    CONTROL_IF: (block, code, blocks, owner) => {
        pushInput(block.inputs.CONDITION, code, blocks, owner);
        code.push("INNER_JUMPIFNOT");
        alignCode(code, 3);
        let index = code.length;
        code.push(0, 0);
        pushInput(block.inputs.SUBSTACK, code, blocks, owner);
        code[index] = (code.length & 0xff);
        code[index + 1] = ((code.length >> 8) & 0xff);
    },
    CONTROL_IF_ELSE: (block, code, blocks, owner) => {
        pushInput(block.inputs.CONDITION, code, blocks, owner);
        code.push("INNER_JUMPIFNOT");
        alignCode(code, 3);
        let elseIndex = code.length;
        code.push(0, 0);
        pushInput(block.inputs.SUBSTACK, code, blocks, owner);
        code.push("INNER_JUMP");
        alignCode(code, 3);
        let endIndex = code.length;
        code.push(0, 0);
        code[elseIndex] = (code.length & 0xff);
        code[elseIndex + 1] = ((code.length >> 8) & 0xff);
        console.log(block);
        pushInput(block.inputs.SUBSTACK2, code, blocks, owner);
        code[endIndex] = (code.length & 0xff);
        code[endIndex + 1] = ((code.length >> 8) & 0xff);
    },
    LOOKS_COSTUMENUMBERNAME: (block, code) => {
        code.push(block.opcode);
        if (block.fields.NUMBER_NAME[0] == "number") {
            pushArg(code, toCodeLiteral(0, 2));
        }
        else if (block.fields.NUMBER_NAME[0] == "name") {
            pushArg(code, toCodeLiteral(1, 2));
        }
    },
    SENSING_KEYOPTIONS: (block, code) => {
        code.push("INNER_PUSHNUMBER")
        pushArg(code, toScaledInt32Tuple(inputMap[block.fields.KEY_OPTION[0]]));
    },
    MOTION_SETROTATIONSTYLE: (block, code) => {
        code.push(block.opcode);
        pushArg(code, toCodeLiteral(["left-right", "don't rotate", "all around"].indexOf(block.fields.STYLE[0]), 2));
    },
    MOTION_GOTO_MENU: (block, code) => {
        let to = block.fields.TO[0];
        if (to === undefined) {
            console.error("incorrect assumption about the definite shape of motion_goto_menu. block is", block);
            return;
        }
        code.push("INNER_FETCHPOSITION");
        const fieldValues = {
            _random_: -1,
            _mouse_: -2,
        };
        let fieldValue = fieldValues[to] || findSprite(to);
        pushArg(code, toCodeLiteral(fieldValue, 2));
    },
    MOTION_GOTO: (block, code, blocks, owner) => {
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
        code.push("MOTION_GOTOXY");
    },
    MOTION_GLIDETO_MENU: (block, code) => {
        let to = block.fields.TO[0];
        if (to === undefined) {
            console.error("incorrect assumption about the definite shape of motion_glideto_menu. block is", block);
            return;
        }
        code.push("INNER_FETCHPOSITION");
        const fieldValues = {
            _random_: -1,
            _mouse_: -2,
        };
        let fieldValue = fieldValues[to] || findSprite(to);
        pushArg(code, toCodeLiteral(fieldValue, 2));
    },
    MOTION_GLIDESECSTOXY: (block, code, blocks, owner) => {
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
        code.push(block.opcode);
        code.push("INNER__GLIDEITERATION");
    },
    MOTION_GLIDETO: (block, code, blocks, owner) => {
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
        code.push("MOTION_GLIDESECSTOXY");
        code.push("INNER__GLIDEITERATION");
    },
    MOTION_XPOSITION: (block, code) => {
        code.push(block.opcode);
        pushArg(code, toCodeLiteral(-1, 2));
    },
    MOTION_YPOSITION: (block, code) => {
        code.push(block.opcode);
        pushArg(code, toCodeLiteral(-1, 2));
    },
    DATA_SETVARIABLETO: (block, code, blocks, owner) => {
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
        let [spriteIndex, variableIndex] = findVariable(...block.fields.VARIABLE);
        code.push(block.opcode);
        pushArg(code, toCodeLiteral(spriteIndex, 2));
        pushArg(code, toCodeLiteral(variableIndex, 2));
    },
    DATA_CHANGEVARIABLEBY: (block, code, blocks, owner) => {
        for (let input of Object.values(block.inputs)) pushInput(input, code, blocks, owner);
        let [spriteIndex, variableIndex] = findVariable(...block.fields.VARIABLE);
        code.push(block.opcode);
        pushArg(code, toCodeLiteral(spriteIndex, 2));
        pushArg(code, toCodeLiteral(variableIndex, 2));
    }
};

export function compileBlock(block, code, blocks, owner) {
    if (block.opcode.startsWith("SOUND")) {
        console.log("skipping sound block");
        return;
    }
    let specialFunction = specialFunctions[block.opcode];
    if (specialFunction !== undefined) {
        specialFunction(block, code, blocks, owner);
    }
    else {
        for (let input of Object.values(block.inputs)) {
            pushInput(input, code, blocks, owner);
        }
        code.push(block.opcode);
        if (Object.keys(block.fields).length > 0) {
        }
        for (let field of Object.values(block.fields)) {
            reportField(block, field, code);
        }
    }
}

function compileFunction(owner, blocks, code, functionName) {
    globalObjectIndex.functions[functionName].location = code.length
    let definition = blocks[functionName];
    let block = blocks[definition.next];
    while (block != null) {
        compileBlock(block, code, blocks, owner);
        block = blocks[block.next];
    }
    code.push("INNER_LOCALS_GETARG");
    pushArg(code, 0);
    code.push("INNER_JUMPINDIRECT");
}

export function compileBlocks(hat, owner, blocks, code, project) {
    indexObjects(project);
    let entryPoint = code.length;
    let startEvent = events.indexOf(hat.opcode);
    let eventCondition = getEventCondition(hat);
    let block = blocks[hat.next];
    while (block != null) {
        compileBlock(block, code, blocks, owner);
        block = blocks[block.next];
    }
    code.push("INNER_PUSHID");
    pushArg(code, [0, 0]);
    code.push("CONTROL_STOP");
    console.log(code)
    return {entryPoint, startEvent, eventCondition};
}

export function getCodeAsCarray(code) {
    let values = code.join(", ");
    return ["const uint8_t code[] = {", values, "};\n"].join("");
}

export function getCodeAsBuffer(code) {
    return code.map((num) => Number(opcodeEnum[num] || num));
}

function printCodeAsCarray(code) {
    console.log(getCodeAsCarray(code));
}
