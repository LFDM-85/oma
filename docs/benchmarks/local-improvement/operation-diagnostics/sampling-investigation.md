# Sampling investigation (not an achieved improvement)

The frozen v11 agent sends temperature 0.2 and no explicit top_p or presence
penalty. The model metadata lists top_p 0.95 and presence_penalty 1.5, but these
are not necessarily the effective OpenAI-compatible request defaults. Ollama
0.34.4's `FromChatRequest` explicitly supplies top_p 1.0 when omitted; absence of
presence_penalty leaves model options in effect. Record explicit overrides in
future experiments instead of inferring all parameters from the model card.

A no-network interception of the real Pi SDK payload confirmed that reasoning
`off` maps to reasoning_effort `none`, and `low` maps to `low`. Qwen's model
metadata supports boolean thinking, not a distinct low-effort budget. The
llama-server log's `chat template, thinking = 0` is not proof that request-level
thinking is disabled: Ollama supplies its own rendered prompts.

The next development comparison will explicitly use temperature 0.6, top_p
0.95, presence_penalty 0. These are Qwen's published precise-coding thinking
settings. Whether they improve these desktop tasks remains to be measured.
No final results have been re-scored or discarded on that hypothesis.

Sources checked 2026-09-27:
- https://huggingface.co/Qwen/Qwen3.5-4B#best-practices
- https://github.com/ollama/ollama/blob/v0.34.4/openai/openai.go

Upstream reports of repetition or visual regressions are diagnostic leads only,
not proof that the same causes apply here:
- https://github.com/ollama/ollama/issues/17562
- https://github.com/ollama/ollama/issues/17218
