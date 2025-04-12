import { destroyPage } from "./utils";

document.addEventListener("DOMContentLoaded", () => {
    const triggerElement = document.querySelector(".logo-circle");
    const main = document.querySelector("main");

    if (triggerElement) {
        let timeoutId: NodeJS.Timeout | undefined;
        const duration = 2000;

        function startEffect() {
            timeoutId = setTimeout(() => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]?.id) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "destroyPage" }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error("Error sending message:", chrome.runtime.lastError.message);
                                alert("Please open a webpage to use this feature.");
                            } else {
                                console.log("Response from content script:", response);
                            }
                        });
                    }
                });
                destroyPage(main as HTMLElement);
            }, duration);
        }

        function stopEffect() {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = undefined;
            }
        }

        triggerElement.addEventListener("mouseenter", startEffect);
        triggerElement.addEventListener("mouseleave", stopEffect);
    }
});
