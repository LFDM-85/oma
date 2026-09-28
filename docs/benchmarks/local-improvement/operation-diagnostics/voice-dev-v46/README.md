# v46 voice development

Japanese 2/4, English 4/4. All eight trials completed without cleanup failure;
no critical error was flagged. This is a small development matrix, not final
acceptance and not proof that all PipeWire stalls are resolved.

Japanese document creation, exact text and explicit discard completed, but the
window failed its post-close floating assertion. The following modes scenario
misrecognized the short arithmetic phrase as "一度一度足した数だけを答えて。" and the
assistant requested more information rather than answering the expected arithmetic.
Both remain failed. Japanese farewell/neighbor and all four English scenarios
passed, including the document sequence that previously failed cleanup.

v49 changes the order of compositor restoration and the docked-state signal;
that change is absent from this run. The recognition failure has not been corrected
by transcript rewriting or by altering the audio fixture. No human recordings or
listening ratings are represented here.
