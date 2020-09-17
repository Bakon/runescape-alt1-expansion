import * as sharp from "sharp";
import * as OCR from "@alt1/ocr";
import * as a1lib from "@alt1/base";
import { loader } from "webpack";

type FontMeta = {
	basey: number,
	spacewidth: number,
	treshold: number,
	color: [number, number, number],
	shadow: boolean,
	chars: string,
	seconds: string
	img?: string,
	bonus?: { [char: string]: number },
	unblendmode: "removebg" | "raw" | "blackbg"
};


function cloneImage(img: ImageData, x, y, w, h) {
	let clone = new a1lib.ImageData(w, h);
	img.copyTo(clone, x, y, w, h, 0, 0);
	return clone;
}

export default async function (this: loader.LoaderContext, source: string) {
	this.cacheable(true);
	let me = this;
	let meta = JSON.parse(source) as FontMeta;
	if (!meta.img) { meta.img = this.resourcePath.replace(/\.fontmeta\.json$/, ".data.png"); }

	this.addDependency(meta.img);
	this.async();
	//TODO make sure the image doesn't contain the srgb header

	let bytes = await new Promise((done, err) => {
		this.fs.readFile(meta.img, (e, buf) => {
			if (e) { err(e); }
			done(buf);
		})
	}) as Buffer;
	let byteview = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	a1lib.ImageDetect.clearPngColorspace(byteview);
	//currently still need the sharp package instead of node-canvas for this to prevent losing precision due to premultiplied alphas
	let imgfile = sharp(bytes);
	let imgdata = await imgfile.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	let img = new a1lib.ImageData(new Uint8ClampedArray(imgdata.data.buffer), imgdata.info.width, imgdata.info.height);
	if (imgdata.info.premultiplied) { console.warn("png unpacking used premultiplied alpha, pixels with low alpha values have suffered loss of presicion in rgb channels"); }

	let bg: ImageData | null = null;
	let pxheight = img.height - 1;
	if (meta.unblendmode == "removebg") { pxheight /= 2; }
	let inimg = cloneImage(img, 0, 0, img.width, pxheight);
	let outimg: ImageData;
	if (meta.unblendmode == "removebg") {
		bg = cloneImage(img, 0, pxheight + 1, img.width, pxheight);
		outimg = OCR.unblendKnownBg(inimg, bg, meta.shadow, meta.color[0], meta.color[1], meta.color[2]);
	} else if (meta.unblendmode == "raw") {
		outimg = OCR.unblendTrans(inimg, meta.shadow, meta.color[0], meta.color[1], meta.color[2]);
	} else if (meta.unblendmode == "blackbg") {
		outimg = OCR.unblendBlackBackground(inimg, meta.color[0], meta.color[1], meta.color[2])
	} else {
		throw "no unblend mode";
	}
	let unblended = new a1lib.ImageData(img.width, pxheight + 1);
	outimg.copyTo(unblended, 0, 0, outimg.width, outimg.height, 0, 0);
	img.copyTo(unblended, 0, pxheight, img.width, 1, 0, pxheight);

	let font = OCR.generatefont(unblended, meta.chars, meta.seconds, meta.bonus || {}, meta.basey, meta.spacewidth, meta.treshold, meta.shadow);

	me.callback(null, JSON.stringify(font));
};


//debug function used to be able to view an image while inside a webpack process
//paste the returned string in a console with old alt1 libraries loaded
function exportimg(img: ImageData) {
	return "(function(){let b=new ImageData(" + img.width + "," + img.height + "); b.data.set([" + img.data + "]); b.show(); console.clear(); return b;})()";
}