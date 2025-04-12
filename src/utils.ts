export function destroyPage(targetElement: HTMLElement): void {
    targetElement.style.display = "none";

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.zIndex = "10000";
    document.documentElement.appendChild(overlay);

    const colorBars = document.createElement("div");
    colorBars.style.width = "100%";
    colorBars.style.height = "100%";
    colorBars.style.display = "flex";
    colorBars.style.flexDirection = "row";
    overlay.appendChild(colorBars);

    const colors = ["#FFFFFF", "#FFFF00", "#00FFFF", "#00FF00", "#FF00FF", "#FF0000", "#0000FF", "#000000"];
    colors.forEach((color) => {
        const bar = document.createElement("div");
        bar.style.width = `${100 / colors.length}%`;
        bar.style.height = "100%";
        bar.style.backgroundColor = color;
        colorBars.appendChild(bar);
    });

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.opacity = "1";
    overlay.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scaleFactor = 2;
    const canvasWidth = Math.ceil(width / scaleFactor);
    const canvasHeight = Math.ceil(height / scaleFactor);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const imageData = ctx!.createImageData(canvasWidth, canvasHeight);
    const data = imageData.data;

    const startTime = performance.now();
    const noiseDuration = 1000;

    function drawNoise() {
        const elapsed = performance.now() - startTime;
        if (elapsed < noiseDuration) {
            for (let i = 0; i < data.length; i += 4) {
                const value = Math.floor(Math.random() * 256);
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
                data[i + 3] = 255;
            }
            ctx?.putImageData(imageData, 0, 0);
            requestAnimationFrame(drawNoise);
        } else {
            canvas.style.opacity = "0";
        }
    }

    drawNoise();

    canvas.addEventListener("transitionend", () => {
        canvas.remove();
    });
}
