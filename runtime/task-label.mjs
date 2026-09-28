const clean=value=>String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,120);
export function taskLabel(name,args={}){
 if(name==='run_command'||name==='bash'){
  return commandLabel(args);

 }
 const labels={open_url:'Opening a web page',read_file:'Reading a file',write_file:'Writing a file',read:'Reading a file',write:'Writing a file',edit:'Editing a file',append_text_file:'Appending to a file',rename_file:'Renaming a file',remember:'Saving a preference',search_memory:'Searching conversation history',forget:'Removing saved information',accompany_window:'Moving beside the application',close_application_window:'Closing the requested window',cancel_application_close:'Cancelling the pending close',restore_floating:'Restoring floating mode',set_view_mode:args.mode==='mini'?'Switching to mini mode':'Restoring normal mode',desktop_screenshot:'Viewing the desktop',desktop_click:'Clicking on the desktop',desktop_type:'Typing into the application',desktop_key:'Sending a keyboard shortcut',camera_snapshot:'Looking through the camera',camera_list:'Checking cameras',confirm_action:'Waiting for your approval',end_conversation:'Ending the conversation',restart_assistant:'Restarting O.M.A.'};
 return labels[name]||'Working';
}

export function commandLabel(args={}){
 const quote=v=>/^[a-zA-Z0-9_./:=@+-]+$/.test(v)?v:"'"+v.replaceAll("'", "'\\''")+"'";
 const redact=v=>String(v).replace(/sk-[A-Za-z0-9_-]{12,}/g,'[redacted]').replace(/(Bearer\s+)\S+/gi,'$1[redacted]').replace(/((?:api[_-]?key|token|password|secret)=)[^\s&]+/gi,'$1[redacted]');
 const command=redact(args.command||'');
 if(!Array.isArray(args.args))return command.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').slice(0,1000)||'Running a command';
 let hide=false;
 const values=args.args.map(value=>{const raw=String(value);const text=hide?'[redacted]':redact(raw);hide=/^--?(?:api-key|token|password|secret|authorization)$/i.test(raw);return quote(text)});
 return [quote(command),...values].join(' ').slice(0,1000);
}
