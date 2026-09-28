// Explicit sampling overrides for reproducible local-model comparisons.
export function localSamplingOptions(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid local sampling settings');
 const bounds={temperature:[0,2],top_p:[Number.MIN_VALUE,1],presence_penalty:[-2,2]};
 for(const [key,n] of Object.entries(value))if(!bounds[key]||!Number.isFinite(n)||n<bounds[key][0]||n>bounds[key][1])throw Error('Invalid local sampling parameter: '+key);
 const {temperature=.2,...samplingParams}=value;
 return {temperature,...(Object.keys(samplingParams).length?{samplingParams}:{})};
}
