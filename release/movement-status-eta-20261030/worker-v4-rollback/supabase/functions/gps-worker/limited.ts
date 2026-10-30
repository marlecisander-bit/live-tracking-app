export async function limitedText(response:Response,max=1000000){
 if(!response.body)return '';const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>max){await reader.cancel();throw Error('PROVIDER_SIZE');}parts.push(r.value);}}finally{reader.releaseLock();}
 const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.byteLength;}return new TextDecoder().decode(all);
}
