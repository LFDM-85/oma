# v27 preflight failure

No operation was attempted: all 26 slots remain not_run. Switching to the owned
virtual microphone failed with PipeWire no-global / unknown-resource errors.
The harness restored provider, language, microphone and UI model selection and
removed its own virtual modules. No system audio service was restarted.
A subsequent standalone EchoPath startup/close probe succeeded 10/10 times;
this does not prove the original race resolved. The next run is separate and
will preserve this environmental failure rather than overwrite it.
