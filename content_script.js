let isRunInOptionsContext = browser.runtime.getBackgroundPage !== undefined ? true : false;
//bgConfig
const MIME_TYPE = {
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".txt": "text/plain",
}

//获得用户的配置
let bgPort = browser.runtime.connect({ name: "getConfig" });
let bgConfig = null;
bgPort.onMessage.addListener((c) => {
    c = JSON.parse(c);
    // console.log(c);
    bgConfig = c;
    // bgConfig.triggeredDistance = 100 * (window.devicePixelRatio);
    // bgConfig.enableIndicator = true;
    // bgConfig.enablePrompt = true;
})
// bgPort.postMessage("iam ready");

let actionNames = {
    ACT_OPEN: "打开",
    ACT_COPY: "复制",
    ACT_SEARCH: "搜索",
    ACT_DL: "下载"
}

class Prompt {
    constructor() {
        this.container = document.createElement("div");
        this.container.id = "GDPrompt";
        this.textContainer = document.createElement("div");
        this.arrow = document.createElement("i")
        this.arrow.id = "GDArrow";
        this.container.appendChild(this.arrow);
        this.container.appendChild(this.textContainer);
        this.hide();
        document.body.appendChild(this.container);
    }
    renderDir(d = DIR_U) {
        let name = "";
        switch (d) {
            case DIR_U:
                name = "GDArrow-U";
                break;
            case DIR_L:
                name = "GDArrow-L";
                break;
            case DIR_R:
                name = "GDArrow-R";
                break;
            case DIR_D:
                name = "GDArrow-D";
                break;
        }
        this.arrow.className = name;
    }

    renderText(t) {
        this.textContainer.textContent = t;
    }

    render(dir, text) {
        this.renderDir(dir);
        this.renderText(text);
    }
    stopRender() {
        this.hide();
    }
    display() {
        if (this.container.style.display === "none") this.container.style.display = "block";
    }
    hide() {
        this.container.style.display = "none";
    }
    remove() {
        document.body.removeChild(this.parent);
    }
}
class Indicator {
    constructor() {
        this.box = document.createElement("div");
        this.box.id = "GDIndicator";
        this.hide();
        document.body.appendChild(this.box);
    }
    place(x = 0, y = 0, radius = 0) {
        radius = radius / devicePixelRatio;
        this.box.style.left = (x - radius) + "px";
        this.box.style.top = (y - radius) + "px";
        let h = this.box.style.height = (radius * 2) + "px";
        let w = this.box.style.width = (radius * 2) + "px";
        this.box.style.borderRadius = w + " " + h;
    }
    display() {
        this.box.style.display = "initial";
    }
    hide() {
        this.box.style.display = "none";
    }
}
class DragClass {
    constructor(elem) {
        this.dragged = elem;
        this.handler = this.handler.bind(this);
        ["dragstart", "dragend", "dragover", "drop", "context", "contextmenu"].forEach(name =>
            this.dragged.addEventListener(name, this.handler, false)
        );
        this.selection = "";
        this.targetElem = null;
        this.targetType = TYPE_UNKNOWN;
        this.actionType = "textAction";
        this.direction = DIR_U;
        this.distance = 0;
        this.startPos = {
            x: 0,
            y: 0
        };
        this.endPos = {
            x: 0,
            y: 0
        };
        this.promptBox = null; //new Prompt();
        this.indicatorBox = null
        this.isFirstRender = true;
        document.addEventListener("DOMContentLoaded", () => {
            this.promptBox = new Prompt();
        });
        // this.offset = 2;
    }

    post() {
        let sel = ""; //选中的数据,文本，链接
        let text = ""; //选中的文本，跟上面的可能相同可能不同
        switch (this.targetType) {
            case TYPE_TEXT:
            case TYPE_TEXT_URL:
                text = sel = this.selection;
                break;
            case TYPE_TEXT_AREA:
                sel = this.targetElem.value;
                text = sel = sel.substring(this.targetElem.selectionStart, this.targetElem.selectionEnd);
                break;
            case TYPE_ELEM_A:
                sel = this.targetElem.href;
                text = this.targetElem.textContent;
                break;
            case TYPE_ELEM_IMG:
                sel = this.targetElem.src;
                break;
            case TYPE_ELEM:
                sel = "";
                break;
            default:
                break;
        }
        this.selection = sel;
        //sendMessage只能传递字符串化后（类似json）的数据
        //不能传递具体对象
        let sended = {
            direction: this.direction,
            selection: sel,
            textSelection: text,
            actionType: this.actionType,
            sendToOptions: false
        }
        if (isRunInOptionsContext) {
            sended.sendToOptions = true;
            backgroundPage.executor.DO(sended);
        }
        else browser.runtime.sendMessage(sended);
    }
    dragstart(evt) {
        if (bgConfig.enableIndicator) {
            if (this.indicatorBox === null) this.indicatorBox = new Indicator();
            this.indicatorBox.place(evt.pageX, evt.pageY, bgConfig.triggeredDistance);
            this.indicatorBox.display();
        }
        this.targetElem = evt.target;
        this.selection = document.getSelection().toString();
        this.targetType = checkDragTargetType(this.selection, this.targetElem);
        this.actionType = getActionType(this.targetType);
        this.startPos.x = evt.screenX;
        this.startPos.y = evt.screenY;
    }
    dragend(evt) {
        this.promptBox.stopRender();
        this.indicatorBox && this.indicatorBox.hide();
        // this.selection = String.prototype.trim(this.selection);
        if (this.distance >= bgConfig.triggeredDistance) {
            this.post();
        }

    }
    dragover(evt) {
        this.distance = Math.hypot(this.startPos.x - evt.screenX, this.startPos.y - evt.screenY);
        if (this.distance > bgConfig.triggeredDistance) {
            this.direction = this.getDirection();
            if (bgConfig.enablePrompt) {
                this.promptBox.display();
                this.promptBox.render(this.direction, actionNames[
                    bgConfig.Actions[this.actionType][this.direction]["act_name"]
                ]);
            }
        }
        else {
            this.promptBox.stopRender();
        }
        evt.preventDefault();

    }
    handler(evt) {
        // console.log(evt);
        const type = evt.type;
        this.endPos.x = evt.screenX;
        this.endPos.y = evt.screenY;
        //TODO:把拖拽的数据放在event里传递
        // if (type === "contextmenu" && 1) {
        //     console.log(evt);
        //     this.dragend(evt);
        // }
        if (type === "dragstart") {
            this.dragstart(evt);
        }
        else if (type === "dragend") {
            this.dragend(evt)
        }
        else if (type === "drop") {
            // console.log(evt);
            //不加这行代码会产生副作用，在页面打开链接
            //不知道为什么
            evt.preventDefault();
        }
        else if (type === "dragover") {
            this.dragover(evt);
            //加上这行代码，拖拽时鼠标指针由禁止（一个圆加斜杠）变成正常的指针
            // console.log(evt);
        }
    }

    getDirection() {
        function between(ang, ang1, ang2) {
            return ang1 < ang2 && ang >= ang1 && ang < ang2;
        }
        let d = {
            normal: DIR_D, //普通的四个方向
            horizontal: DIR_L, //水平方向,只有左右
            vertical: DIR_D, //竖直方向，只有上下
            all: DIR_D //
        }

        let rad = Math.atan2(this.startPos.y - this.endPos.y, this.endPos.x - this.startPos.x);
        let degree = rad * (180 / Math.PI);
        degree = degree >= 0 ? degree : degree + 360; //-180~180转换成0~360
        if (between(degree, 45, 135)) d.normal = DIR_U;
        else if (between(degree, 135, 225)) d.normal = DIR_L;
        else if (between(degree, 225, 315)) d.normal = DIR_D;
        else d.normal = DIR_R;

        if (between(degree, 90, 270)) d.horizontal = DIR_L;
        else d.horizontal = DIR_R;

        if (between(degree, 0, 180)) d.vertical = DIR_U;
        else d.vertical = DIR_D;
        return d.normal; //暂时
    }

}


function getImageBase64(src = "", callback) {
    let pathname = new URL(src).pathname;
    let ext = pathname.substring(pathname.lastIndexOf("."), pathname.length);
    let img = new Image();
    img.src = src;
    img.onload = () => {
        //下面尝试得到图像的二进制数据
        let canvas = document.createElement("canvas");
        canvas.height = img.height;
        canvas.width = img.width;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        //得到没有data:image ...头的base64字符串
        let base64 = canvas.toDataURL("image/png", 1).split(",")[1];
        callback(base64);
        //发送给background，让background发送字符串到powershell脚本
        // browser.runtime.sendMessage({
        //     imageBase64: base64
        // });
        img = null;
        canvas = null;
        base64 = null;
        callback(base64)
    }
}

function CSlistener(msg) {
    // console.log("@from content_script");
    let needExecute = true;
    let elem = mydrag.targetElem;
    let input = document.createElement("textarea");
    input.style.width = "0px";
    input.style.height = "0px";

    if (elem instanceof HTMLAnchorElement) {
        switch (msg.copy_type) {
            case COPY_LINK:
                input.value = elem.href;
                break;
            case COPY_TEXT:
                input.value = elem.textContent;
                break;
            case COPY_IMAGE:
                mydrag.targetElem = elem.querySelector("img");
                CSlistener(msg); //可能有更好的办法
                return;
                //break;
        }
        // if (msg.copy_type === COPY_LINK) input.value = elem.href;
        // else if (msg.copy_type === COPY_TEXT) input.value = elem.textContent;
        // else if (msg.copy_type === COPY_IMAGE) {
        //     //如果复制链接里的图像
        //     drag.targetElem = elem.querySelector("img");
        //     listener(msg);
        // }
    }
    else if (elem instanceof HTMLImageElement) {
        if (msg.command === "copy") {
            switch (msg.copy_type) {
                case COPY_LINK:
                    input.value = elem.src;
                    break;
                case COPY_IMAGE:
                    needExecute = false;
                    getImageBase64(elem.src, (s) => {
                        browser.runtime.sendMessage({ imageBase64: s })
                    })
                    break;
            }
        }
        // if (msg.copy_type === COPY_LINK) input.value = elem.src;
        // else if (msg.copy_type === COPY_IMAGE) {
        //     dontExecute = true;
        //     getImageBase64(elem.src, (s) => {
        //         browser.runtime.sendMessage({ imageBase64: s })
        //     })
        // }
    }
    else {
        input.value = mydrag.selection;
    }
    if (needExecute) {
        elem.parentElement.appendChild(input);
        input.focus();
        input.setSelectionRange(0, input.value.length);
        document.execCommand("copy");
        elem.parentElement.removeChild(input);
    }
}

browser.runtime.onConnect.addListener(port => {
    if (port.name === "sendToContentScript") {
        port.onMessage.addListener(CSlistener);
    }
})

const mydrag = new DragClass(document.children[0]);