"""Offline wake decision; tolerate name ambiguity only after a clear greeting."""
# English grammar. The distractors give similar calls ("Hey Emma", "Hey Homer",
# "Hey mom") somewhere to land; without them the decoder forces "hey oma".
ENGLISH_WAKE = ('hey oma', 'hey oh ma', 'hey oh mah')
ENGLISH_GRAMMAR = [*ENGLISH_WAKE, 'hey', 'hi', 'hello', 'okay', 'oh', 'my', 'ma', 'mom',
                   'mama', 'emma', 'homer', 'home', 'omar', 'obama', 'oprah', 'alexa',
                   'hmm', '[unk]']

def is_wake(result):
    text = result.get('text', '').replace(' ', '')
    words = result.get('result', [])
    if text not in ('ヘイオーマ', 'ヘイ大間', 'ヘイオマ') or len(words) < 2:
        return False
    confidence = [w.get('conf', 0) for w in words]
    # The observed Japanese call has Hey=1.0, Oma=0.672. Requiring every
    # dictionary token to score 0.8 rejects a correctly recognized name.
    return (words[0].get('word') == 'ヘイ' and confidence[0] >= .85
            and min(confidence[1:]) >= .55
            and sum(confidence) / len(confidence) >= .8)

def is_english_wake(result):
    words = result.get('result', [])
    if result.get('text') not in ENGLISH_WAKE or len(words) < 2:
        return False
    name = [w.get('conf', 0) for w in words[1:]]
    # Synthesized "Hey OH-mah" calls scored the split "oh mah" as low as
    # 0.89/0.45; the distractor grammar, not this threshold, rejects other names.
    return (words[0].get('word') == 'hey' and words[0].get('conf', 0) >= .85
            and min(name) >= .4 and sum(name) / len(name) >= .6)

class EnglishWake:
    """Joins "Hey," and "OH-mah" when a pause splits them into two results."""
    def __init__(self):
        self.greeting = None

    def accept(self, result):
        words = result.get('result', [])
        greeting, self.greeting = self.greeting, None
        if greeting and words and words[0].get('start', 0) - greeting[-1].get('end', 0) <= 1.2:
            joined = greeting + words
            if is_english_wake({'text': ' '.join(w.get('word') for w in joined), 'result': joined}):
                return True
        if result.get('text') == 'hey':
            self.greeting = words
        return is_english_wake(result)
