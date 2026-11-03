import React from 'react';
export function Field({label,hint,children}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Badge({children,tone='neutral'}){return <span className={'badge '+tone}>{children}</span>;}
export function Notice({children,tone='subtle'}){return <div className={'notice '+tone}>{children}</div>;}
