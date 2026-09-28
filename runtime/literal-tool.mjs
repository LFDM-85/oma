// Qwen's XML tool format has ambiguous boundary whitespace for string values.
// A JSON object retains literal newlines/spaces without trimming user content.
export function literalTool(tool){
 return {...tool,
  description:'This tool has exactly one top-level argument: input. Put all fields inside that JSON object; never pass them as top-level arguments or nested XML parameters. Preserve exact text and whitespace. '+tool.description,
  parameters:{type:'object',properties:{input:tool.parameters},required:['input'],additionalProperties:false},
  execute:async(id,args,...rest)=>{
   if(!args?.input||typeof args.input!=='object'||Array.isArray(args.input))throw Error('Structured input is required');
   return tool.execute(id,args.input,...rest);
  }
 };
}
