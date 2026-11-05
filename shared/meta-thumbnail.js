export function pickVideoThumbnail(result){
 const choices=Array.isArray(result?.data)?result.data:Array.isArray(result?.thumbnails?.data)?result.thumbnails.data:[];
 const preferred=choices.find(v=>v?.is_preferred&&typeof v?.uri==='string'&&v.uri.startsWith('https://'));
 const first=choices.find(v=>typeof v?.uri==='string'&&v.uri.startsWith('https://'));
 const url=preferred?.uri||first?.uri||(typeof result?.picture==='string'&&result.picture.startsWith('https://')?result.picture:null);
 return url;
}
