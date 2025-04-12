chrome.contextMenus.create({
    id: "destroyPage",
    title: "Destroy Page",
    contexts: ["page"],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "destroyPage" && tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: "destroyPage" });
    }
});
