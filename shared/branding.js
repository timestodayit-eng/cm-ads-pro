export const DEFAULT_PANEL_NAME='Coastal Ads Command Center';
export function validatePanelName(input){
 if(typeof input!=='string')throw Object.assign(new Error('Enter a panel name.'),{status:400,code:'INVALID_PANEL_NAME'});
 if(/[\x00-\x1f\x7f]/u.test(input))throw Object.assign(new Error('Panel name cannot contain control characters.'),{status:400,code:'INVALID_PANEL_NAME'});
 const value=input.normalize('NFC').trim().replace(/\s+/g,' ');
 if(value.length<3||value.length>80||/[<>\x00-\x1f\x7f]/u.test(value))throw Object.assign(new Error('Panel name must contain 3–80 printable characters without HTML tags.'),{status:400,code:'INVALID_PANEL_NAME'});
 return value;
}
