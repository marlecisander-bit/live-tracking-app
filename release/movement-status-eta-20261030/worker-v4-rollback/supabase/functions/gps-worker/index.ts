import {createHandler} from './handler.ts';
Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name)}));
