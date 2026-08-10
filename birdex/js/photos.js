/* =========================================================================
 * Photo intake.
 *
 * Phone cameras produce 3-12 MB files. Storing those untouched fills a
 * device quota after a couple of hundred birds, so every import is
 * re-encoded to a display-sized JPEG plus a small square thumbnail for
 * the grids. The original file is never kept.
 * ====================================================================== */
(function (global) {
  'use strict';

  const Birdex = global.Birdex = global.Birdex || {};
  const photos = Birdex.photos = {};

  const FULL_MAX = 1600;   // longest edge of the stored photo
  const THUMB = 400;       // square thumbnail edge
  const FULL_Q = 0.82;
  const THUMB_Q = 0.75;

  /** Decode a File/Blob to something drawable, preferring the fast path. */
  function decode(file) {
    if (global.createImageBitmap) {
      /* imageOrientation only matters for JPEGs with an EXIF rotation. */
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(() => decodeViaImg(file));
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  function toBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Encoding failed.')), 'image/jpeg', quality);
      } else {
        reject(new Error('Canvas encoding is unavailable.'));
      }
    });
  }

  function draw(src, w, h, sx, sy, sw, sh) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return c;
  }

  /**
   * File -> { full, thumb, w, h } ready to hand to the store.
   * The thumbnail is a centre crop so grids stay tidy; the full copy keeps
   * the original aspect ratio.
   */
  photos.process = function (file) {
    return decode(file).then(src => {
      const iw = src.width || src.naturalWidth;
      const ih = src.height || src.naturalHeight;
      if (!iw || !ih) throw new Error('That file did not look like an image.');

      const scale = Math.min(1, FULL_MAX / Math.max(iw, ih));
      const fw = Math.max(1, Math.round(iw * scale));
      const fh = Math.max(1, Math.round(ih * scale));
      const fullCanvas = draw(src, fw, fh, 0, 0, iw, ih);

      const side = Math.min(iw, ih);
      const thumbCanvas = draw(src, THUMB, THUMB, (iw - side) / 2, (ih - side) / 2, side, side);

      return Promise.all([toBlob(fullCanvas, FULL_Q), toBlob(thumbCanvas, THUMB_Q)])
        .then(([full, thumb]) => {
          if (src.close) src.close();
          return { full, thumb, w: fw, h: fh };
        });
    });
  };

  /** Import a list of files into one sighting, skipping anything unreadable. */
  photos.importFiles = function (files, meta, onProgress) {
    const list = Array.from(files).filter(f => !f.type || f.type.indexOf('image/') === 0);
    const made = [];
    let done = 0;

    return list.reduce((chain, file) => chain.then(() =>
      photos.process(file).then(out => {
        const photo = {
          id: Birdex.store.id('ph'),
          sightingId: meta.sightingId,
          speciesId: meta.speciesId,
          ts: meta.ts || Date.now(),
          full: out.full, thumb: out.thumb, w: out.w, h: out.h,
          bytes: out.full.size + out.thumb.size
        };
        return Birdex.store.putPhoto(photo).then(() => { made.push(photo); });
      }).catch(err => {
        console.warn('Skipped a photo:', err);
      }).then(() => {
        done++;
        if (onProgress) onProgress(done, list.length);
      })
    ), Promise.resolve()).then(() => made);
  };

  /** A generated stand-in, used by the demo so tests need no camera. */
  photos.synthetic = function (seed) {
    const c = document.createElement('canvas');
    c.width = c.height = 480;
    const ctx = c.getContext('2d');
    const hue = (seed * 47) % 360;
    const g = ctx.createLinearGradient(0, 0, 480, 480);
    g.addColorStop(0, 'hsl(' + hue + ',45%,32%)');
    g.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ',35%,14%)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 480);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 40; i++) {
      const x = (seed * 13 + i * 97) % 480, y = (seed * 29 + i * 53) % 480;
      ctx.beginPath();
      ctx.arc(x, y, 6 + (i % 5) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return toBlob(c, 0.7).then(blob => ({ full: blob, thumb: blob, w: 480, h: 480 }));
  };

})(window);
