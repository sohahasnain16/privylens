/**
 * Browser-only helper: turn any picked/captured image into a downscaled JPEG.
 * The on-device model accepts JPEG and PNG only, and small images are faster.
 */
export async function prepareImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // JPEG has no alpha
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", base64: dataUrl.split(",")[1], dataUrl, name: file.name || "photo" };
}

/** A synthetic electricity bill (fictional data) so judges can try the photo path without a camera. */
export async function makeSamplePhoto() {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 1100;
  const g = c.getContext("2d");
  g.fillStyle = "#fffdf7";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1a1a1a";
  g.font = "bold 38px Arial, sans-serif";
  g.fillText("KARACHI POWER — ELECTRICITY BILL", 40, 80);
  g.fillRect(40, 100, 820, 4);
  const lines = [
    ["Consumer", "Ayesha Noor"],
    ["CNIC", "42201-1122334-5"],
    ["Phone", "0321-5551234"],
    ["Account no.", "0400123456"],
    ["Billing month", "November 2026"],
    ["Units consumed", "612 kWh"],
    ["Energy charges", "PKR 14,880"],
    ["Fuel price adjustment", "PKR 2,310"],
    ["Late payment surcharge", "PKR 1,260 (if paid after due date)"],
    ["TOTAL PAYABLE", "PKR 18,450"],
    ["Due date", "30 Nov 2026"],
    ["Payable after due date", "PKR 19,710"],
  ];
  let y = 170;
  for (const [k, v] of lines) {
    const strong = k === "TOTAL PAYABLE";
    g.font = `${strong ? "bold " : ""}30px Arial, sans-serif`;
    g.fillStyle = "#444";
    g.fillText(k, 40, y);
    g.fillStyle = strong ? "#b00020" : "#111";
    g.fillText(v, 400, y);
    y += 62;
  }
  g.fillStyle = "#b00020";
  g.font = "bold 28px Arial, sans-serif";
  g.fillText("Connection may be disconnected after 2 unpaid bills.", 40, y + 30);
  const dataUrl = c.toDataURL("image/jpeg", 0.9);
  return { mimeType: "image/jpeg", base64: dataUrl.split(",")[1], dataUrl, name: "sample-bill.jpg" };
}
