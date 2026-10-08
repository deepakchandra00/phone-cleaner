// Export the approved green foreground to every surface; no alternative logo is drawn.
// sharp is a development-only asset tool. It is not added to app dependencies.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const brand = require('../branding.json');
const out = path.join(root, 'store-metadata/assets');
const masterPath = path.join(root, brand.master);
const image = `data:image/png;base64,${fs.readFileSync(masterPath).toString('base64')}`;
const svg = (w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const mark = (x,y,size) => `<image x="${x}" y="${y}" width="${size}" height="${size}" xlink:href="${image}"/>`;
const background = `<defs><linearGradient id="green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22C55E"/><stop offset=".52" stop-color="${brand.iconBackground}"/><stop offset="1" stop-color="#064E2B"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#green)"/>`;
async function save(name, source, alpha=true) {
 const target=path.join(out,name);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target.replace(/\.png$/,'.svg'),source);
 let raster=sharp(Buffer.from(source));
 raster=alpha?raster.ensureAlpha():raster.flatten({background:brand.iconBackground}).removeAlpha();
 await raster.png().toFile(target);
}
(async()=>{
 await save('brand/launcher.png',svg(1024,1024,background+mark(98,98,828)));
 await save('brand/adaptive-background.png',svg(1024,1024,background));
 // Same composition as store/legacy icon; Android magnifies its adaptive layers 1.5×.
 await save('brand/adaptive-foreground.png',svg(1024,1024,mark(236,236,552)));
 await sharp(path.join(out,'brand/launcher.png')).resize(512,512).ensureAlpha().png().toFile(path.join(out,'play-icon.png'));
 // PNG icon is derived directly from launcher; SVG is the identical scalable layout.
 fs.writeFileSync(path.join(out,'play-icon.svg'),svg(512,512,`<g transform="scale(.5)">${background}${mark(98,98,828)}</g>`));
 await save('brand/logo.png',svg(512,512,mark(0,0,512)));
 await save('brand/wordmark.png',svg(1100,260,mark(0,0,260)+`<text x="284" y="157" font-family="Arial, sans-serif" font-size="110" font-weight="700" fill="#123524">SmartCare</text>`));
 await save('feature-graphic.png',svg(1024,500,`<rect width="1024" height="500" fill="#064E2B"/><circle cx="900" cy="60" r="250" fill="#0D693B"/><circle cx="880" cy="470" r="220" fill="#157F45"/>${mark(615,70,380)}<text x="80" y="184" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#FFFFFF">Make room for</text><text x="80" y="250" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#FFFFFF">what matters.</text><text x="82" y="310" font-family="Arial, sans-serif" font-size="23" fill="#DCFCE7">Review files. Keep your favourites.</text><text x="82" y="364" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#86EFAC">SmartCare</text>`),false);
 for (const [from,to] of [['brand/launcher.png','icon.png'],['brand/adaptive-foreground.png','adaptive-icon.png'],['brand/adaptive-background.png','adaptive-background.png'],['brand/logo.png','logo.png']])fs.copyFileSync(path.join(out,from),path.join(root,'src/assets',to));
 await sharp(path.join(out,'brand/launcher.png')).resize(48,48).png().toFile(path.join(root,'src/assets/favicon.png'));
 for (const shape of ['circle','squircle']) {
  const mask=shape==='circle'?'<circle cx="256" cy="256" r="256" fill="white"/>':'<rect width="512" height="512" rx="154" fill="white"/>';
  const preview=await sharp(path.join(out,'play-icon.png')).composite([{input:Buffer.from(svg(512,512,mask)),blend:'dest-in'}]).png().toBuffer();
  fs.mkdirSync(path.join(out,'validation'),{recursive:true});
  fs.writeFileSync(path.join(out,'validation',`mask-${shape}.png`),preview);
 }
 // Sync an existing ignored native checkout too, without prebuild/compilation.
 // EAS ignores this directory and regenerates it from the same Expo config/assets.
 const native=path.join(root,'android/app/src/main/res');
 if(fs.existsSync(native)) {
  for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]) {
   const dir=path.join(native,`mipmap-${density}`);fs.mkdirSync(dir,{recursive:true});
   await sharp(path.join(out,'brand/launcher.png')).resize(48*scale,48*scale).webp({lossless:true}).toFile(path.join(dir,'ic_launcher.webp'));
   await sharp(path.join(out,'validation/mask-circle.png')).resize(48*scale,48*scale).webp({lossless:true}).toFile(path.join(dir,'ic_launcher_round.webp'));
   await sharp(path.join(out,'brand/adaptive-background.png')).resize(108*scale,108*scale).webp({lossless:true}).toFile(path.join(dir,'ic_launcher_background.webp'));
   await sharp(path.join(out,'brand/adaptive-foreground.png')).resize(108*scale,108*scale).webp({lossless:true}).toFile(path.join(dir,'ic_launcher_foreground.webp'));
  }
  for(const name of ['ic_launcher.xml','ic_launcher_round.xml']) {
   const p=path.join(native,'mipmap-anydpi-v26',name);
   if(fs.existsSync(p))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('@color/iconBackground','@mipmap/ic_launcher_background'));
  }
  const colours=path.join(native,'values/colors.xml');
  if(fs.existsSync(colours))fs.writeFileSync(colours,fs.readFileSync(colours,'utf8').replace(/(<color name="(?:iconBackground|splashscreen_background)">)[^<]+/g,`$1${brand.iconBackground}`).replace(/(<color name="colorPrimary">)[^<]+/g,`$1${brand.primary}`));
  // Existing native splash drawables must not continue to display the old S.
  for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]) {
   const dir=path.join(native,`drawable-${density}`);
   const target=path.join(dir,'splashscreen_logo.png');
   if(fs.existsSync(target))await sharp(path.join(out,'brand/launcher.png')).resize(Math.round(288*scale),Math.round(288*scale)).png().toFile(target);
  }
 }
 for(const name of ['play-icon.png','feature-graphic.png','brand/adaptive-foreground.png']) {
  const meta=await sharp(path.join(out,name)).metadata();console.log(name,meta.width,meta.height,'alpha='+meta.hasAlpha,fs.statSync(path.join(out,name)).size+' bytes');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
