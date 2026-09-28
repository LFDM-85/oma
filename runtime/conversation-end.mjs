// Playback is paced about 120 ms ahead of the device. Keep a quiet tail margin
// without holding the panel for the remote session-close acknowledgement.
export const farewellQuietMs=700;
export function canFinishConversation(ending,lastSpoken,now=Date.now()){
 return !!ending&&(lastSpoken>(ending.speechAfter??ending.at)||now-ending.at>5000)&&now-lastSpoken>=farewellQuietMs;
}
export function finishConversation(stop,dismiss){const stopped=stop();dismiss();return stopped;}
