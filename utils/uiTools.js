function symbolKey(symbolId, sender) {
    if (typeof sender === "object") {
        sender = sender?.dataset?.name;
        if (!sender) sender = null;
    }
    return `${symbolId}\0${sender}`;
}

class StateTree {
    specialNames = [
        "configuration",
        "name",
        "onEnter",
        "onExit"
    ];
    constructor(uiSpace) {
        this.initial = null;
        this.states = {};
    }
    declare(name, obj, initial=false) {
        obj.name = name;
        this.states[name] = obj;
        console.log(name, obj, initial);
        if (initial) this.initial = name;
        console.log(this.initial);
        return this;
    }
    handles(state, symbolId) {
        let newState = state[symbolId];
        return newState != null;
    }
    transition(state, symbolId, sender, event) {
        let newStateSymbol = state[symbolId];
        if (newStateSymbol == null) throw new Error(`no such transition ${state.name} : ${symbolId}`);
        if (typeof newStateSymbol != "string") {
            newStateSymbol = newStateSymbol(sender);
            if (newStateSymbol == null) return state.name;
        }
        let newState = this.states[newStateSymbol];
        if (newState) {
            this.states[state.name]?.onExit();
            state.onEnter();
        }
        return newStateSymbol;
    }
}

class UiElement {
    constructor(element, stateTree=null, path=[], uiSpace=null) {
        console.log(stateTree);
        this.element = element;
        this.stateTree=stateTree;
        this.state = stateTree.initial;
        this.uiSpace = uiSpace;
        this.inPipes = {}
        this.outPipes = {}
        this.configurations = {}
        this.children = {}
        for (const child of this.element.children) {
            if (!child.dataset.name) continue;
            this.children[child.dataset.name] = new UiElement(child, stateTree);
        }
    }
    static from(query, stateTree=null, path=[], uiSpace=null) {
        console.log(stateTree);
        let element = document.querySelector(query);
        if (!element) throw new Error(`Element with selector '${query}' does not exist`);
        return new UiElement(element, stateTree, path, uiSpace);
    }
    registerConfiguration(name, baseChildren, setActive=[], setInactive=[]) {
        this.configurations[name] = {
            baseChildren: new Set(baseChildren),
            setActive: new Set(setActive),
            setInactive: new Set(setInactive),
        };
    }
    useConfiguration(name) {
        let {baseChildren, setActive, setInactive} = this.configurations[name]
        let noBase = (baseChildren == null);
        for (let [name, child] of Object.entries(this.children)) {
            child.element.hidden = !((noBase || baseChildren.has(name)) && !(setInactive.has(name)) || setActive.has(name));
        }
    }
    registerStateUpdate(symbolId, handler, senderName=null) {
        // `handler` should take an argument `source`, the element who triggered the update
        this.inPipes[symbolKey(symbolId, senderName)] = handler;
    }
    update(symbolId, source=null, e=null) {
        if (this.stateTree.handles(this.state, symbolId)) {
            this.state = this.stateTree.transition(this.state, symbolId, source, e);
            return;
        }
        let specific = null;
        if (source != null) specific = this.inPipes[symbolKey(symbolId, source)];
        let generic = this.inPipes[symbolKey(symbolId, null)];
        let handler = specific || generic;
        if (handler) handler(source);
    }
    registerSymbolEmit(symbolId, target) {
        this.outPipes[symbolId] = target;
    }
    emit(symbolId, e) {
        let target = this.outPipes[symbolId];
        if (!target) throw new Error(`emitting unhandled symbol ${symbolId}`);
        target.update(symbolId, this.element);
    }
    forwardDomEvent(eventName, target, symbolId=null, preventDefault=false) {
        if (symbolId == null) symbolId = eventName;
        this.element.addEventListener(eventName, (event) => {
            if (preventDefault) event.preventDefault();
            target.update(symbolId, this.element, event);
        });
    }
}

class UiSpace {
    constructor() {
        this.declarations={};
    }
    createStateTree() {
        return new StateTree(this);
    }
    declareElement(path, callback) {
        let string = path.join('\0');
        this.declarations[string] = callback;
    }
    define(parentObj, childObj) {
    }
}

let tree = new StateTree(null);
tree.declare("test", {}, true);

let e = UiElement.from(".widgets", tree);
e.registerStateUpdate("click", ()=>{console.log("clicked")});
e.registerConfiguration("state0", ["test"]);
e.registerConfiguration("state1", []);

e.useConfiguration("state0");
e.children.test.forwardDomEvent("click", e);

console.log(e)
