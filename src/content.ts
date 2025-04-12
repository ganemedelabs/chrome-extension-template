// @ts-ignore
import { destroyPage } from "./utils";

const icon = document.createElement("img");
icon.src = chrome.runtime.getURL("images/icon-48.png");
icon.style.position = "fixed";
icon.style.bottom = "10px";
icon.style.left = "10px";
icon.style.width = "30px";
icon.style.height = "30px";
icon.style.cursor = "pointer";
icon.style.zIndex = "9999";
icon.title = "Click to destroy page";
icon.onmouseenter = () => (icon.style.scale = "1.3");
icon.onmouseleave = () => (icon.style.scale = "1");
icon.style.transition = "0.1s scale ease";
document.body.appendChild(icon);

icon.addEventListener("click", () => {
    destroyPage(document.body);
});

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
    if (message.action === "destroyPage") {
        destroyPage(document.body);
        sendResponse({ status: "Page destroyed" });
    }
});
