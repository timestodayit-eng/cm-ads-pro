// Shared browser/server validation. Storage limits are enforced again on completion.
export const MAX_VIDEO_BYTES = 1024 ** 3;
export const MAX_IMAGE_BYTES = 30 * 1024 ** 2;
export const PART_BYTES = 8 * 1024 ** 2;
export const MEDIA_TYPES = {
 mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
 jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'
};
export function mediaError(message, code = 'INVALID_MEDIA', status = 400) {
 return Object.assign(new Error(message), { status, code });
}
export function validateMediaInput(input, maxVideoBytes = MAX_VIDEO_BYTES) {
 const name = String(input?.name || '').trim();
 if (!name || name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(name)) throw mediaError('Use a filename without paths or control characters (maximum 240 characters).');
 const extension = name.split('.').pop().toLowerCase();
 const mime = MEDIA_TYPES[extension];
 if (!mime) throw mediaError('Choose MP4, MOV, WebM, JPG, PNG or WebP. HTML and SVG uploads are not allowed.');
 if (input.type && input.type !== 'application/octet-stream' && input.type !== mime && !(extension === 'mov' && input.type === 'video/mp4')) throw mediaError('The file extension and media type do not match.');
 const bytes = Number(input.size);
 const limit = mime.startsWith('video/') ? Math.min(maxVideoBytes, MAX_VIDEO_BYTES) : MAX_IMAGE_BYTES;
 if (!Number.isSafeInteger(bytes) || bytes < 12 || bytes > limit) throw mediaError(`File must be between 12 bytes and ${Math.floor(limit / 1024 / 1024)} MiB.`, 'MEDIA_SIZE_LIMIT');
 if (!/^[a-f0-9]{64}$/.test(input.fingerprint || '')) throw mediaError('A valid file fingerprint is required. Please select the file again.');
 return { name, extension, mime, kind: mime.startsWith('video/') ? 'video' : 'image', bytes, fingerprint: input.fingerprint, partSize: PART_BYTES, partCount: Math.ceil(bytes / PART_BYTES) };
}
export function partLength(bytes, partNumber, partSize = PART_BYTES) {
 if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > Math.ceil(bytes / partSize)) throw mediaError('Invalid part number.');
 return Math.min(partSize, bytes - (partNumber - 1) * partSize);
}
export function validateParts(parts, bytes, partSize = PART_BYTES) {
 const sorted = [...parts].sort((a,b) => a.PartNumber - b.PartNumber);
 if (sorted.length !== Math.ceil(bytes / partSize)) throw mediaError('Some file parts are missing. Resume the upload.', 'UPLOAD_INCOMPLETE', 409);
 for (let i = 0; i < sorted.length; i++) {
  const p = sorted[i];
  if (p.PartNumber !== i + 1 || Number(p.Size) !== partLength(bytes, i+1, partSize) || typeof p.ETag !== 'string' || !p.ETag || p.ETag.length > 200) throw mediaError('An uploaded part has an unexpected size. Resume or restart this upload.', 'UPLOAD_PART_MISMATCH', 409);
 }
 return sorted.map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag }));
}
export function matchesMediaHeader(bytes, mime) {
 const b = new Uint8Array(bytes);
 const text = (a,z) => String.fromCharCode(...b.slice(a,z));
 if (mime === 'image/jpeg') return b[0] === 255 && b[1] === 216 && b[2] === 255;
 if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
 if (mime === 'image/webp') return text(0,4)==='RIFF' && text(8,12)==='WEBP';
 if (mime === 'video/webm') return [26,69,223,163].every((x,i)=>b[i]===x) && text(0,512).toLowerCase().includes('webm');
 if (mime === 'video/mp4') return text(4,8)==='ftyp' && !['avif','avis','heic','heix','mif1'].includes(text(8,12));
 if (mime === 'video/quicktime') return ['ftyp','moov','mdat','wide','free'].includes(text(4,8));
 return false;
}
export function bytesLabel(n) {
 if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GiB';
 if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MiB';
 return (n / 1024).toFixed(1) + ' KiB';
}
