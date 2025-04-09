import { argv } from "node:process";
import decodeQR from "qr/decode.js";
import sharp from "sharp";
import { parse as validateData, pipe, regex, string } from "valibot";

const sessionid = validateData(
	pipe(string(), regex(/^[a-z0-9]{32}$/)),
	argv[2],
);

const response = await fetch(
	"https://foss-north.se/events/2025/register/viewticket/",
	{ headers: { Cookie: `sessionid=${sessionid}` } },
);
const data = await response.text();
const name = data.match(/<p class="ticket-regname">(.+?)<\/p>$/m);
const imageData = data.match(/data:image\/png;base64,([^"]+)"/);

if (imageData === null) {
	console.error("Could not find the QRCode on your ticket view.");
	process.exit(2);
}

const qrCode = sharp(Buffer.from(imageData[1], "base64url"));
const rawImage = await qrCode.raw().toBuffer({ resolveWithObject: true });
const barcode = decodeQR({
	width: rawImage.info.width,
	height: rawImage.info.height,
	data: rawImage.data,
});

const payload = new URLSearchParams({
	store: "foss-north 2025",
	note: "",
	balance: "0",
	validfrom: new Date("2025-04-14T00:00:00+0200").getTime().toString(),
	expiry: new Date("2025-04-15T24:00:00+0200").getTime().toString(),
	cardid: name !== null ? name[1] : "[UNKNOWN]",
	barcodeid: barcode,
	barcodetype: "QR_CODE",
	headercolor: "-464712",
});

const url = new URL("https://catima.app/share");
url.hash = encodeURIComponent(payload.toString());
console.log(url.toString());
